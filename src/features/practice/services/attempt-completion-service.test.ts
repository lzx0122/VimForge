import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AttemptConflictError } from "../../../infrastructure/indexed-db/attempt-outcome-commit";
import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
} from "../../../infrastructure/indexed-db/database";
import { ExerciseReviewRepository } from "../../../infrastructure/indexed-db/exercise-review-repository";
import { SkillMasteryRepository } from "../../../infrastructure/indexed-db/skill-mastery-repository";
import type { StoredSkillMastery } from "../../../types/learning-projection";
import type { PracticeSession } from "../../../types/session";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import type { PracticeExercise } from "../repositories/exercise-repository";
import { AttemptCompletionService } from "./attempt-completion-service";

const DATABASE_NAME = "vim-forge-attempt-completion-service-test";
const NOW = new Date("2026-07-20T08:00:00.000Z");

function exercise(overrides: Partial<PracticeExercise> = {}): PracticeExercise {
  return {
    id: "exercise-1",
    unitId: "unit-1",
    slug: "insert-prefix-01",
    title: "插入字首",
    instruction: "在 name 前插入 x。",
    language: "typescript",
    exerciseType: "guided",
    difficulty: "beginner",
    initialContent: "const name = true;",
    expectedContent: "const xname = true;",
    initialCursor: { line: 0, column: 6 },
    completionRule: {
      contentMatch: "exact",
      cursorMatch: { type: "ignore" },
      requiredMode: "normal",
    },
    supportedModes: ["beginner", "memory_review"],
    targetDurationMs: 12000,
    version: 1,
    skills: [{ skillId: "skill-1", weight: 1, primary: true }],
    solutions: [],
    hints: [],
    ...overrides,
  };
}

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

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: "session-1",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 5,
    actualCount: 2,
    status: "active",
    currentIndex: 0,
    exerciseIds: ["exercise-1", "exercise-2"],
    selectedSkillIds: [],
    startedAt: "2026-07-20T07:59:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-20T07:59:00.000Z",
    ...overrides,
  };
}

async function seedMastery(
  database: IDBDatabase,
  record: StoredSkillMastery,
): Promise<void> {
  const transaction = database.transaction("skillMastery", "readwrite");
  transaction.objectStore("skillMastery").put(record);
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), {
      once: true,
    });
  });
}

describe("AttemptCompletionService", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  it("loads prior mastery and review before calculating the projection", async () => {
    await seedMastery(database, {
      skillId: "skill-1",
      masteryScore: 60,
      masteryLevel: 3,
      successfulAttempts: 3,
      uniqueExerciseIds: ["exercise-other"],
      consecutiveSuccesses: 2,
      firstUnhintedSuccessAt: null,
      latestUnhintedSuccessAt: null,
      lastAttemptAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-15T08:00:00.000Z",
      revision: 2,
    });

    const service = new AttemptCompletionService(database, () => NOW);
    const result = await service.complete({
      attempt: attempt(),
      exercise: exercise(),
      session: session(),
    });

    const [change] = result.learningOutcome.skillChanges;
    expect(change?.previousScore).toBe(60);
    expect(change?.previousLevel).toBe(3);
    expect(change?.nextScore).toBeGreaterThan(60);
  });

  it("starts from a clean baseline with no prior projection", async () => {
    const service = new AttemptCompletionService(database, () => NOW);
    const result = await service.complete({
      attempt: attempt(),
      exercise: exercise(),
      session: session(),
    });

    const [change] = result.learningOutcome.skillChanges;
    expect(change?.previousScore).toBe(0);
    expect(change?.previousLevel).toBe(0);
  });

  it("commits the attempt, session, mastery, review, and outcome in one atomic transaction", async () => {
    const service = new AttemptCompletionService(database, () => NOW);

    await service.complete({
      attempt: attempt(),
      exercise: exercise(),
      session: session(),
    });

    const masteryRepository = new SkillMasteryRepository(database);
    const reviewRepository = new ExerciseReviewRepository(database);

    expect(await masteryRepository.get("skill-1")).not.toBeNull();
    expect(await reviewRepository.get("exercise-1")).not.toBeNull();
  });

  it("returns the attempt, learning outcome, and session in its result", async () => {
    const service = new AttemptCompletionService(database, () => NOW);

    const result = await service.complete({
      attempt: attempt(),
      exercise: exercise(),
      session: session(),
    });

    expect(result.attempt.clientAttemptId).toBe("attempt-1");
    expect(result.session).toEqual(session());
    expect(result.learningOutcome).toMatchObject({
      clientAttemptId: "attempt-1",
      sessionId: "session-1",
      exerciseId: "exercise-1",
    });
  });

  it("is safe to retry with an identical attempt: it does not double-apply the projection", async () => {
    const service = new AttemptCompletionService(database, () => NOW);
    const masteryRepository = new SkillMasteryRepository(database);

    const first = await service.complete({
      attempt: attempt(),
      exercise: exercise(),
      session: session(),
    });
    const second = await service.complete({
      attempt: attempt(),
      exercise: exercise(),
      session: session(),
    });

    expect(second.learningOutcome).toEqual(first.learningOutcome);
    const stored = await masteryRepository.get("skill-1");
    expect(stored?.successfulAttempts).toBe(1);
    expect(stored?.revision).toBe(1);
  });

  it("rejects a retry with a conflicting payload under the same clientAttemptId", async () => {
    const service = new AttemptCompletionService(database, () => NOW);

    await service.complete({
      attempt: attempt(),
      exercise: exercise(),
      session: session(),
    });

    await expect(
      service.complete({
        attempt: attempt({ accuracyScore: 1 }),
        exercise: exercise(),
        session: session(),
      }),
    ).rejects.toThrow(AttemptConflictError);
  });
});
