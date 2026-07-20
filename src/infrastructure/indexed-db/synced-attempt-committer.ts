import type { AttemptSyncResult } from "../../features/practice/repositories/attempt-sync-repository";
import type {
  StoredExerciseReview,
  StoredLearningOutcome,
  StoredSkillMastery,
} from "../../types/learning-projection";
import type { StoredAttempt } from "./attempt-repository";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

export interface SyncedAttemptCommitInput {
  clientAttemptId: string;
  exerciseId: string;
  result: AttemptSyncResult;
}

export interface SyncedAttemptCommitter {
  commit(input: SyncedAttemptCommitInput): Promise<void>;
}

/**
 * Reconciles a successful remote sync response into local state: the
 * attempt is always marked synced (it really was accepted by the server),
 * but the server's absolute mastery/dueAt values only replace local state
 * when they are not stale. Staleness is judged the same way for both,
 * against the touched record's lastAttemptAt: since Task 19's local commit
 * already sets skillMastery/exerciseReviews lastAttemptAt to this exact
 * attempt's completedAt before it is ever queued for sync, a strictly
 * *newer* lastAttemptAt on the stored record means a later local attempt
 * has since advanced past what this response reflects (a stale, out-of-
 * order response), so its snapshot is discarded rather than regressing
 * local state backward. An equal or older lastAttemptAt is the normal
 * (or first-application) case and is applied.
 *
 * An attempt with no local learning outcome (recorded through a path that
 * predates or bypasses the local projection commit) is still marked
 * synced - there is simply nothing local to reconcile the response
 * against, not an error.
 */
export class IndexedDbSyncedAttemptCommitter implements SyncedAttemptCommitter {
  public constructor(
    private readonly database: IDBDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async commit(input: SyncedAttemptCommitInput): Promise<void> {
    const transaction = this.database.transaction(
      [
        INDEXED_DB_STORES.attempts,
        INDEXED_DB_STORES.skillMastery,
        INDEXED_DB_STORES.exerciseReviews,
        INDEXED_DB_STORES.learningOutcomes,
      ],
      "readwrite",
    );
    const completion = transactionToPromise(transaction);

    try {
      const attemptsStore = transaction.objectStore(
        INDEXED_DB_STORES.attempts,
      );
      const existingAttempt = await requestToPromise<
        StoredAttempt | undefined
      >(attemptsStore.get(input.clientAttemptId));
      if (existingAttempt === undefined) {
        throw new Error(
          `No local attempt found for ${input.clientAttemptId}.`,
        );
      }

      const outcomesStore = transaction.objectStore(
        INDEXED_DB_STORES.learningOutcomes,
      );
      const existingOutcome = await requestToPromise<
        StoredLearningOutcome | undefined
      >(outcomesStore.get(input.clientAttemptId));

      if (existingAttempt.syncStatus !== "synced") {
        attemptsStore.put({
          ...existingAttempt,
          syncStatus: "synced",
        } satisfies StoredAttempt);
      }

      // Nothing local to reconcile against: either this attempt has no
      // learning outcome at all (recorded through a path that predates or
      // bypasses the local projection commit, e.g. legacy data), or this
      // exact attempt's remote response was already reconciled by an
      // earlier call (re-applying it would double-increment mastery and
      // review revisions). Either way the attempt is still (idempotently)
      // marked synced above; there is nothing else to do.
      if (
        existingOutcome === undefined ||
        existingOutcome.projectionSource === "remote"
      ) {
        await completion;
        return;
      }

      const attemptCompletedAt = existingOutcome.completedAt;
      const nowIso = this.now().toISOString();
      let appliedRemoteData = false;

      const masteryStore = transaction.objectStore(
        INDEXED_DB_STORES.skillMastery,
      );
      for (const remoteSkill of input.result.mastery) {
        const localMastery = await requestToPromise<
          StoredSkillMastery | undefined
        >(masteryStore.get(remoteSkill.skillId));
        const isStale =
          localMastery !== undefined &&
          localMastery.lastAttemptAt > attemptCompletedAt;
        if (isStale) {
          continue;
        }

        masteryStore.put({
          skillId: remoteSkill.skillId,
          masteryScore: remoteSkill.masteryScore,
          masteryLevel: remoteSkill.masteryLevel,
          successfulAttempts: localMastery?.successfulAttempts ?? 0,
          uniqueExerciseIds: localMastery?.uniqueExerciseIds ?? [],
          consecutiveSuccesses: localMastery?.consecutiveSuccesses ?? 0,
          firstUnhintedSuccessAt: localMastery?.firstUnhintedSuccessAt ?? null,
          latestUnhintedSuccessAt:
            localMastery?.latestUnhintedSuccessAt ?? null,
          lastAttemptAt: attemptCompletedAt,
          updatedAt: nowIso,
          revision: (localMastery?.revision ?? 0) + 1,
        } satisfies StoredSkillMastery);
        appliedRemoteData = true;
      }

      if (input.result.dueAt !== null) {
        const reviewStore = transaction.objectStore(
          INDEXED_DB_STORES.exerciseReviews,
        );
        const localReview = await requestToPromise<
          StoredExerciseReview | undefined
        >(reviewStore.get(input.exerciseId));
        const isStale =
          localReview !== undefined &&
          localReview.lastAttemptAt > attemptCompletedAt;

        if (!isStale) {
          reviewStore.put({
            exerciseId: input.exerciseId,
            masteryLevel: localReview?.masteryLevel ?? 0,
            currentIntervalDays: localReview?.currentIntervalDays ?? 0,
            dueAt: input.result.dueAt,
            lastPerformanceQuality: localReview?.lastPerformanceQuality ?? 0,
            lastAttemptAt: attemptCompletedAt,
            updatedAt: nowIso,
            revision: (localReview?.revision ?? 0) + 1,
          } satisfies StoredExerciseReview);
          appliedRemoteData = true;
        }
      }

      // existingOutcome.projectionSource is provably "local" here: the
      // "remote" case already returned above.
      if (appliedRemoteData) {
        outcomesStore.put({
          ...existingOutcome,
          projectionSource: "remote",
        } satisfies StoredLearningOutcome);
      }
    } catch (error: unknown) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }

    await completion;
  }
}
