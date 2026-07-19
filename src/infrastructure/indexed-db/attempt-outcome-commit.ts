import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type { AttemptDraft } from "../../types/attempt";
import type { PracticeSession } from "../../types/session";
import type { AttemptSyncStatus, StoredAttempt } from "./attempt-repository";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";
import { toStoredSession } from "./session-repository";

export interface CommitAttemptOutcomeInput {
  attempt: AttemptSyncInput;
  syncStatus?: AttemptSyncStatus;
  session: PracticeSession;
  attemptDraft: AttemptDraft | null;
}

export class AttemptConflictError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Object.is-based structural equality. Deliberately avoids a
 * JSON.stringify shortcut: JSON collapses NaN to null, treats -0 and 0
 * identically, drops undefined object properties, and can't distinguish
 * a sparse array hole from an explicit undefined element.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let index = 0; index < a.length; index += 1) {
      const hasA = index in a;
      const hasB = index in b;
      if (hasA !== hasB) {
        return false;
      }
      if (hasA && !deepEqual(a[index], b[index])) {
        return false;
      }
    }

    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }

    return keysA.every(
      (key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]),
    );
  }

  return false;
}

function attemptPayloadsMatch(
  existing: StoredAttempt,
  incoming: AttemptSyncInput,
): boolean {
  const existingPayload = Object.fromEntries(
    Object.entries(existing).filter(([key]) => key !== "syncStatus"),
  );
  return deepEqual(existingPayload, incoming);
}

export async function commitAttemptOutcome(
  database: IDBDatabase,
  input: CommitAttemptOutcomeInput,
): Promise<void> {
  const transaction = database.transaction(
    [INDEXED_DB_STORES.attempts, INDEXED_DB_STORES.sessions],
    "readwrite",
  );
  const completion = transactionToPromise(transaction);

  try {
    const attemptsStore = transaction.objectStore(INDEXED_DB_STORES.attempts);
    const existingAttempt = await requestToPromise<StoredAttempt | undefined>(
      attemptsStore.get(input.attempt.clientAttemptId),
    );

    if (existingAttempt === undefined) {
      attemptsStore.add({
        ...input.attempt,
        syncStatus: input.syncStatus ?? "pending",
      } satisfies StoredAttempt);
      transaction
        .objectStore(INDEXED_DB_STORES.sessions)
        .put(toStoredSession(input.session, input.attemptDraft));
    } else if (!attemptPayloadsMatch(existingAttempt, input.attempt)) {
      throw new AttemptConflictError(
        `Attempt ${input.attempt.clientAttemptId} already exists with a different payload.`,
      );
    }
    // else: identical duplicate of an already-committed attempt — the whole
    // transaction is a no-op, so a stale resubmission can't rewrite the
    // session or draft that a later, already-processed commit moved past.
  } catch (error: unknown) {
    transaction.abort();
    await completion.catch(() => undefined);
    throw error;
  }

  await completion;
}
