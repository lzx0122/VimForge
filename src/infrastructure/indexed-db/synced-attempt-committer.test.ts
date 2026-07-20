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
import { IndexedDbSyncedAttemptCommitter } from "./synced-attempt-committer";

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

  it("replaces local mastery with the remote's absolute score and level", async () => {
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

  it("replaces the local review's due date", async () => {
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

  it("does not regress mastery or the review when a newer local attempt already advanced them (stale response)", async () => {
    // A later local attempt (Task 19) has already advanced skill-1's mastery
    // and the review past this attempt's completedAt before this attempt's
    // (older) sync response arrives.
    await seedCommittedAttempt(database, {
      mastery: { lastAttemptAt: "2026-07-21T08:00:00.000Z", revision: 6 },
      review: { lastAttemptAt: "2026-07-21T08:00:00.000Z", revision: 6 },
    });
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await committer.commit({
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
      result: syncResult(),
    });

    const masteryRepository = new SkillMasteryRepository(database);
    const reviewRepository = new ExerciseReviewRepository(database);
    const storedMastery = await masteryRepository.get("skill-1");
    const storedReview = await reviewRepository.get("exercise-1");

    expect(storedMastery?.masteryScore).toBe(62);
    expect(storedMastery?.revision).toBe(6);
    expect(storedReview?.dueAt).toBe("2026-07-27T08:00:00.000Z");
    expect(storedReview?.revision).toBe(6);

    // The attempt itself still synced successfully even though its stale
    // projection snapshot was not applied.
    expect((await new AttemptRepository(database).get("attempt-1"))?.syncStatus).toBe(
      "synced",
    );
    const storedOutcome = await new LearningOutcomeRepository(database).get(
      "attempt-1",
    );
    expect(storedOutcome?.projectionSource).toBe("local");
  });

  it("rolls back the synced status when a projection write is invalid, retaining the attempt as pending", async () => {
    await seedCommittedAttempt(database);
    const committer = new IndexedDbSyncedAttemptCommitter(database, () => NOW);

    await expect(
      committer.commit({
        clientAttemptId: "attempt-1",
        exerciseId: "exercise-1",
        result: syncResult({
          mastery: [
            { skillId: undefined, masteryLevel: 4, masteryScore: 78 },
          ] as unknown as AttemptSyncResult["mastery"],
        }),
      }),
    ).rejects.toThrow();

    const stored = await new AttemptRepository(database).get("attempt-1");
    expect(stored?.syncStatus).toBe("pending");
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

    expect((await new AttemptRepository(database).get("attempt-1"))?.syncStatus).toBe(
      "synced",
    );
    const masteryRepository = new SkillMasteryRepository(database);
    expect(await masteryRepository.get("skill-1")).toBeNull();
  });
});
