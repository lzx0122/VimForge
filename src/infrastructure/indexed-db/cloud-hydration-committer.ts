import type {
  AttemptHydrationCursor,
  CloudAttemptSnapshot,
  CloudExerciseReviewSnapshot,
  CloudHydrationMetadata,
  CloudSkillMasterySnapshot,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "../../types/cloud-learning-state";
import type { StoredExerciseReview, StoredSkillMastery } from "../../types/learning-projection";
import type { StoredAttempt } from "./attempt-repository";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

const CLOUD_HYDRATION_KEY = "cloud-hydration" as const;

export interface ProjectionRevisionSnapshot {
  masteryBySkillId: ReadonlyMap<string, number>;
  reviewsByExerciseId: ReadonlyMap<string, number>;
}

export interface CommitAttemptsPageInput {
  userId: string;
  items: readonly CloudAttemptSnapshot[];
  nextCursor: AttemptHydrationCursor | null;
}

export interface CommitAttemptsPageResult {
  inserted: number;
  preservedPending: number;
}

export interface CommitMasteryPageInput {
  userId: string;
  items: readonly CloudSkillMasterySnapshot[];
  nextCursor: MasteryHydrationCursor | null;
  expectedRevisions: ReadonlyMap<string, number>;
}

export interface CommitReviewsPageInput {
  userId: string;
  items: readonly CloudExerciseReviewSnapshot[];
  nextCursor: ReviewHydrationCursor | null;
  expectedRevisions: ReadonlyMap<string, number>;
}

export interface CommitProjectionPageResult {
  applied: number;
  skippedNewer: number;
}

function emptyMetadata(userId: string): CloudHydrationMetadata {
  return {
    key: CLOUD_HYDRATION_KEY,
    userId,
    attemptsCursor: null,
    masteryCursor: null,
    reviewsCursor: null,
    completedAt: null,
    schemaVersion: 1,
  };
}

/**
 * Reads the current cloud hydration metadata record within the caller's
 * own transaction and writes back only the requested cursor field, so the
 * cursor commits atomically with the page's own data writes - a resumed
 * or replayed page can never persist data without also persisting the
 * cursor that would skip it next time, or vice versa.
 */
async function mergeCursor(
  metadataStore: IDBObjectStore,
  userId: string,
  patch: Partial<
    Pick<
      CloudHydrationMetadata,
      "attemptsCursor" | "masteryCursor" | "reviewsCursor"
    >
  >,
): Promise<void> {
  const stored = await requestToPromise<CloudHydrationMetadata | undefined>(
    metadataStore.get(CLOUD_HYDRATION_KEY),
  );
  const current = stored ?? emptyMetadata(userId);

  metadataStore.put({
    ...current,
    userId,
    ...patch,
  } satisfies CloudHydrationMetadata);
}

/**
 * Applies remote projection pages (mastery, reviews) atomically against a
 * revision baseline captured once before hydration began - not applying
 * the page revealed the "commit downloaded pages atomically with revision
 * guards" contract in Task 20. See the revision rule in the Task 20 plan:
 * equal applies and advances by one, greater is skipped as stale (a local
 * attempt outpaced this snapshot), lower is an invariant violation that
 * aborts the whole page.
 */
async function applyProjectionRevisionGuard(
  currentRevision: number,
  expectedRevision: number,
  itemId: string,
  storeLabel: string,
): Promise<{ apply: boolean; nextRevision: number }> {
  if (currentRevision > expectedRevision) {
    return { apply: false, nextRevision: currentRevision };
  }
  if (currentRevision < expectedRevision) {
    throw new Error(
      `Local ${storeLabel} revision for ${itemId} (${currentRevision}) is behind the expected revision (${expectedRevision}).`,
    );
  }
  return { apply: true, nextRevision: currentRevision + 1 };
}

/**
 * Commits downloaded cloud hydration pages into the local IndexedDB
 * database. Every page commits its data writes and its own cursor field
 * together in one transaction, so a partial failure never leaves a cursor
 * pointing past data that was never actually written.
 */
export class IndexedDbCloudHydrationCommitter {
  public constructor(private readonly database: IDBDatabase) {}

  public async captureProjectionRevisions(): Promise<ProjectionRevisionSnapshot> {
    const transaction = this.database.transaction(
      [INDEXED_DB_STORES.skillMastery, INDEXED_DB_STORES.exerciseReviews],
      "readonly",
    );

    const masteryRecords = await requestToPromise<StoredSkillMastery[]>(
      transaction.objectStore(INDEXED_DB_STORES.skillMastery).getAll(),
    );
    const reviewRecords = await requestToPromise<StoredExerciseReview[]>(
      transaction.objectStore(INDEXED_DB_STORES.exerciseReviews).getAll(),
    );

    return {
      masteryBySkillId: new Map(
        masteryRecords.map((record) => [record.skillId, record.revision]),
      ),
      reviewsByExerciseId: new Map(
        reviewRecords.map((record) => [record.exerciseId, record.revision]),
      ),
    };
  }

  public async commitAttemptsPage(
    input: CommitAttemptsPageInput,
  ): Promise<CommitAttemptsPageResult> {
    const transaction = this.database.transaction(
      [INDEXED_DB_STORES.attempts, INDEXED_DB_STORES.metadata],
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const attemptsStore = transaction.objectStore(INDEXED_DB_STORES.attempts);
    const metadataStore = transaction.objectStore(
      INDEXED_DB_STORES.metadata,
    );

    let inserted = 0;
    let preservedPending = 0;

    try {
      for (const item of input.items) {
        const existing = await requestToPromise<StoredAttempt | undefined>(
          attemptsStore.get(item.clientAttemptId),
        );

        if (existing === undefined) {
          attemptsStore.add({
            clientAttemptId: item.clientAttemptId,
            sessionId: item.sessionId,
            exerciseId: item.exerciseId,
            exerciseVersion: item.exerciseVersion,
            learningMode: item.learningMode,
            source: item.source,
            completed: item.completed,
            startedAt: item.startedAt,
            completedAt: item.completedAt,
            durationMs: item.durationMs,
            keystrokeCount: item.keystrokeCount,
            recommendedKeystrokeCount: item.recommendedKeystrokeCount,
            mistakeCount: item.mistakeCount,
            undoCount: item.undoCount,
            resetCount: item.resetCount,
            highestHintLevel: item.highestHintLevel,
            usedRecommendedSolution: item.usedRecommendedSolution,
            normalizedActions: item.normalizedActions,
            speedScore: item.speedScore,
            accuracyScore: item.accuracyScore,
            performanceQuality: item.performanceQuality,
            practiceContext: item.practiceContext,
            syncStatus: "synced",
          } satisfies StoredAttempt);
          inserted += 1;
        } else if (existing.syncStatus === "pending") {
          preservedPending += 1;
        }
      }

      await mergeCursor(metadataStore, input.userId, {
        attemptsCursor: input.nextCursor,
      });
    } catch (error: unknown) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }

    await completion;
    return { inserted, preservedPending };
  }

  public async commitMasteryPage(
    input: CommitMasteryPageInput,
  ): Promise<CommitProjectionPageResult> {
    const transaction = this.database.transaction(
      [INDEXED_DB_STORES.skillMastery, INDEXED_DB_STORES.metadata],
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const masteryStore = transaction.objectStore(
      INDEXED_DB_STORES.skillMastery,
    );
    const metadataStore = transaction.objectStore(
      INDEXED_DB_STORES.metadata,
    );

    let applied = 0;
    let skippedNewer = 0;

    try {
      for (const item of input.items) {
        const expectedRevision =
          input.expectedRevisions.get(item.skillId) ?? 0;
        const existing = await requestToPromise<
          StoredSkillMastery | undefined
        >(masteryStore.get(item.skillId));
        const currentRevision = existing?.revision ?? 0;

        const guard = await applyProjectionRevisionGuard(
          currentRevision,
          expectedRevision,
          item.skillId,
          "mastery",
        );
        if (!guard.apply) {
          skippedNewer += 1;
          continue;
        }

        masteryStore.put({
          skillId: item.skillId,
          masteryScore: item.masteryScore,
          masteryLevel: item.masteryLevel,
          successfulAttempts: item.successfulAttempts,
          uniqueExerciseIds: item.uniqueExerciseIds,
          consecutiveSuccesses: item.consecutiveSuccesses,
          firstUnhintedSuccessAt: item.firstUnhintedSuccessAt,
          latestUnhintedSuccessAt: item.latestUnhintedSuccessAt,
          lastAttemptAt: item.lastAttemptAt,
          updatedAt: item.updatedAt,
          revision: guard.nextRevision,
        } satisfies StoredSkillMastery);
        applied += 1;
      }

      await mergeCursor(metadataStore, input.userId, {
        masteryCursor: input.nextCursor,
      });
    } catch (error: unknown) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }

    await completion;
    return { applied, skippedNewer };
  }

  public async commitReviewsPage(
    input: CommitReviewsPageInput,
  ): Promise<CommitProjectionPageResult> {
    const transaction = this.database.transaction(
      [INDEXED_DB_STORES.exerciseReviews, INDEXED_DB_STORES.metadata],
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const reviewStore = transaction.objectStore(
      INDEXED_DB_STORES.exerciseReviews,
    );
    const metadataStore = transaction.objectStore(
      INDEXED_DB_STORES.metadata,
    );

    let applied = 0;
    let skippedNewer = 0;

    try {
      for (const item of input.items) {
        const expectedRevision =
          input.expectedRevisions.get(item.exerciseId) ?? 0;
        const existing = await requestToPromise<
          StoredExerciseReview | undefined
        >(reviewStore.get(item.exerciseId));
        const currentRevision = existing?.revision ?? 0;

        const guard = await applyProjectionRevisionGuard(
          currentRevision,
          expectedRevision,
          item.exerciseId,
          "review",
        );
        if (!guard.apply) {
          skippedNewer += 1;
          continue;
        }

        reviewStore.put({
          exerciseId: item.exerciseId,
          masteryLevel: item.masteryLevel,
          currentIntervalDays: item.currentIntervalDays,
          dueAt: item.dueAt,
          lastPerformanceQuality: item.lastPerformanceQuality,
          lastAttemptAt: item.lastAttemptAt,
          updatedAt: item.updatedAt,
          revision: guard.nextRevision,
        } satisfies StoredExerciseReview);
        applied += 1;
      }

      await mergeCursor(metadataStore, input.userId, {
        reviewsCursor: input.nextCursor,
      });
    } catch (error: unknown) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }

    await completion;
    return { applied, skippedNewer };
  }
}
