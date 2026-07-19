import { describe, expect, it } from "vitest";

import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import { buildExerciseLearningSnapshots } from "./exercise-learning-snapshot";

function attempt(overrides: Partial<AttemptSyncInput> = {}): AttemptSyncInput {
  return {
    clientAttemptId: `attempt-${Math.random().toString(36).slice(2)}`,
    sessionId: null,
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-10T08:00:00.000Z",
    completedAt: "2026-07-10T08:01:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 5,
    recommendedKeystrokeCount: 5,
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

const NOW = new Date("2026-07-19T12:00:00.000Z");

describe("buildExerciseLearningSnapshots", () => {
  it("returns an empty map for no attempts", () => {
    expect(buildExerciseLearningSnapshots([], NOW).size).toBe(0);
  });

  it("groups attempts by exercise and counts successes and failures independently", () => {
    const snapshots = buildExerciseLearningSnapshots(
      [
        attempt({ exerciseId: "exercise-1", completed: true }),
        attempt({ exerciseId: "exercise-1", completed: false }),
        attempt({ exerciseId: "exercise-1", completed: true }),
        attempt({ exerciseId: "exercise-2", completed: false }),
      ],
      NOW,
    );

    expect(snapshots.get("exercise-1")).toMatchObject({
      exerciseId: "exercise-1",
      attemptCount: 3,
      successfulAttemptCount: 2,
      failedAttemptCount: 1,
    });
    expect(snapshots.get("exercise-2")).toMatchObject({
      attemptCount: 1,
      successfulAttemptCount: 0,
      failedAttemptCount: 1,
    });
  });

  it("reports the most recent attempt's timestamp and completion state regardless of input order", () => {
    const oldest = attempt({
      startedAt: "2026-07-01T08:00:00.000Z",
      completedAt: "2026-07-01T08:01:00.000Z",
      completed: true,
    });
    const newest = attempt({
      startedAt: "2026-07-15T08:00:00.000Z",
      completedAt: "2026-07-15T08:01:00.000Z",
      completed: false,
    });
    const middle = attempt({
      startedAt: "2026-07-08T08:00:00.000Z",
      completedAt: "2026-07-08T08:01:00.000Z",
      completed: true,
    });

    const snapshots = buildExerciseLearningSnapshots(
      [oldest, newest, middle],
      NOW,
    );

    expect(snapshots.get("exercise-1")).toMatchObject({
      lastAttemptAt: newest.completedAt,
      lastCompleted: false,
    });
  });

  it("averages accuracy and speed scores across all attempts for the exercise", () => {
    const snapshots = buildExerciseLearningSnapshots(
      [
        attempt({ accuracyScore: 80, speedScore: 60 }),
        attempt({ accuracyScore: 100, speedScore: 100 }),
      ],
      NOW,
    );

    expect(snapshots.get("exercise-1")).toMatchObject({
      averageAccuracy: 90,
      averageSpeed: 80,
    });
  });

  it("computes the highest hint level across only the recent attempt window", () => {
    const snapshots = buildExerciseLearningSnapshots(
      [
        attempt({
          startedAt: "2026-07-01T08:00:00.000Z",
          completedAt: "2026-07-01T08:01:00.000Z",
          highestHintLevel: 4,
        }),
        attempt({
          startedAt: "2026-07-10T08:00:00.000Z",
          completedAt: "2026-07-10T08:01:00.000Z",
          highestHintLevel: 1,
        }),
        attempt({
          startedAt: "2026-07-15T08:00:00.000Z",
          completedAt: "2026-07-15T08:01:00.000Z",
          highestHintLevel: 2,
        }),
        attempt({
          startedAt: "2026-07-18T08:00:00.000Z",
          completedAt: "2026-07-18T08:01:00.000Z",
          highestHintLevel: 0,
        }),
      ],
      NOW,
    );

    // The oldest attempt's hint level of 4 must be excluded: only the three
    // most recent attempts (1, 2, 0) count toward the window, so the max is 2.
    expect(snapshots.get("exercise-1")?.highestRecentHintLevel).toBe(2);
  });

  it("counts only attempts made on the same calendar day as now", () => {
    const snapshots = buildExerciseLearningSnapshots(
      [
        attempt({
          startedAt: "2026-07-19T01:00:00.000Z",
          completedAt: "2026-07-19T01:05:00.000Z",
        }),
        attempt({
          startedAt: "2026-07-19T10:00:00.000Z",
          completedAt: "2026-07-19T10:05:00.000Z",
        }),
        attempt({
          startedAt: "2026-07-18T23:59:00.000Z",
          completedAt: "2026-07-18T23:59:30.000Z",
        }),
      ],
      NOW,
    );

    expect(snapshots.get("exercise-1")?.sameDayAttemptCount).toBe(2);
  });

  it("ignores attempts with an unparseable timestamp when determining recency", () => {
    const valid = attempt({
      startedAt: "2026-07-05T08:00:00.000Z",
      completedAt: "2026-07-05T08:01:00.000Z",
      completed: true,
    });
    const invalid = attempt({
      startedAt: "not-a-date",
      completedAt: null,
      completed: false,
    });

    const snapshots = buildExerciseLearningSnapshots([invalid, valid], NOW);

    expect(snapshots.get("exercise-1")).toMatchObject({
      attemptCount: 2,
      lastAttemptAt: valid.completedAt,
      lastCompleted: true,
    });
  });

  it("returns null recency fields when every attempt has an unparseable timestamp", () => {
    const snapshots = buildExerciseLearningSnapshots(
      [attempt({ startedAt: "not-a-date", completedAt: null })],
      NOW,
    );

    expect(snapshots.get("exercise-1")).toMatchObject({
      lastAttemptAt: null,
      lastCompleted: null,
      sameDayAttemptCount: 0,
      highestRecentHintLevel: 0,
    });
  });
});
