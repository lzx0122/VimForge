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

export class InconsistentProjectionRevisionError extends Error {}

function hasRevisionSnapshots(
  outcome: StoredLearningOutcome,
): outcome is StoredLearningOutcome & {
  masteryRevisions: NonNullable<StoredLearningOutcome["masteryRevisions"]>;
  reviewRevision: NonNullable<StoredLearningOutcome["reviewRevision"]>;
} {
  return (
    Array.isArray(outcome.masteryRevisions) &&
    typeof outcome.reviewRevision === "number"
  );
}

/**
 * Reconciles a successful remote sync response into local state: the
 * attempt is always marked synced (it really was accepted by the server),
 * but the server's absolute mastery/dueAt values only replace local state
 * when doing so is safe.
 *
 * The version guard is each touched skill/review's *revision*, not a
 * timestamp: every learning outcome stamps masteryRevisions/reviewRevision
 * with the exact revision its own local commit produced (Task 17). A
 * remote response is for that exact snapshot, so:
 *   - local revision === the outcome's snapshot -> nothing has touched the
 *     record since this attempt's local commit; apply the remote value and
 *     advance the revision by exactly one.
 *   - local revision > the snapshot -> a later local attempt has already
 *     advanced the record past what this response reflects (stale,
 *     out-of-order response); discard it rather than regress local state.
 *   - local revision < the snapshot -> the record is missing revisions
 *     that this outcome's own commit should already have produced -
 *     genuinely inconsistent local state, not merely stale. Abort the
 *     whole transaction rather than risk silently corrupting it further.
 * lastAttemptAt is still set when a value is applied (an audit trail), but
 * it is never used as a guard - equal-millisecond completions, clock
 * changes, or imported data can make two different revisions share a
 * timestamp.
 *
 * An attempt with no local learning outcome, or an outcome recorded
 * before revision snapshots existed, is still marked synced - there is
 * simply nothing safe to reconcile the response against, not an error.
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

      // Nothing local to safely reconcile against: no learning outcome at
      // all (a path that predates or bypasses the local projection
      // commit), an outcome from before revision snapshots existed, or
      // this exact attempt's response was already reconciled by an
      // earlier call (re-applying it would double-increment revisions).
      // Either way the attempt is still (idempotently) marked synced
      // above; there is nothing else to do.
      if (
        existingOutcome === undefined ||
        existingOutcome.projectionSource === "remote" ||
        !hasRevisionSnapshots(existingOutcome)
      ) {
        await completion;
        return;
      }

      const attemptCompletedAt = existingOutcome.completedAt;
      const nowIso = this.now().toISOString();
      let appliedRemoteData = false;

      const masteryRevisionBySkillId = new Map(
        existingOutcome.masteryRevisions.map((entry) => [
          entry.skillId,
          entry.revision,
        ]),
      );

      const masteryStore = transaction.objectStore(
        INDEXED_DB_STORES.skillMastery,
      );
      for (const remoteSkill of input.result.mastery) {
        const expectedRevision = masteryRevisionBySkillId.get(
          remoteSkill.skillId,
        );
        if (expectedRevision === undefined) {
          // The server reported a skill this attempt's local commit never
          // recorded a revision snapshot for - nothing to check against.
          continue;
        }

        const localMastery = await requestToPromise<
          StoredSkillMastery | undefined
        >(masteryStore.get(remoteSkill.skillId));
        const localRevision = localMastery?.revision ?? 0;

        if (localRevision > expectedRevision) {
          continue;
        }
        if (localRevision < expectedRevision) {
          throw new InconsistentProjectionRevisionError(
            `Local mastery revision for skill ${remoteSkill.skillId} (${localRevision}) is behind the revision (${expectedRevision}) attempt ${input.clientAttemptId}'s own local commit already produced.`,
          );
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
          revision: expectedRevision + 1,
        } satisfies StoredSkillMastery);
        appliedRemoteData = true;
      }

      if (input.result.dueAt !== null) {
        const expectedReviewRevision = existingOutcome.reviewRevision;
        const reviewStore = transaction.objectStore(
          INDEXED_DB_STORES.exerciseReviews,
        );
        const localReview = await requestToPromise<
          StoredExerciseReview | undefined
        >(reviewStore.get(input.exerciseId));
        const localReviewRevision = localReview?.revision ?? 0;

        if (localReviewRevision < expectedReviewRevision) {
          throw new InconsistentProjectionRevisionError(
            `Local review revision for exercise ${input.exerciseId} (${localReviewRevision}) is behind the revision (${expectedReviewRevision}) attempt ${input.clientAttemptId}'s own local commit already produced.`,
          );
        }

        if (localReviewRevision === expectedReviewRevision) {
          reviewStore.put({
            exerciseId: input.exerciseId,
            masteryLevel: localReview?.masteryLevel ?? 0,
            currentIntervalDays: localReview?.currentIntervalDays ?? 0,
            dueAt: input.result.dueAt,
            lastPerformanceQuality: localReview?.lastPerformanceQuality ?? 0,
            lastAttemptAt: attemptCompletedAt,
            updatedAt: nowIso,
            revision: expectedReviewRevision + 1,
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
