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
