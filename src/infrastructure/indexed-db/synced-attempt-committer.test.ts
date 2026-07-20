import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AttemptSyncResult } from "../../features/practice/repositories/attempt-sync-repository";
import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type {
  StoredExerciseReview,
  StoredLearningOutcome,
  StoredSkillMastery,
} from "../../types/learning-projection";
import { AttemptRepository } from "./attempt-repository";
import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "./database";
import { ExerciseReviewRepository } from "./exercise-review-repository";
import { LearningOutcomeRepository } from "./learning-outcome-repository";
import { SkillMasteryRepository } from "./skill-mastery-repository";
import {
  IndexedDbSyncedAttemptCommitter,
  InconsistentProjectionRevisionError,
} from "./synced-attempt-committer";

const DATABASE_NAME = "vim-forge-synced-attempt-committer-test";
const NOW = new Date("2026-07-20T09:00:00.000Z");

function attempt(overrides: Partial<AttemptSyncInput> = {}): AttemptSyncInput {
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
    ...overrides,
  };
}

function mastery(overrides: Partial<StoredSkillMastery> = {}): StoredSkillMastery {
  return {
    skillId: "skill-1",
    masteryScore: 62,
    masteryLevel: 3,
    successfulAttempts: 4,
    uniqueExerciseIds: ["exercise-1"],
    consecutiveSuccesses: 2,
    firstUnhintedSuccessAt: "2026-07-10T08:00:00.000Z",
    latestUnhintedSuccessAt: "2026-07-20T08:00:00.000Z",
    lastAttemptAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    revision: 4,
    ...overrides,
  };
}

function review(overrides: Partial<StoredExerciseReview> = {}): StoredExerciseReview {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 3,
    currentIntervalDays: 7,
    dueAt: "2026-07-27T08:00:00.000Z",
    lastPerformanceQuality: 5,
    lastAttemptAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    revision: 4,
    ...overrides,
  };
}

function outcome(overrides: Partial<StoredLearningOutcome> = {}): StoredLearningOutcome {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    completedAt: "2026-07-20T08:00:00.000Z",
    skillChanges: [
      {
        skillId: "skill-1",
        previousScore: 55,
        nextScore: 62,
        previousLevel: 2,
        nextLevel: 3,
        delta: 7,
      },
    ],
    masteryRevisions: [{ skillId: "skill-1", revision: 4 }],
    reviewRevision: 4,
    previousDueAt: "2026-07-13T08:00:00.000Z",
    nextDueAt: "2026-07-27T08:00:00.000Z",
    projectionSource: "local",
    ...overrides,
  };
}

function syncResult(overrides: Partial<AttemptSyncResult> = {}): AttemptSyncResult {
  return {
    attemptId: "attempt-1",
    mastery: [{ skillId: "skill-1", masteryLevel: 4, masteryScore: 78 }],
    dueAt: "2026-08-03T08:00:00.000Z",
    ...overrides,
  };
}

async function seed(
  database: IDBDatabase,
  storeName: string,
  record: unknown,
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);
  await transactionToPromise(transaction);
}

async function seedCommittedAttempt(
  database: IDBDatabase,
  overrides: {
    attempt?: Partial<AttemptSyncInput>;
    mastery?: Partial<StoredSkillMastery>;
    review?: Partial<StoredExerciseReview>;
    outcome?: Partial<StoredLearningOutcome>;
  } = {},
): Promise<void> {
  await new AttemptRepository(database).save(
    attempt(overrides.attempt),
    "pending",
  );
  await seed(database, "skillMastery", mastery(overrides.mastery));
  await seed(database, "exerciseReviews", review(overrides.review));
  await seed(database, "learningOutcomes", outcome(overrides.outcome));
}

describe("IndexedDbSyncedAttemptCommitter", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  it("marks the local attempt as synced", async () => {
    await seedCommittedAttempt(database);
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult(),
    });

    const stored = await new AttemptRepository(database).get("attempt-1");
    expect(stored?.syncStatus).toBe("synced");
  });

  it("replaces local mastery with the remote's absolute score and level when the revision matches exactly", async () => {
    await seedCommittedAttempt(database);
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult({
        mastery: [{ skillId: "skill-1", masteryLevel: 4, masteryScore: 78 }],
      }),
    });

    const stored = await new SkillMasteryRepository(database).get("skill-1");
    expect(stored?.masteryScore).toBe(78);
    expect(stored?.masteryLevel).toBe(4);
    expect(stored?.revision).toBe(5);
  });

  it("replaces the local review's due date when the revision matches exactly", async () => {
    await seedCommittedAttempt(database);
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult({ dueAt: "2026-08-03T08:00:00.000Z" }),
    });

    const stored = await new ExerciseReviewRepository(database).get(
      "exercise-1",
    );
    expect(stored?.dueAt).toBe("2026-08-03T08:00:00.000Z");
    expect(stored?.revision).toBe(5);
  });

  it("marks the learning outcome's projection source as remote once applied", async () => {
    await seedCommittedAttempt(database);
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult(),
    });

    const stored = await new LearningOutcomeRepository(database).get(
      "attempt-1",
    );
    expect(stored?.projectionSource).toBe("remote");
  });

  it("does not double-increment mastery or review revisions on a repeat commit", async () => {
    await seedCommittedAttempt(database);
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);
    const input = {
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult(),
    };

    await committer.commit(input);
    await committer.commit(input);

    const masteryRepository = new SkillMasteryRepository(database);
    const reviewRepository = new ExerciseReviewRepository(database);
    expect((await masteryRepository.get("skill-1"))?.revision).toBe(5);
    expect((await reviewRepository.get("exercise-1"))?.revision).toBe(5);
  });

  it("does not overwrite mastery with a strictly newer local revision, even when lastAttemptAt is identical", async () => {
    // A later local attempt (Task 19) has already advanced skill-1's
    // mastery to revision 6, but happens to share attempt-1's exact
    // completedAt timestamp (equal-millisecond completion, a device clock
    // change, or imported data). A timestamp-only guard would wrongly
    // treat this as "not newer" and overwrite it; the revision must not.
    await seedCommittedAttempt(database, {
      mastery: { revision: 6, lastAttemptAt: "2026-07-20T08:00:00.000Z" },
    });
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult(),
    });

    const stored = await new SkillMasteryRepository(database).get("skill-1");
    expect(stored?.masteryScore).toBe(62);
    expect(stored?.revision).toBe(6);
  });

  it("does not overwrite the review with a strictly newer local revision, even when lastAttemptAt is identical", async () => {
    await seedCommittedAttempt(database, {
      review: { revision: 6, lastAttemptAt: "2026-07-20T08:00:00.000Z" },
    });
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult(),
    });

    const stored = await new ExerciseReviewRepository(database).get(
      "exercise-1",
    );
    expect(stored?.dueAt).toBe("2026-07-27T08:00:00.000Z");
    expect(stored?.revision).toBe(6);
  });

  it("still marks the stale attempt as synced and leaves its outcome as local", async () => {
    await seedCommittedAttempt(database, {
      mastery: { revision: 6, lastAttemptAt: "2026-07-20T08:00:00.000Z" },
      review: { revision: 6, lastAttemptAt: "2026-07-20T08:00:00.000Z" },
    });
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult(),
    });

    expect(
      (await new AttemptRepository(database).get("attempt-1"))?.syncStatus,
    ).toBe("synced");
    expect(
      (await new LearningOutcomeRepository(database).get("attempt-1"))
        ?.projectionSource,
    ).toBe("local");
  });

  it("aborts the whole transaction when the local mastery revision is behind the outcome's snapshot", async () => {
    // Genuinely inconsistent local state: this outcome's own local commit
    // should already have produced mastery revision 4, but the stored
    // mastery record is somehow at revision 2.
    await seedCommittedAttempt(database, { mastery: { revision: 2 } });
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await expect(
      committer.commit({
        clientAttemptId: "attempt-1",
        exerciseId: "exercise-1",
        result: syncResult(),
      }),
    ).rejects.toThrow(InconsistentProjectionRevisionError);

    expect(
      (await new AttemptRepository(database).get("attempt-1"))?.syncStatus,
    ).toBe("pending");
    expect(
      (await new SkillMasteryRepository(database).get("skill-1"))?.revision,
    ).toBe(2);
    expect(
      (await new ExerciseReviewRepository(database).get("exercise-1"))
        ?.revision,
    ).toBe(4);
    expect(
      (await new LearningOutcomeRepository(database).get("attempt-1"))
        ?.projectionSource,
    ).toBe("local");
  });

  it("aborts the whole transaction when the local review revision is behind the outcome's snapshot", async () => {
    await seedCommittedAttempt(database, { review: { revision: 2 } });
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await expect(
      committer.commit({
        clientAttemptId: "attempt-1",
        exerciseId: "exercise-1",
        result: syncResult(),
      }),
    ).rejects.toThrow(InconsistentProjectionRevisionError);

    expect(
      (await new AttemptRepository(database).get("attempt-1"))?.syncStatus,
    ).toBe("pending");
    expect(
      (await new SkillMasteryRepository(database).get("skill-1"))?.revision,
    ).toBe(4);
    expect(
      (await new ExerciseReviewRepository(database).get("exercise-1"))
        ?.revision,
    ).toBe(2);
  });

  it("marks a legacy outcome's attempt as synced without touching mastery or review, when the outcome has no revision snapshots", async () => {
    await new AttemptRepository(database).save(attempt(), "pending");
    await seed(database, "skillMastery", mastery());
    await seed(database, "exerciseReviews", review());
    const legacyOutcome = { ...outcome() } as Partial<StoredLearningOutcome>;
    delete legacyOutcome.masteryRevisions;
    delete legacyOutcome.reviewRevision;
    await seed(database, "learningOutcomes", legacyOutcome);

    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);
    await expect(
      committer.commit({
        clientAttemptId: "attempt-1",
        exerciseId: "exercise-1",
        result: syncResult(),
      }),
    ).resolves.toBeUndefined();

    expect(
      (await new AttemptRepository(database).get("attempt-1"))?.syncStatus,
    ).toBe("synced");
    const storedMastery = await new SkillMasteryRepository(database).get(
      "skill-1",
    );
    expect(storedMastery?.masteryScore).toBe(62);
    expect(storedMastery?.revision).toBe(4);
    const storedReview = await new ExerciseReviewRepository(database).get(
      "exercise-1",
    );
    expect(storedReview?.dueAt).toBe("2026-07-27T08:00:00.000Z");
    expect(storedReview?.revision).toBe(4);
  });

  it("marks a legacy attempt with no local learning outcome as synced without reconciling any projection", async () => {
    // Simulates an attempt recorded through a path that predates or
    // bypasses the local projection commit (e.g. legacy data seeded
    // directly into the attempts store) - there is nothing local to
    // reconcile the remote mastery/review against, but the attempt itself
    // must still be marked synced.
    await new AttemptRepository(database).save(attempt(), "pending");
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await expect(
      committer.commit({
        clientAttemptId: "attempt-1",
        exerciseId: "exercise-1",
        result: syncResult(),
      }),
    ).resolves.toBeUndefined();

    expect(
      (await new AttemptRepository(database).get("attempt-1"))?.syncStatus,
    ).toBe("synced");
    const masteryRepository = new SkillMasteryRepository(database);
    expect(await masteryRepository.get("skill-1")).toBeNull();
  });

  it("rolls back every store, including the sync status, when a projection write is invalid", async () => {
    await seedCommittedAttempt(database);
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    // A valid mastery result (matches the outcome's revision snapshot and
    // would normally apply cleanly) paired with a missing exerciseId - the
    // exerciseReviews store's keyPath - forces a real synchronous
    // IndexedDB failure partway through the transaction.
    await expect(
      committer.commit({
        clientAttemptId: "attempt-1",
        exerciseId: undefined as unknown as string,
        result: syncResult(),
      }),
    ).rejects.toThrow();

    expect(
      (await new AttemptRepository(database).get("attempt-1"))?.syncStatus,
    ).toBe("pending");
    expect(await new SkillMasteryRepository(database).get("skill-1")).toEqual(
      mastery(),
    );
    expect(
      await new ExerciseReviewRepository(database).get("exercise-1"),
    ).toEqual(review());
    expect(
      await new LearningOutcomeRepository(database).get("attempt-1"),
    ).toEqual(outcome());
  });

  it("rejects when no local attempt exists for the given clientAttemptId", async () => {
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await expect(
      committer.commit({
        clientAttemptId: "attempt-missing",
        exerciseId: "exercise-1",
        result: syncResult({ attemptId: "attempt-missing" }),
      }),
    ).rejects.toThrow();
  });
});
