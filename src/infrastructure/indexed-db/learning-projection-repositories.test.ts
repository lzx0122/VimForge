import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  StoredExerciseReview,
  StoredLearningOutcome,
  StoredSkillMastery,
} from "../../types/learning-projection";
import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "./database";
import { ExerciseReviewRepository } from "./exercise-review-repository";
import { LearningOutcomeRepository } from "./learning-outcome-repository";
import { SkillMasteryRepository } from "./skill-mastery-repository";

const DATABASE_NAME = "vim-forge-learning-projection-test";

function skillMastery(
  overrides: Partial<StoredSkillMastery> = {},
): StoredSkillMastery {
  return {
    skillId: "skill-1",
    masteryScore: 62,
    masteryLevel: 3,
    successfulAttempts: 4,
    uniqueExerciseIds: ["exercise-1", "exercise-2"],
    consecutiveSuccesses: 2,
    firstUnhintedSuccessAt: "2026-07-01T08:00:00.000Z",
    latestUnhintedSuccessAt: "2026-07-15T08:00:00.000Z",
    lastAttemptAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z",
    revision: 1,
    ...overrides,
  };
}

function exerciseReview(
  overrides: Partial<StoredExerciseReview> = {},
): StoredExerciseReview {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 3,
    currentIntervalDays: 4,
    dueAt: "2026-07-20T00:00:00.000Z",
    lastPerformanceQuality: 4,
    lastAttemptAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    revision: 1,
    ...overrides,
  };
}

function learningOutcome(
  overrides: Partial<StoredLearningOutcome> = {},
): StoredLearningOutcome {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    completedAt: "2026-07-16T08:00:00.000Z",
    skillChanges: [
      {
        skillId: "skill-1",
        previousScore: 50,
        nextScore: 55,
        previousLevel: 2,
        nextLevel: 3,
        delta: 5,
      },
    ],
    previousDueAt: "2026-07-10T00:00:00.000Z",
    nextDueAt: "2026-07-20T00:00:00.000Z",
    projectionSource: "local",
    ...overrides,
  };
}

async function seed(
  database: IDBDatabase,
  storeName: string,
  records: readonly unknown[],
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  for (const record of records) {
    store.put(record);
  }
  await transactionToPromise(transaction);
}

describe("learning projection repositories", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  describe("SkillMasteryRepository", () => {
    it("returns null when the skill has no stored mastery", async () => {
      const repository = new SkillMasteryRepository(database);

      expect(await repository.get("skill-missing")).toBeNull();
    });

    it("gets a stored skill mastery record by skill id", async () => {
      await seed(database, "skillMastery", [skillMastery()]);
      const repository = new SkillMasteryRepository(database);

      expect(await repository.get("skill-1")).toEqual(skillMastery());
    });

    it("lists every stored skill mastery record", async () => {
      await seed(database, "skillMastery", [
        skillMastery({ skillId: "skill-1" }),
        skillMastery({ skillId: "skill-2" }),
      ]);
      const repository = new SkillMasteryRepository(database);

      const records = await repository.listAll();

      expect(records.map((record) => record.skillId).sort()).toEqual([
        "skill-1",
        "skill-2",
      ]);
    });

    it("returns copies that mutating the result cannot corrupt", async () => {
      await seed(database, "skillMastery", [skillMastery()]);
      const repository = new SkillMasteryRepository(database);

      const first = await repository.get("skill-1");
      first?.uniqueExerciseIds.push("exercise-injected");

      const second = await repository.get("skill-1");

      expect(second?.uniqueExerciseIds).toEqual(["exercise-1", "exercise-2"]);
    });
  });

  describe("ExerciseReviewRepository", () => {
    it("returns null when the exercise has no stored review", async () => {
      const repository = new ExerciseReviewRepository(database);

      expect(await repository.get("exercise-missing")).toBeNull();
    });

    it("gets a stored exercise review by exercise id", async () => {
      await seed(database, "exerciseReviews", [exerciseReview()]);
      const repository = new ExerciseReviewRepository(database);

      expect(await repository.get("exercise-1")).toEqual(exerciseReview());
    });

    it("lists only reviews due at or before the given time", async () => {
      await seed(database, "exerciseReviews", [
        exerciseReview({
          exerciseId: "due-past",
          dueAt: "2026-07-15T00:00:00.000Z",
        }),
        exerciseReview({
          exerciseId: "due-exactly-now",
          dueAt: "2026-07-20T00:00:00.000Z",
        }),
        exerciseReview({
          exerciseId: "due-future",
          dueAt: "2026-07-25T00:00:00.000Z",
        }),
      ]);
      const repository = new ExerciseReviewRepository(database);

      const due = await repository.listDue("2026-07-20T00:00:00.000Z");

      expect(due.map((record) => record.exerciseId).sort()).toEqual([
        "due-exactly-now",
        "due-past",
      ]);
    });

    it("lists every stored exercise review", async () => {
      await seed(database, "exerciseReviews", [
        exerciseReview({ exerciseId: "exercise-1" }),
        exerciseReview({ exerciseId: "exercise-2" }),
      ]);
      const repository = new ExerciseReviewRepository(database);

      const records = await repository.listAll();

      expect(records.map((record) => record.exerciseId).sort()).toEqual([
        "exercise-1",
        "exercise-2",
      ]);
    });

    it("returns copies that mutating the result cannot corrupt", async () => {
      await seed(database, "exerciseReviews", [exerciseReview()]);
      const repository = new ExerciseReviewRepository(database);

      const first = await repository.get("exercise-1");
      if (first !== null) {
        (first as { currentIntervalDays: number }).currentIntervalDays = 999;
      }

      const second = await repository.get("exercise-1");

      expect(second?.currentIntervalDays).toBe(4);
    });
  });

  describe("LearningOutcomeRepository", () => {
    it("returns null when the attempt has no stored outcome", async () => {
      const repository = new LearningOutcomeRepository(database);

      expect(await repository.get("attempt-missing")).toBeNull();
    });

    it("gets a stored learning outcome by client attempt id", async () => {
      await seed(database, "learningOutcomes", [learningOutcome()]);
      const repository = new LearningOutcomeRepository(database);

      expect(await repository.get("attempt-1")).toEqual(learningOutcome());
    });

    it("lists a session's outcomes ordered by completion time, excluding other sessions", async () => {
      await seed(database, "learningOutcomes", [
        learningOutcome({
          clientAttemptId: "attempt-3",
          sessionId: "session-1",
          completedAt: "2026-07-16T08:02:00.000Z",
        }),
        learningOutcome({
          clientAttemptId: "attempt-1",
          sessionId: "session-1",
          completedAt: "2026-07-16T08:00:00.000Z",
        }),
        learningOutcome({
          clientAttemptId: "attempt-2",
          sessionId: "session-1",
          completedAt: "2026-07-16T08:01:00.000Z",
        }),
        learningOutcome({
          clientAttemptId: "attempt-other-session",
          sessionId: "session-2",
          completedAt: "2026-07-16T08:00:30.000Z",
        }),
      ]);
      const repository = new LearningOutcomeRepository(database);

      const outcomes = await repository.listBySessionId("session-1");

      expect(outcomes.map((outcome) => outcome.clientAttemptId)).toEqual([
        "attempt-1",
        "attempt-2",
        "attempt-3",
      ]);
    });

    it("returns copies that mutating the result cannot corrupt", async () => {
      await seed(database, "learningOutcomes", [learningOutcome()]);
      const repository = new LearningOutcomeRepository(database);

      const first = await repository.get("attempt-1");
      first?.skillChanges.push({
        skillId: "skill-injected",
        previousScore: 0,
        nextScore: 0,
        previousLevel: 0,
        nextLevel: 0,
        delta: 0,
      });

      const second = await repository.get("attempt-1");

      expect(second?.skillChanges).toEqual(learningOutcome().skillChanges);
    });
  });
});
