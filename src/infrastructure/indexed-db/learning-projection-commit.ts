import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type { AttemptDraft } from "../../types/attempt";
import type {
  StoredExerciseReview,
  StoredLearningOutcome,
  StoredSkillMastery,
} from "../../types/learning-projection";
import type { PracticeSession } from "../../types/session";
import {
  AttemptConflictError,
  attemptPayloadsMatch,
} from "./attempt-outcome-commit";
import type { AttemptSyncStatus, StoredAttempt } from "./attempt-repository";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";
import { toStoredSession } from "./session-repository";

export interface CommitLearningProjectionInput {
  attempt: AttemptSyncInput;
  syncStatus?: AttemptSyncStatus;
  session: PracticeSession;
  attemptDraft: AttemptDraft | null;
  masteryUpdates: readonly StoredSkillMastery[];
  reviewUpdate: StoredExerciseReview;
  learningOutcome: StoredLearningOutcome;
}

export { AttemptConflictError };

/**
 * Commits an attempt together with its full local learning projection
 * (mastery, review, outcome) in one transaction, so the projection can
 * never be recorded without its attempt or vice versa. Mirrors
 * commitAttemptOutcome()'s duplicate/conflict rule via the same
 * attemptPayloadsMatch(): an identical clientAttemptId resubmission is a
 * whole-transaction no-op (the projection was already applied by the first
 * commit and must not be re-applied), and a conflicting payload under the
 * same id throws instead of silently overwriting it.
 */
export async function commitLearningProjection(
  database: IDBDatabase,
  input: CommitLearningProjectionInput,
): Promise<"created" | "duplicate"> {
  const transaction = database.transaction(
    [
      INDEXED_DB_STORES.attempts,
      INDEXED_DB_STORES.sessions,
      INDEXED_DB_STORES.skillMastery,
      INDEXED_DB_STORES.exerciseReviews,
      INDEXED_DB_STORES.learningOutcomes,
    ],
    "readwrite",
  );
  const completion = transactionToPromise(transaction);

  let outcome: "created" | "duplicate";
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

      const masteryStore = transaction.objectStore(
        INDEXED_DB_STORES.skillMastery,
      );
      for (const masteryUpdate of input.masteryUpdates) {
        masteryStore.put(masteryUpdate);
      }
      transaction
        .objectStore(INDEXED_DB_STORES.exerciseReviews)
        .put(input.reviewUpdate);
      transaction
        .objectStore(INDEXED_DB_STORES.learningOutcomes)
        .put(input.learningOutcome);

      outcome = "created";
    } else if (!attemptPayloadsMatch(existingAttempt, input.attempt)) {
      throw new AttemptConflictError(
        `Attempt ${input.attempt.clientAttemptId} already exists with a different payload.`,
      );
    } else {
      // Identical duplicate of an already-committed attempt: the whole
      // transaction is a no-op, so a stale resubmission can't re-apply a
      // projection that a later, already-processed commit moved past.
      outcome = "duplicate";
    }
  } catch (error: unknown) {
    transaction.abort();
    await completion.catch(() => undefined);
    throw error;
  }

  await completion;
  return outcome;
}
