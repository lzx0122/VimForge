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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function attemptPayloadsMatch(
  existing: StoredAttempt,
  incoming: AttemptSyncInput,
): boolean {
  const existingPayload = Object.fromEntries(
    Object.entries(existing).filter(([key]) => key !== "syncStatus"),
  );
  return stableStringify(existingPayload) === stableStringify(incoming);
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
    } else if (!attemptPayloadsMatch(existingAttempt, input.attempt)) {
      throw new AttemptConflictError(
        `Attempt ${input.attempt.clientAttemptId} already exists with a different payload.`,
      );
    }

    transaction
      .objectStore(INDEXED_DB_STORES.sessions)
      .put(toStoredSession(input.session, input.attemptDraft));
  } catch (error: unknown) {
    transaction.abort();
    await completion.catch(() => undefined);
    throw error;
  }

  await completion;
}
