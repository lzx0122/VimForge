import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type { AttemptDraft } from "../../types/attempt";
import type {
  StoredExerciseReview,
  StoredLearningOutcome,
  StoredSkillMastery,
} from "../../types/learning-projection";
import type { PracticeSession } from "../../types/session";
import { AttemptRepository } from "./attempt-repository";
import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
} from "./database";
import { ExerciseReviewRepository } from "./exercise-review-repository";
import { LearningOutcomeRepository } from "./learning-outcome-repository";
import {
  AttemptConflictError,
  commitLearningProjection,
} from "./learning-projection-commit";
import { SessionRepository } from "./session-repository";
import { SkillMasteryRepository } from "./skill-mastery-repository";

const DATABASE_NAME = "vim-forge-learning-projection-commit-test";

function createSyncAttempt(
  overrides: Partial<AttemptSyncInput> = {},
): AttemptSyncInput {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: "2026-07-19T08:01:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 3,
    recommendedKeystrokeCount: 3,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [{ type: "vim_command", command: "ciw" }],
    speedScore: 100,
    accuracyScore: 100,
    performanceQuality: 5,
    practiceContext: "different_exercise",
    ...overrides,
  };
}

function createSession(): PracticeSession {
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
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-19T08:00:00.000Z",
  };
}

function createAttemptDraft(): AttemptDraft {
  return {
    clientAttemptId: "attempt-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: null,
    initialContent: "const name = true;",
    currentContent: "const xname = true;",
    initialCursor: { line: 0, column: 6 },
    currentCursor: { line: 0, column: 7 },
    currentMode: "normal",
    actions: [{ type: "vim_command", command: "i" }],
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    completed: false,
  };
}

function createMasteryUpdate(
  overrides: Partial<StoredSkillMastery> = {},
): StoredSkillMastery {
  return {
    skillId: "skill-1",
    masteryScore: 65,
    masteryLevel: 3,
    successfulAttempts: 4,
    uniqueExerciseIds: ["exercise-1"],
    consecutiveSuccesses: 2,
    firstUnhintedSuccessAt: "2026-07-10T08:00:00.000Z",
    latestUnhintedSuccessAt: "2026-07-19T08:01:00.000Z",
    lastAttemptAt: "2026-07-19T08:01:00.000Z",
    updatedAt: "2026-07-19T08:01:00.000Z",
    revision: 1,
    ...overrides,
  };
}

function createReviewUpdate(
  overrides: Partial<StoredExerciseReview> = {},
): StoredExerciseReview {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 3,
    currentIntervalDays: 7,
    dueAt: "2026-07-26T08:01:00.000Z",
    lastPerformanceQuality: 5,
    lastAttemptAt: "2026-07-19T08:01:00.000Z",
    updatedAt: "2026-07-19T08:01:00.000Z",
    revision: 1,
    ...overrides,
  };
}

function createLearningOutcome(
  overrides: Partial<StoredLearningOutcome> = {},
): StoredLearningOutcome {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    completedAt: "2026-07-19T08:01:00.000Z",
    skillChanges: [
      {
        skillId: "skill-1",
        previousScore: 60,
        nextScore: 65,
        previousLevel: 3,
        nextLevel: 3,
        delta: 5,
      },
    ],
    previousDueAt: "2026-07-19T08:00:00.000Z",
    nextDueAt: "2026-07-26T08:01:00.000Z",
    projectionSource: "local",
    ...overrides,
  };
}

function createCommitInput(
  overrides: Partial<{
    attempt: AttemptSyncInput;
    session: PracticeSession;
    attemptDraft: AttemptDraft | null;
    masteryUpdates: readonly StoredSkillMastery[];
    reviewUpdate: StoredExerciseReview;
    learningOutcome: StoredLearningOutcome;
  }> = {},
) {
  return {
    attempt: createSyncAttempt(),
    session: createSession(),
    attemptDraft: null,
    masteryUpdates: [createMasteryUpdate()],
    reviewUpdate: createReviewUpdate(),
    learningOutcome: createLearningOutcome(),
    ...overrides,
  };
}

describe("commitLearningProjection", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  it("commits the attempt, session, mastery, review, and outcome together and reports created", async () => {
    const attemptRepository = new AttemptRepository(database);
    const sessionRepository = new SessionRepository(database);
    const masteryRepository = new SkillMasteryRepository(database);
    const reviewRepository = new ExerciseReviewRepository(database);
    const outcomeRepository = new LearningOutcomeRepository(database);

    const result = await commitLearningProjection(
      database,
      createCommitInput(),
    );

    expect(result).toBe("created");
    expect(await attemptRepository.get("attempt-1")).toMatchObject({
      clientAttemptId: "attempt-1",
      syncStatus: "pending",
    });
    expect(await sessionRepository.get("session-1")).toEqual(
      createSession(),
    );
    expect(await masteryRepository.get("skill-1")).toEqual(
      createMasteryUpdate(),
    );
    expect(await reviewRepository.get("exercise-1")).toEqual(
      createReviewUpdate(),
    );
    expect(await outcomeRepository.get("attempt-1")).toEqual(
      createLearningOutcome(),
    );
  });

  it("commits every mastery update when an exercise touches multiple skills", async () => {
    const masteryRepository = new SkillMasteryRepository(database);

    await commitLearningProjection(
      database,
      createCommitInput({
        masteryUpdates: [
          createMasteryUpdate({ skillId: "skill-1" }),
          createMasteryUpdate({ skillId: "skill-2" }),
        ],
      }),
    );

    const stored = await masteryRepository.listAll();
    expect(stored.map((record) => record.skillId).sort()).toEqual([
      "skill-1",
      "skill-2",
    ]);
  });

  it("treats an identical duplicate clientAttemptId as a whole-transaction no-op and reports duplicate", async () => {
    const attemptRepository = new AttemptRepository(database);
    const sessionRepository = new SessionRepository(database);
    const masteryRepository = new SkillMasteryRepository(database);
    const reviewRepository = new ExerciseReviewRepository(database);
    const outcomeRepository = new LearningOutcomeRepository(database);

    await commitLearningProjection(database, createCommitInput());

    const staleSession = { ...createSession(), currentIndex: 1 };
    const staleMasteryUpdate = createMasteryUpdate({
      masteryScore: 999,
      revision: 99,
    });
    const staleReviewUpdate = createReviewUpdate({
      currentIntervalDays: 999,
      revision: 99,
    });
    const staleOutcome = createLearningOutcome({
      exerciseId: "exercise-should-not-apply",
    });

    const result = await commitLearningProjection(database, {
      attempt: createSyncAttempt(),
      session: staleSession,
      attemptDraft: createAttemptDraft(),
      masteryUpdates: [staleMasteryUpdate],
      reviewUpdate: staleReviewUpdate,
      learningOutcome: staleOutcome,
    });

    expect(result).toBe("duplicate");
    expect(await attemptRepository.get("attempt-1")).toMatchObject({
      accuracyScore: 100,
    });
    expect(await sessionRepository.getResumeState("session-1")).toEqual({
      session: createSession(),
      attemptDraft: null,
    });
    expect(await masteryRepository.get("skill-1")).toEqual(
      createMasteryUpdate(),
    );
    expect(await reviewRepository.get("exercise-1")).toEqual(
      createReviewUpdate(),
    );
    expect(await outcomeRepository.get("attempt-1")).toEqual(
      createLearningOutcome(),
    );
  });

  it("rejects a conflicting duplicate clientAttemptId and leaves every store untouched", async () => {
    const attemptRepository = new AttemptRepository(database);
    const masteryRepository = new SkillMasteryRepository(database);
    const reviewRepository = new ExerciseReviewRepository(database);
    const outcomeRepository = new LearningOutcomeRepository(database);

    await commitLearningProjection(database, createCommitInput());

    await expect(
      commitLearningProjection(
        database,
        createCommitInput({
          attempt: createSyncAttempt({ accuracyScore: 1 }),
          masteryUpdates: [createMasteryUpdate({ masteryScore: 1 })],
        }),
      ),
    ).rejects.toThrow(AttemptConflictError);

    expect(await attemptRepository.get("attempt-1")).toMatchObject({
      accuracyScore: 100,
    });
    expect(await masteryRepository.get("skill-1")).toEqual(
      createMasteryUpdate(),
    );
    expect(await reviewRepository.get("exercise-1")).toEqual(
      createReviewUpdate(),
    );
    expect(await outcomeRepository.get("attempt-1")).toEqual(
      createLearningOutcome(),
    );
  });

  it("rolls back every store, including the attempt, when a projection write is invalid", async () => {
    const attemptRepository = new AttemptRepository(database);
    const sessionRepository = new SessionRepository(database);
    const masteryRepository = new SkillMasteryRepository(database);
    const reviewRepository = new ExerciseReviewRepository(database);
    const outcomeRepository = new LearningOutcomeRepository(database);

    const invalidReviewUpdate = {
      ...createReviewUpdate(),
      exerciseId: undefined,
    } as unknown as StoredExerciseReview;

    await expect(
      commitLearningProjection(
        database,
        createCommitInput({ reviewUpdate: invalidReviewUpdate }),
      ),
    ).rejects.toThrow();

    expect(await attemptRepository.get("attempt-1")).toBeNull();
    expect(await sessionRepository.get("session-1")).toBeNull();
    expect(await masteryRepository.get("skill-1")).toBeNull();
    expect(await reviewRepository.get("exercise-1")).toBeNull();
    expect(await outcomeRepository.get("attempt-1")).toBeNull();
  });
});
