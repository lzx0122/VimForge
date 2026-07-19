import { describe, expect, it } from "vitest";

import type { ExerciseLearningSnapshot } from "../../../domain/review/exercise-learning-snapshot";
import { selectPracticeExercises } from "../../../domain/review/practice-selector";
import type { PracticeCandidateRecord } from "../repositories/practice-candidate-repository";
import { buildPracticeCandidatePools } from "./practice-pool-builder";

const NOW = new Date("2026-07-19T12:00:00.000Z");
const TOUCHED_SKILL = "skill-touched";

function candidate(
  overrides: Partial<PracticeCandidateRecord> = {},
): PracticeCandidateRecord {
  return {
    exerciseId: "exercise-1",
    unitId: "unit-1",
    exerciseSlug: "exercise-1",
    skillIds: [TOUCHED_SKILL],
    skillSlugs: ["touched"],
    learningModes: ["memory_review"],
    difficulty: "beginner",
    displayOrder: 1,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<ExerciseLearningSnapshot> = {},
): ExerciseLearningSnapshot {
  return {
    exerciseId: "exercise-1",
    attemptCount: 3,
    successfulAttemptCount: 3,
    failedAttemptCount: 0,
    lastAttemptAt: "2026-07-19T08:00:00.000Z",
    lastCompleted: true,
    averageAccuracy: 95,
    averageSpeed: 90,
    highestRecentHintLevel: 0,
    sameDayAttemptCount: 1,
    ...overrides,
  };
}

describe("buildPracticeCandidatePools", () => {
  it("places a candidate whose last attempt failed into dueOrIncorrect", () => {
    const failed = candidate({ exerciseId: "failed-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [failed],
      snapshots: new Map([
        [
          "failed-exercise",
          snapshot({
            exerciseId: "failed-exercise",
            lastCompleted: false,
            failedAttemptCount: 1,
            successfulAttemptCount: 0,
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    expect(pools.dueOrIncorrect.map((c) => c.exerciseId)).toEqual([
      "failed-exercise",
    ]);
    expect(pools.weak).toEqual([]);
    expect(pools.familiar).toEqual([]);
    expect(pools.stale).toEqual([]);
    expect(pools.sameDifficulty).toEqual([]);
  });

  it("places a low-accuracy, recently-attempted candidate into weak", () => {
    const weak = candidate({ exerciseId: "weak-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [weak],
      snapshots: new Map([
        [
          "weak-exercise",
          snapshot({
            exerciseId: "weak-exercise",
            averageAccuracy: 40,
            lastAttemptAt: NOW.toISOString(),
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    expect(pools.weak.map((c) => c.exerciseId)).toEqual(["weak-exercise"]);
  });

  it("places a candidate needing frequent hints into weak", () => {
    const highHint = candidate({ exerciseId: "high-hint-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [highHint],
      snapshots: new Map([
        [
          "high-hint-exercise",
          snapshot({
            exerciseId: "high-hint-exercise",
            highestRecentHintLevel: 3,
            lastAttemptAt: NOW.toISOString(),
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    expect(pools.weak.map((c) => c.exerciseId)).toEqual([
      "high-hint-exercise",
    ]);
  });

  it("places a candidate with stable, recent success into familiar", () => {
    const familiar = candidate({ exerciseId: "familiar-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [familiar],
      snapshots: new Map([
        [
          "familiar-exercise",
          snapshot({
            exerciseId: "familiar-exercise",
            successfulAttemptCount: 4,
            lastAttemptAt: NOW.toISOString(),
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    expect(pools.familiar.map((c) => c.exerciseId)).toEqual([
      "familiar-exercise",
    ]);
  });

  it("places a long-unseen, successfully-completed candidate into stale", () => {
    const stale = candidate({ exerciseId: "stale-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [stale],
      snapshots: new Map([
        [
          "stale-exercise",
          snapshot({
            exerciseId: "stale-exercise",
            successfulAttemptCount: 4,
            lastAttemptAt: "2026-06-01T08:00:00.000Z",
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    expect(pools.stale.map((c) => c.exerciseId)).toEqual(["stale-exercise"]);
    expect(pools.familiar).toEqual([]);
  });

  it("places a never-attempted candidate into sameDifficulty when its skills are touched", () => {
    const unseen = candidate({ exerciseId: "unseen-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [unseen],
      snapshots: new Map(),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    expect(pools.sameDifficulty.map((c) => c.exerciseId)).toEqual([
      "unseen-exercise",
    ]);
  });

  it("excludes a candidate entirely when none of its skills have been touched", () => {
    const untouched = candidate({
      exerciseId: "untouched-exercise",
      skillIds: ["skill-never-touched"],
    });
    const pools = buildPracticeCandidatePools({
      candidates: [untouched],
      snapshots: new Map([
        [
          "untouched-exercise",
          snapshot({ exerciseId: "untouched-exercise", lastCompleted: false }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    const allCandidateIds = [
      ...pools.dueOrIncorrect,
      ...pools.weak,
      ...pools.familiar,
      ...pools.stale,
      ...pools.sameDifficulty,
    ].map((c) => c.exerciseId);
    expect(allCandidateIds).not.toContain("untouched-exercise");
  });

  it("excludes a candidate when only some of its skills have been touched", () => {
    const partlyNew = candidate({
      exerciseId: "partly-new-exercise",
      skillIds: [TOUCHED_SKILL, "skill-never-touched"],
    });
    const pools = buildPracticeCandidatePools({
      candidates: [partlyNew],
      snapshots: new Map(),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    expect(pools.sameDifficulty).toEqual([]);
  });

  it("computes priority using the weakness formula", () => {
    const target = candidate({ exerciseId: "priority-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [target],
      snapshots: new Map([
        [
          "priority-exercise",
          snapshot({
            exerciseId: "priority-exercise",
            lastCompleted: true,
            failedAttemptCount: 0,
            averageAccuracy: 80,
            averageSpeed: 60,
            highestRecentHintLevel: 1,
            attemptCount: 2,
            lastAttemptAt: NOW.toISOString(),
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    // failureWeight: 0*5 = 0
    // accuracyWeight: (100-80)*0.25 = 5
    // speedWeight: (100-60)*0.15 = 6
    // hintWeight: 1*5 = 5
    // exposureWeight: max(0, 3-2)*4 = 4
    // total = 20
    const found = [...pools.weak, ...pools.familiar, ...pools.sameDifficulty].find(
      (c) => c.exerciseId === "priority-exercise",
    );
    expect(found?.priority).toBe(20);
  });

  it("adds the recent-failure bonus to the historical failure weight instead of replacing it", () => {
    const oneFailure = candidate({ exerciseId: "one-failure" });
    const manyFailures = candidate({ exerciseId: "many-failures" });
    const sharedSnapshotFields = {
      lastCompleted: false as const,
      averageAccuracy: 95,
      averageSpeed: 90,
      highestRecentHintLevel: 0 as const,
      attemptCount: 3,
      lastAttemptAt: NOW.toISOString(),
    };

    const pools = buildPracticeCandidatePools({
      candidates: [oneFailure, manyFailures],
      snapshots: new Map([
        [
          "one-failure",
          snapshot({
            exerciseId: "one-failure",
            ...sharedSnapshotFields,
            failedAttemptCount: 1,
          }),
        ],
        [
          "many-failures",
          snapshot({
            exerciseId: "many-failures",
            ...sharedSnapshotFields,
            failedAttemptCount: 5,
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    const oneFailurePriority = pools.dueOrIncorrect.find(
      (c) => c.exerciseId === "one-failure",
    )?.priority;
    const manyFailuresPriority = pools.dueOrIncorrect.find(
      (c) => c.exerciseId === "many-failures",
    )?.priority;

    expect(oneFailurePriority).toBeDefined();
    expect(manyFailuresPriority).toBeDefined();
    // recentFailureWeight (40) is shared; only historicalFailureWeight
    // (failedAttemptCount * 5) should differ: (5-1) * 5 = 20.
    expect(manyFailuresPriority! - oneFailurePriority!).toBe(20);

    const selected = selectPracticeExercises({
      questionCount: 5,
      touchedSkillIds: [TOUCHED_SKILL],
      pools: {
        dueOrIncorrect: pools.dueOrIncorrect,
        weak: [],
        familiar: [],
        stale: [],
        sameDifficulty: [],
      },
    });
    expect(selected[0]).toBe("many-failures");
  });

  it("excludes an attempted but neutral candidate from every pool", () => {
    const neutral = candidate({ exerciseId: "neutral-exercise" });
    const pools = buildPracticeCandidatePools({
      candidates: [neutral],
      snapshots: new Map([
        [
          "neutral-exercise",
          snapshot({
            exerciseId: "neutral-exercise",
            attemptCount: 1,
            successfulAttemptCount: 1,
            failedAttemptCount: 0,
            lastCompleted: true,
            lastAttemptAt: NOW.toISOString(),
            averageAccuracy: 95,
            averageSpeed: 90,
            highestRecentHintLevel: 0,
          }),
        ],
      ]),
      touchedSkillIds: [TOUCHED_SKILL],
      now: NOW,
    });

    const allCandidateIds = [
      ...pools.dueOrIncorrect,
      ...pools.weak,
      ...pools.familiar,
      ...pools.stale,
      ...pools.sameDifficulty,
    ].map((c) => c.exerciseId);
    expect(allCandidateIds).not.toContain("neutral-exercise");
  });

  it("produces the same pool order for the same seed date", () => {
    const tied = Array.from({ length: 8 }, (_, index) =>
      candidate({ exerciseId: `unseen-${index + 1}` }),
    );
    const build = () =>
      buildPracticeCandidatePools({
        candidates: tied,
        snapshots: new Map(),
        touchedSkillIds: [TOUCHED_SKILL],
        now: NOW,
      });

    const first = build().sameDifficulty.map((c) => c.exerciseId);
    const second = build().sameDifficulty.map((c) => c.exerciseId);

    expect(second).toEqual(first);
  });

  it("changes the tie order for tied candidates on a different date", () => {
    const tied = Array.from({ length: 8 }, (_, index) =>
      candidate({ exerciseId: `unseen-${index + 1}` }),
    );
    const buildFor = (now: Date) =>
      buildPracticeCandidatePools({
        candidates: tied,
        snapshots: new Map(),
        touchedSkillIds: [TOUCHED_SKILL],
        now,
      }).sameDifficulty.map((c) => c.exerciseId);

    const today = buildFor(NOW);
    const nextMonth = buildFor(new Date("2026-08-19T12:00:00.000Z"));

    expect(nextMonth).not.toEqual(today);
    expect([...nextMonth].sort()).toEqual([...today].sort());
  });
});
