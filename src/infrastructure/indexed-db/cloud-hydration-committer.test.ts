import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  AttemptHydrationCursor,
  CloudAttemptSnapshot,
  CloudExerciseReviewSnapshot,
  CloudSkillMasterySnapshot,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "../../types/cloud-learning-state";
import type { StoredExerciseReview, StoredSkillMastery } from "../../types/learning-projection";
import { AttemptRepository } from "./attempt-repository";
import { IndexedDbCloudHydrationCommitter } from "./cloud-hydration-committer";
import { CloudHydrationMetadataRepository } from "./cloud-hydration-metadata-repository";
import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "./database";
import { ExerciseReviewRepository } from "./exercise-review-repository";
import { SkillMasteryRepository } from "./skill-mastery-repository";

const DATABASE_NAME = "vim-forge-cloud-hydration-committer-test";
const USER_ID = "user-a";

function cloudAttempt(
  overrides: Partial<CloudAttemptSnapshot> = {},
): CloudAttemptSnapshot {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-20T07:59:00.000Z",
    completedAt: "2026-07-20T08:00:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 3,
    recommendedKeystrokeCount: 3,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [],
    speedScore: 100,
    accuracyScore: 100,
    performanceQuality: 5,
    practiceContext: "different_exercise",
    createdAt: "2026-07-20T08:00:05.000Z",
    ...overrides,
  };
}

function cloudMastery(
  overrides: Partial<CloudSkillMasterySnapshot> = {},
): CloudSkillMasterySnapshot {
  return {
    skillId: "skill-1",
    masteryScore: 78,
    masteryLevel: 4,
    successfulAttempts: 5,
    uniqueExerciseIds: ["exercise-1", "exercise-2"],
    consecutiveSuccesses: 3,
    firstUnhintedSuccessAt: "2026-07-10T08:00:00.000Z",
    latestUnhintedSuccessAt: "2026-07-20T08:00:00.000Z",
    lastAttemptAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...overrides,
  };
}

function cloudReview(
  overrides: Partial<CloudExerciseReviewSnapshot> = {},
): CloudExerciseReviewSnapshot {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 4,
    currentIntervalDays: 7,
    dueAt: "2026-08-03T08:00:00.000Z",
    lastPerformanceQuality: 5,
    lastAttemptAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...overrides,
  };
}

function storedMastery(
  overrides: Partial<StoredSkillMastery> = {},
): StoredSkillMastery {
  return {
    skillId: "skill-1",
    masteryScore: 55,
    masteryLevel: 3,
    successfulAttempts: 3,
    uniqueExerciseIds: ["exercise-1"],
    consecutiveSuccesses: 1,
    firstUnhintedSuccessAt: "2026-07-05T08:00:00.000Z",
    latestUnhintedSuccessAt: "2026-07-15T08:00:00.000Z",
    lastAttemptAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z",
    revision: 3,
    ...overrides,
  };
}

function storedReview(
  overrides: Partial<StoredExerciseReview> = {},
): StoredExerciseReview {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 3,
    currentIntervalDays: 4,
    dueAt: "2026-07-22T00:00:00.000Z",
    lastPerformanceQuality: 4,
    lastAttemptAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z",
    revision: 3,
    ...overrides,
  };
}

const attemptCursor: AttemptHydrationCursor = {
  createdAt: "2026-07-20T08:00:05.000Z",
  clientAttemptId: "attempt-1",
};
const masteryCursor: MasteryHydrationCursor = {
  updatedAt: "2026-07-20T08:00:00.000Z",
  skillId: "skill-1",
};
const reviewCursor: ReviewHydrationCursor = {
  updatedAt: "2026-07-20T08:00:00.000Z",
  exerciseId: "exercise-1",
};

async function seed(
  database: IDBDatabase,
  storeName: string,
  record: unknown,
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);
  await transactionToPromise(transaction);
}

describe("IndexedDbCloudHydrationCommitter", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  describe("captureProjectionRevisions", () => {
    it("returns empty maps when no projections are stored", async () => {
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const snapshot = await committer.captureProjectionRevisions();

      expect(snapshot.masteryBySkillId.size).toBe(0);
      expect(snapshot.reviewsByExerciseId.size).toBe(0);
    });

    it("captures every stored mastery and review revision", async () => {
      await seed(database, "skillMastery", storedMastery());
      await seed(
        database,
        "skillMastery",
        storedMastery({ skillId: "skill-2", revision: 7 }),
      );
      await seed(database, "exerciseReviews", storedReview());
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const snapshot = await committer.captureProjectionRevisions();

      expect(snapshot.masteryBySkillId.get("skill-1")).toBe(3);
      expect(snapshot.masteryBySkillId.get("skill-2")).toBe(7);
      expect(snapshot.reviewsByExerciseId.get("exercise-1")).toBe(3);
    });
  });

  describe("commitAttemptsPage", () => {
    it("inserts a missing attempt as synced", async () => {
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitAttemptsPage({
        userId: USER_ID,
        items: [cloudAttempt()],
        nextCursor: attemptCursor,
      });

      expect(result).toEqual({ inserted: 1, preservedPending: 0 });
      const stored = await new AttemptRepository(database).get("attempt-1");
      expect(stored).toMatchObject({
        clientAttemptId: "attempt-1",
        syncStatus: "synced",
      });
      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .attemptsCursor,
      ).toEqual(attemptCursor);
    });

    it("preserves a pending local attempt untouched", async () => {
      await new AttemptRepository(database).save(
        { ...cloudAttempt(), accuracyScore: 42 },
        "pending",
      );
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitAttemptsPage({
        userId: USER_ID,
        items: [cloudAttempt({ accuracyScore: 100 })],
        nextCursor: attemptCursor,
      });

      expect(result).toEqual({ inserted: 0, preservedPending: 1 });
      const stored = await new AttemptRepository(database).get("attempt-1");
      expect(stored?.syncStatus).toBe("pending");
      expect(stored?.accuracyScore).toBe(42);
    });

    it("does not duplicate or overwrite an already-synced attempt", async () => {
      await new AttemptRepository(database).save(
        { ...cloudAttempt(), accuracyScore: 42 },
        "pending",
      );
      await new AttemptRepository(database).markSynced("attempt-1");
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitAttemptsPage({
        userId: USER_ID,
        items: [cloudAttempt({ accuracyScore: 100 })],
        nextCursor: attemptCursor,
      });

      expect(result).toEqual({ inserted: 0, preservedPending: 0 });
      const stored = await new AttemptRepository(database).get("attempt-1");
      expect(stored?.syncStatus).toBe("synced");
      expect(stored?.accuracyScore).toBe(42);
      expect(await new AttemptRepository(database).listAll()).toHaveLength(1);
    });

    it("is idempotent when the same page is committed twice", async () => {
      const committer = new IndexedDbCloudHydrationCommitter(database);
      const page = {
        userId: USER_ID,
        items: [cloudAttempt()],
        nextCursor: attemptCursor,
      };

      const first = await committer.commitAttemptsPage(page);
      const second = await committer.commitAttemptsPage(page);

      expect(first).toEqual({ inserted: 1, preservedPending: 0 });
      expect(second).toEqual({ inserted: 0, preservedPending: 0 });
      expect(await new AttemptRepository(database).listAll()).toHaveLength(1);
      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .attemptsCursor,
      ).toEqual(attemptCursor);
    });

    it("rolls back the whole page and its cursor when a later attempt fails to write", async () => {
      const committer = new IndexedDbCloudHydrationCommitter(database);

      await expect(
        committer.commitAttemptsPage({
          userId: USER_ID,
          items: [
            cloudAttempt(),
            cloudAttempt({
              clientAttemptId: undefined as unknown as string,
            }),
          ],
          nextCursor: attemptCursor,
        }),
      ).rejects.toThrow();

      expect(await new AttemptRepository(database).listAll()).toHaveLength(0);
      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .attemptsCursor,
      ).toBeNull();
    });
  });

  describe("commitMasteryPage", () => {
    it("applies and increments the revision when it matches exactly", async () => {
      await seed(database, "skillMastery", storedMastery({ revision: 3 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitMasteryPage({
        userId: USER_ID,
        items: [cloudMastery()],
        nextCursor: masteryCursor,
        expectedRevisions: new Map([["skill-1", 3]]),
      });

      expect(result).toEqual({ applied: 1, skippedNewer: 0 });
      const stored = await new SkillMasteryRepository(database).get(
        "skill-1",
      );
      expect(stored?.masteryScore).toBe(78);
      expect(stored?.revision).toBe(4);
    });

    it("skips a remote row when the local revision is already newer", async () => {
      await seed(database, "skillMastery", storedMastery({ revision: 5 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitMasteryPage({
        userId: USER_ID,
        items: [cloudMastery()],
        nextCursor: masteryCursor,
        expectedRevisions: new Map([["skill-1", 3]]),
      });

      expect(result).toEqual({ applied: 0, skippedNewer: 1 });
      const stored = await new SkillMasteryRepository(database).get(
        "skill-1",
      );
      expect(stored?.revision).toBe(5);
      expect(stored?.masteryScore).toBe(55);
    });

    it("aborts when the local revision is behind the expected snapshot", async () => {
      await seed(database, "skillMastery", storedMastery({ revision: 2 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      await expect(
        committer.commitMasteryPage({
          userId: USER_ID,
          items: [cloudMastery()],
          nextCursor: masteryCursor,
          expectedRevisions: new Map([["skill-1", 3]]),
        }),
      ).rejects.toThrow();

      const stored = await new SkillMasteryRepository(database).get(
        "skill-1",
      );
      expect(stored?.revision).toBe(2);
    });

    it("advances the cursor even when the only row is skipped as stale", async () => {
      await seed(database, "skillMastery", storedMastery({ revision: 5 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      await committer.commitMasteryPage({
        userId: USER_ID,
        items: [cloudMastery()],
        nextCursor: masteryCursor,
        expectedRevisions: new Map([["skill-1", 3]]),
      });

      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .masteryCursor,
      ).toEqual(masteryCursor);
    });

    it("rolls back the whole page and its cursor when a later row fails to write", async () => {
      await seed(database, "skillMastery", storedMastery({ revision: 3 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      await expect(
        committer.commitMasteryPage({
          userId: USER_ID,
          items: [
            cloudMastery(),
            cloudMastery({
              skillId: undefined as unknown as string,
            }),
          ],
          nextCursor: masteryCursor,
          expectedRevisions: new Map([["skill-1", 3]]),
        }),
      ).rejects.toThrow();

      const stored = await new SkillMasteryRepository(database).get(
        "skill-1",
      );
      expect(stored?.revision).toBe(3);
      expect(stored?.masteryScore).toBe(55);
      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .masteryCursor,
      ).toBeNull();
    });

    it("keeps a local mastery completion that advanced past the expected snapshot during hydration", async () => {
      // Snapshot captured at the start of hydration: skill-1 was at
      // revision 3. A local attempt completes DURING the download,
      // advancing skill-1 to revision 4 before this page is committed - the
      // remote page (still reflecting revision 3) must not overwrite that
      // newer local completion.
      await seed(
        database,
        "skillMastery",
        storedMastery({ revision: 4, masteryScore: 60 }),
      );
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitMasteryPage({
        userId: USER_ID,
        items: [cloudMastery()],
        nextCursor: masteryCursor,
        expectedRevisions: new Map([["skill-1", 3]]),
      });

      expect(result).toEqual({ applied: 0, skippedNewer: 1 });
      const stored = await new SkillMasteryRepository(database).get(
        "skill-1",
      );
      expect(stored?.revision).toBe(4);
      expect(stored?.masteryScore).toBe(60);
      // The page cursor still advances even when every item in it is
      // skipped as stale - pagination progress and per-item revision
      // guarding are independent concerns.
      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .masteryCursor,
      ).toEqual(masteryCursor);
    });

    it("does not duplicate or re-increment when the same mastery page is replayed", async () => {
      await seed(database, "skillMastery", storedMastery({ revision: 3 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);
      const page = {
        userId: USER_ID,
        items: [cloudMastery()],
        nextCursor: masteryCursor,
        expectedRevisions: new Map([["skill-1", 3]]),
      };

      const first = await committer.commitMasteryPage(page);
      const second = await committer.commitMasteryPage(page);

      expect(first).toEqual({ applied: 1, skippedNewer: 0 });
      expect(second).toEqual({ applied: 0, skippedNewer: 1 });
      const stored = await new SkillMasteryRepository(database).get(
        "skill-1",
      );
      expect(stored?.revision).toBe(4);
      expect(
        await new SkillMasteryRepository(database).listAll(),
      ).toHaveLength(1);
    });
  });

  describe("commitReviewsPage", () => {
    it("applies and increments the revision when it matches exactly", async () => {
      await seed(database, "exerciseReviews", storedReview({ revision: 3 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitReviewsPage({
        userId: USER_ID,
        items: [cloudReview()],
        nextCursor: reviewCursor,
        expectedRevisions: new Map([["exercise-1", 3]]),
      });

      expect(result).toEqual({ applied: 1, skippedNewer: 0 });
      const stored = await new ExerciseReviewRepository(database).get(
        "exercise-1",
      );
      expect(stored?.dueAt).toBe("2026-08-03T08:00:00.000Z");
      expect(stored?.revision).toBe(4);
    });

    it("skips a remote row when the local revision is already newer", async () => {
      await seed(database, "exerciseReviews", storedReview({ revision: 5 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitReviewsPage({
        userId: USER_ID,
        items: [cloudReview()],
        nextCursor: reviewCursor,
        expectedRevisions: new Map([["exercise-1", 3]]),
      });

      expect(result).toEqual({ applied: 0, skippedNewer: 1 });
      const stored = await new ExerciseReviewRepository(database).get(
        "exercise-1",
      );
      expect(stored?.revision).toBe(5);
      expect(stored?.dueAt).toBe("2026-07-22T00:00:00.000Z");
    });

    it("aborts when the local revision is behind the expected snapshot", async () => {
      await seed(database, "exerciseReviews", storedReview({ revision: 2 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      await expect(
        committer.commitReviewsPage({
          userId: USER_ID,
          items: [cloudReview()],
          nextCursor: reviewCursor,
          expectedRevisions: new Map([["exercise-1", 3]]),
        }),
      ).rejects.toThrow();

      const stored = await new ExerciseReviewRepository(database).get(
        "exercise-1",
      );
      expect(stored?.revision).toBe(2);
    });

    it("rolls back the whole page and its cursor when a later review fails to write", async () => {
      await seed(database, "exerciseReviews", storedReview({ revision: 3 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);

      await expect(
        committer.commitReviewsPage({
          userId: USER_ID,
          items: [
            cloudReview(),
            cloudReview({
              exerciseId: undefined as unknown as string,
            }),
          ],
          nextCursor: reviewCursor,
          expectedRevisions: new Map([["exercise-1", 3]]),
        }),
      ).rejects.toThrow();

      const stored = await new ExerciseReviewRepository(database).get(
        "exercise-1",
      );
      expect(stored?.revision).toBe(3);
      expect(stored?.dueAt).toBe("2026-07-22T00:00:00.000Z");
      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .reviewsCursor,
      ).toBeNull();
    });

    it("keeps a local review completion that advanced past the expected snapshot during hydration", async () => {
      await seed(
        database,
        "exerciseReviews",
        storedReview({
          revision: 4,
          dueAt: "2026-07-25T00:00:00.000Z",
        }),
      );
      const committer = new IndexedDbCloudHydrationCommitter(database);

      const result = await committer.commitReviewsPage({
        userId: USER_ID,
        items: [cloudReview()],
        nextCursor: reviewCursor,
        expectedRevisions: new Map([["exercise-1", 3]]),
      });

      expect(result).toEqual({ applied: 0, skippedNewer: 1 });
      const stored = await new ExerciseReviewRepository(database).get(
        "exercise-1",
      );
      expect(stored?.revision).toBe(4);
      expect(stored?.dueAt).toBe("2026-07-25T00:00:00.000Z");
      // The page cursor still advances even when every item in it is
      // skipped as stale - pagination progress and per-item revision
      // guarding are independent concerns.
      expect(
        (await new CloudHydrationMetadataRepository(database).get(USER_ID))
          .reviewsCursor,
      ).toEqual(reviewCursor);
    });

    it("does not duplicate or re-increment when the same review page is replayed", async () => {
      await seed(database, "exerciseReviews", storedReview({ revision: 3 }));
      const committer = new IndexedDbCloudHydrationCommitter(database);
      const page = {
        userId: USER_ID,
        items: [cloudReview()],
        nextCursor: reviewCursor,
        expectedRevisions: new Map([["exercise-1", 3]]),
      };

      const first = await committer.commitReviewsPage(page);
      const second = await committer.commitReviewsPage(page);

      expect(first).toEqual({ applied: 1, skippedNewer: 0 });
      expect(second).toEqual({ applied: 0, skippedNewer: 1 });
      const stored = await new ExerciseReviewRepository(database).get(
        "exercise-1",
      );
      expect(stored?.revision).toBe(4);
      expect(
        await new ExerciseReviewRepository(database).listAll(),
      ).toHaveLength(1);
    });
  });
});
