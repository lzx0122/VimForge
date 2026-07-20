import { describe, expect, it } from "vitest";

import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type {
  ExerciseSkillLink,
  PracticeExercise,
} from "../../features/practice/repositories/exercise-repository";
import type {
  StoredExerciseReview,
  StoredSkillMastery,
} from "../../types/learning-projection";
import { scheduleReview } from "../review/review-scheduler";
import { MAX_REVIEW_INTERVAL_DAYS } from "../review/review-scheduler";
import { calculateLearningProjection } from "./learning-projection-calculator";

const NOW = new Date("2026-07-16T08:00:00.000Z");

function exerciseSkill(
  overrides: Partial<ExerciseSkillLink> = {},
): ExerciseSkillLink {
  return { skillId: "skill-1", weight: 1, primary: true, ...overrides };
}

function exercise(
  overrides: Partial<PracticeExercise> = {},
): PracticeExercise {
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
    skills: [exerciseSkill()],
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
    startedAt: "2026-07-16T07:59:00.000Z",
    completedAt: "2026-07-16T08:00:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 5,
    recommendedKeystrokeCount: 5,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [],
    speedScore: 90,
    accuracyScore: 90,
    performanceQuality: 4,
    practiceContext: "different_exercise",
    ...overrides,
  };
}

function priorMastery(
  overrides: Partial<StoredSkillMastery> = {},
): StoredSkillMastery {
  return {
    skillId: "skill-1",
    masteryScore: 60,
    masteryLevel: 3,
    successfulAttempts: 3,
    uniqueExerciseIds: ["exercise-other"],
    consecutiveSuccesses: 3,
    firstUnhintedSuccessAt: null,
    latestUnhintedSuccessAt: null,
    lastAttemptAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
    revision: 3,
    ...overrides,
  };
}

function priorReview(
  overrides: Partial<StoredExerciseReview> = {},
): StoredExerciseReview {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 3,
    currentIntervalDays: 7,
    dueAt: "2026-07-15T08:00:00.000Z",
    lastPerformanceQuality: 4,
    lastAttemptAt: "2026-07-08T08:00:00.000Z",
    updatedAt: "2026-07-08T08:00:00.000Z",
    revision: 2,
    ...overrides,
  };
}

describe("calculateLearningProjection", () => {
  it("projects a first success with no prior history", () => {
    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise(),
      previousMastery: new Map(),
      previousReview: null,
      now: NOW,
    });

    const [mastery] = result.masteryUpdates;
    if (mastery === undefined) {
      throw new Error("Expected a mastery update.");
    }
    expect(mastery.successfulAttempts).toBe(1);
    expect(mastery.consecutiveSuccesses).toBe(1);
    expect(mastery.uniqueExerciseIds).toEqual(["exercise-1"]);
    expect(mastery.masteryScore).toBeGreaterThan(0);
    expect(mastery.revision).toBe(1);

    const [change] = result.learningOutcome.skillChanges;
    if (change === undefined) {
      throw new Error("Expected a skill change.");
    }
    expect(change.previousScore).toBe(0);
    expect(change.previousLevel).toBe(0);
    expect(change.nextScore).toBe(mastery.masteryScore);
    expect(result.learningOutcome.previousDueAt).toBeNull();
  });

  it("does not grow uniqueExerciseIds on a repeat success for the same exercise", () => {
    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise(),
      previousMastery: new Map([
        [
          "skill-1",
          priorMastery({
            uniqueExerciseIds: ["exercise-1"],
            successfulAttempts: 5,
            consecutiveSuccesses: 2,
          }),
        ],
      ]),
      previousReview: null,
      now: NOW,
    });

    const [mastery] = result.masteryUpdates;
    if (mastery === undefined) {
      throw new Error("Expected a mastery update.");
    }
    expect(mastery.uniqueExerciseIds).toEqual(["exercise-1"]);
    expect(mastery.successfulAttempts).toBe(6);
    expect(mastery.consecutiveSuccesses).toBe(3);
  });

  it("grows uniqueExerciseIds on a success for a new exercise", () => {
    const result = calculateLearningProjection({
      attempt: attempt({ exerciseId: "exercise-1" }),
      exercise: exercise({ id: "exercise-1" }),
      previousMastery: new Map([
        [
          "skill-1",
          priorMastery({ uniqueExerciseIds: ["exercise-other"] }),
        ],
      ]),
      previousReview: null,
      now: NOW,
    });

    const [mastery] = result.masteryUpdates;
    if (mastery === undefined) {
      throw new Error("Expected a mastery update.");
    }
    expect([...mastery.uniqueExerciseIds].sort()).toEqual([
      "exercise-1",
      "exercise-other",
    ]);
  });

  it("resets consecutiveSuccesses and does not advance counters on failure", () => {
    const result = calculateLearningProjection({
      attempt: attempt({ completed: false, performanceQuality: 1 }),
      exercise: exercise(),
      previousMastery: new Map([
        [
          "skill-1",
          priorMastery({
            uniqueExerciseIds: ["exercise-other"],
            successfulAttempts: 5,
            consecutiveSuccesses: 4,
            masteryScore: 60,
          }),
        ],
      ]),
      previousReview: null,
      now: NOW,
    });

    const [mastery] = result.masteryUpdates;
    if (mastery === undefined) {
      throw new Error("Expected a mastery update.");
    }
    expect(mastery.consecutiveSuccesses).toBe(0);
    expect(mastery.successfulAttempts).toBe(5);
    expect(mastery.uniqueExerciseIds).toEqual(["exercise-other"]);
    expect(mastery.masteryScore).toBeLessThan(60);
  });

  it("scales each skill's mastery delta by its own weight", () => {
    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise({
        skills: [
          exerciseSkill({ skillId: "primary-skill", weight: 1, primary: true }),
          exerciseSkill({
            skillId: "secondary-skill",
            weight: 0.5,
            primary: false,
          }),
        ],
      }),
      previousMastery: new Map(),
      previousReview: null,
      now: NOW,
    });

    const primary = result.masteryUpdates.find(
      (update) => update.skillId === "primary-skill",
    );
    const secondary = result.masteryUpdates.find(
      (update) => update.skillId === "secondary-skill",
    );

    expect(primary?.masteryScore).toBeGreaterThan(secondary?.masteryScore ?? 0);
  });

  it("dampens the delta with hints and does not record an unhinted success", () => {
    const unhinted = calculateLearningProjection({
      attempt: attempt({ highestHintLevel: 0 }),
      exercise: exercise(),
      previousMastery: new Map(),
      previousReview: null,
      now: NOW,
    });
    const hinted = calculateLearningProjection({
      attempt: attempt({ highestHintLevel: 2 }),
      exercise: exercise(),
      previousMastery: new Map(),
      previousReview: null,
      now: NOW,
    });

    expect(hinted.masteryUpdates[0]?.masteryScore).toBeLessThan(
      unhinted.masteryUpdates[0]?.masteryScore ?? 0,
    );
    expect(hinted.masteryUpdates[0]?.firstUnhintedSuccessAt).toBeNull();
    expect(unhinted.masteryUpdates[0]?.firstUnhintedSuccessAt).toBe(
      "2026-07-16T08:00:00.000Z",
    );
  });

  it("reaches Level 5 only with a seven-day-old unhinted success", () => {
    const qualifyingHistory = priorMastery({
      masteryScore: 85,
      masteryLevel: 4,
      successfulAttempts: 10,
      uniqueExerciseIds: Array.from({ length: 5 }, (_, i) => `exercise-${i}`),
      consecutiveSuccesses: 5,
      firstUnhintedSuccessAt: "2026-07-08T08:00:00.000Z",
    });

    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise(),
      previousMastery: new Map([["skill-1", qualifyingHistory]]),
      previousReview: null,
      now: NOW,
    });

    expect(result.masteryUpdates[0]?.masteryLevel).toBe(5);
  });

  it("caps Level 5 at Level 4 when the unhinted success is less than seven days old", () => {
    const recentHistory = priorMastery({
      masteryScore: 85,
      masteryLevel: 4,
      successfulAttempts: 10,
      uniqueExerciseIds: Array.from({ length: 5 }, (_, i) => `exercise-${i}`),
      consecutiveSuccesses: 5,
      firstUnhintedSuccessAt: "2026-07-15T08:00:00.000Z",
    });

    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise(),
      previousMastery: new Map([["skill-1", recentHistory]]),
      previousReview: null,
      now: NOW,
    });

    expect(result.masteryUpdates[0]?.masteryLevel).toBe(4);
  });

  it("protects a Level 5 skill from dropping below Level 4 on a bad failure", () => {
    const result = calculateLearningProjection({
      attempt: attempt({ completed: false, performanceQuality: 0 }),
      exercise: exercise(),
      previousMastery: new Map([
        [
          "skill-1",
          priorMastery({ masteryScore: 90, masteryLevel: 5 }),
        ],
      ]),
      previousReview: null,
      now: NOW,
    });

    expect(result.masteryUpdates[0]?.masteryLevel).toBeGreaterThanOrEqual(4);
  });

  it("schedules the review from the resulting primary-skill mastery level, not a secondary skill", () => {
    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise({
        skills: [
          exerciseSkill({ skillId: "primary-skill", weight: 1, primary: true }),
          exerciseSkill({
            skillId: "secondary-skill",
            weight: 1,
            primary: false,
          }),
        ],
      }),
      previousMastery: new Map([
        [
          "primary-skill",
          priorMastery({ skillId: "primary-skill", masteryLevel: 2, masteryScore: 45 }),
        ],
        [
          "secondary-skill",
          priorMastery({ skillId: "secondary-skill", masteryLevel: 4, masteryScore: 80 }),
        ],
      ]),
      previousReview: null,
      now: NOW,
    });

    const primaryMastery = result.masteryUpdates.find(
      (update) => update.skillId === "primary-skill",
    );
    expect(result.reviewUpdate.masteryLevel).toBe(primaryMastery?.masteryLevel);
  });

  it("computes the same due date scheduleReview() would return for the same inputs", () => {
    const previousReview = priorReview({ currentIntervalDays: 7 });
    const result = calculateLearningProjection({
      attempt: attempt({ performanceQuality: 5, highestHintLevel: 0 }),
      exercise: exercise(),
      previousMastery: new Map([["skill-1", priorMastery({ masteryLevel: 3 })]]),
      previousReview,
      now: NOW,
    });

    const expectedSchedule = scheduleReview({
      masteryLevel: result.reviewUpdate.masteryLevel,
      performanceQuality: 5,
      highestHintLevel: 0,
      currentIntervalDays: previousReview.currentIntervalDays,
      now: NOW,
    });

    expect(result.reviewUpdate.dueAt).toBe(expectedSchedule.dueAt.toISOString());
    expect(result.reviewUpdate.currentIntervalDays).toBe(
      expectedSchedule.intervalDays,
    );
    expect(result.learningOutcome.nextDueAt).toBe(result.reviewUpdate.dueAt);
    expect(result.learningOutcome.previousDueAt).toBe(previousReview.dueAt);
  });

  it("never schedules an interval longer than the max review interval", () => {
    const result = calculateLearningProjection({
      attempt: attempt({ performanceQuality: 5, highestHintLevel: 0 }),
      exercise: exercise(),
      previousMastery: new Map([
        [
          "skill-1",
          priorMastery({
            masteryScore: 95,
            masteryLevel: 5,
            successfulAttempts: 20,
            uniqueExerciseIds: Array.from({ length: 10 }, (_, i) => `ex-${i}`),
            consecutiveSuccesses: 10,
            firstUnhintedSuccessAt: "2026-06-01T08:00:00.000Z",
          }),
        ],
      ]),
      previousReview: priorReview({
        masteryLevel: 5,
        currentIntervalDays: 30,
      }),
      now: NOW,
    });

    expect(result.reviewUpdate.currentIntervalDays).toBeLessThanOrEqual(
      MAX_REVIEW_INTERVAL_DAYS,
    );
  });

  it("builds a learning outcome with the attempt's identity and a local projection source", () => {
    const result = calculateLearningProjection({
      attempt: attempt({
        clientAttemptId: "attempt-42",
        sessionId: "session-42",
      }),
      exercise: exercise({ id: "exercise-42" }),
      previousMastery: new Map(),
      previousReview: null,
      now: NOW,
    });

    expect(result.learningOutcome).toMatchObject({
      clientAttemptId: "attempt-42",
      sessionId: "session-42",
      exerciseId: "exercise-42",
      completedAt: "2026-07-16T08:00:00.000Z",
      projectionSource: "local",
    });
  });

  it("stamps the learning outcome with the exact revisions the mastery and review updates carry", () => {
    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise({
        skills: [
          exerciseSkill({ skillId: "primary-skill", weight: 1, primary: true }),
          exerciseSkill({
            skillId: "secondary-skill",
            weight: 1,
            primary: false,
          }),
        ],
      }),
      previousMastery: new Map([
        [
          "primary-skill",
          priorMastery({ skillId: "primary-skill", revision: 4 }),
        ],
        [
          "secondary-skill",
          priorMastery({ skillId: "secondary-skill", revision: 9 }),
        ],
      ]),
      previousReview: priorReview({ revision: 6 }),
      now: NOW,
    });

    // Not independently recalculated: matches masteryUpdates'/reviewUpdate's
    // own revisions exactly, whatever they turn out to be.
    const expectedMasteryRevisions = result.masteryUpdates
      .map((update) => [update.skillId, update.revision] as const)
      .sort();
    expect(
      result.learningOutcome.masteryRevisions
        .map((entry) => [entry.skillId, entry.revision] as const)
        .sort(),
    ).toEqual(expectedMasteryRevisions);
    expect(expectedMasteryRevisions).toEqual(
      [
        ["primary-skill", 5],
        ["secondary-skill", 10],
      ].sort(),
    );
    expect(result.learningOutcome.reviewRevision).toBe(
      result.reviewUpdate.revision,
    );
    expect(result.learningOutcome.reviewRevision).toBe(7);
  });

  it("increments revision from the prior mastery and review records", () => {
    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise(),
      previousMastery: new Map([["skill-1", priorMastery({ revision: 4 })]]),
      previousReview: priorReview({ revision: 6 }),
      now: NOW,
    });

    expect(result.masteryUpdates[0]?.revision).toBe(5);
    expect(result.reviewUpdate.revision).toBe(7);
  });

  it("rejects an attempt with no session id instead of fabricating one", () => {
    expect(() =>
      calculateLearningProjection({
        attempt: attempt({ sessionId: null }),
        exercise: exercise(),
        previousMastery: new Map(),
        previousReview: null,
        now: NOW,
      }),
    ).toThrow(/session id/u);
  });

  it("rejects an attempt with no completed-at timestamp instead of substituting startedAt", () => {
    expect(() =>
      calculateLearningProjection({
        attempt: attempt({ completedAt: null }),
        exercise: exercise(),
        previousMastery: new Map(),
        previousReview: null,
        now: NOW,
      }),
    ).toThrow(/completed-at/u);
  });

  it("qualifies for Level 5 when the unhinted success is exactly seven days old", () => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const qualifyingHistory = priorMastery({
      masteryScore: 85,
      masteryLevel: 4,
      successfulAttempts: 10,
      uniqueExerciseIds: Array.from({ length: 5 }, (_, i) => `exercise-${i}`),
      consecutiveSuccesses: 5,
      firstUnhintedSuccessAt: new Date(NOW.getTime() - sevenDaysMs).toISOString(),
    });

    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise(),
      previousMastery: new Map([["skill-1", qualifyingHistory]]),
      previousReview: null,
      now: NOW,
    });

    expect(result.masteryUpdates[0]?.masteryLevel).toBe(5);
  });

  it("does not qualify for Level 5 one millisecond short of seven days", () => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const almostQualifyingHistory = priorMastery({
      masteryScore: 85,
      masteryLevel: 4,
      successfulAttempts: 10,
      uniqueExerciseIds: Array.from({ length: 5 }, (_, i) => `exercise-${i}`),
      consecutiveSuccesses: 5,
      firstUnhintedSuccessAt: new Date(
        NOW.getTime() - sevenDaysMs + 1,
      ).toISOString(),
    });

    const result = calculateLearningProjection({
      attempt: attempt(),
      exercise: exercise(),
      previousMastery: new Map([["skill-1", almostQualifyingHistory]]),
      previousReview: null,
      now: NOW,
    });

    expect(result.masteryUpdates[0]?.masteryLevel).toBe(4);
  });
});
