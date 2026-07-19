import { describe, expect, it } from "vitest";

import {
  selectPracticeExercises,
  type PracticeCandidate,
  type PracticeCandidatePools,
} from "./practice-selector";

function candidates(
  prefix: string,
  count: number,
  skillIds: readonly string[] = ["skill-touched"],
): PracticeCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    exerciseId: `${prefix}-${index + 1}`,
    skillIds,
    priority: count - index,
  }));
}

function createPools(
  overrides: Partial<PracticeCandidatePools> = {},
): PracticeCandidatePools {
  return {
    dueOrIncorrect: candidates("due", 20),
    weak: candidates("weak", 20),
    familiar: candidates("familiar", 20),
    stale: [],
    sameDifficulty: [],
    ...overrides,
  };
}

describe("selectPracticeExercises ratios", () => {
  it.each([
    { count: 5 as const, due: 3, weak: 1, familiar: 1 },
    { count: 10 as const, due: 7, weak: 2, familiar: 1 },
    { count: 20 as const, due: 14, weak: 4, familiar: 2 },
  ])(
    "selects $count exercises as $due/$weak/$familiar",
    ({ count, due, weak, familiar }) => {
      const selected = selectPracticeExercises({
        questionCount: count,
        touchedSkillIds: ["skill-touched"],
        pools: createPools(),
      });

      expect(selected).toHaveLength(count);
      expect(selected.filter((id) => id.startsWith("due-"))).toHaveLength(
        due,
      );
      expect(selected.filter((id) => id.startsWith("weak-"))).toHaveLength(
        weak,
      );
      expect(
        selected.filter((id) => id.startsWith("familiar-")),
      ).toHaveLength(familiar);
    },
  );
});

describe("selectPracticeExercises fallback", () => {
  it("fills a due shortage with weak and then stale candidates", () => {
    const selected = selectPracticeExercises({
      questionCount: 10,
      touchedSkillIds: ["skill-touched"],
      pools: createPools({
        dueOrIncorrect: candidates("due", 3),
        weak: candidates("weak", 4),
        familiar: candidates("familiar", 1),
        stale: candidates("stale", 4),
        sameDifficulty: candidates("same", 4),
      }),
    });

    expect(selected).toHaveLength(10);
    expect(selected.filter((id) => id.startsWith("due-"))).toHaveLength(3);
    expect(selected.filter((id) => id.startsWith("weak-"))).toHaveLength(4);
    expect(
      selected.filter((id) => id.startsWith("familiar-")),
    ).toHaveLength(1);
    expect(selected.filter((id) => id.startsWith("stale-"))).toHaveLength(2);
    expect(selected.some((id) => id.startsWith("same-"))).toBe(false);
  });

  it("continues from stale to same-difficulty candidates", () => {
    const selected = selectPracticeExercises({
      questionCount: 10,
      touchedSkillIds: ["skill-touched"],
      pools: createPools({
        dueOrIncorrect: candidates("due", 3),
        weak: candidates("weak", 2),
        familiar: candidates("familiar", 1),
        stale: candidates("stale", 2),
        sameDifficulty: candidates("same", 5),
      }),
    });

    expect(selected).toHaveLength(10);
    expect(selected.filter((id) => id.startsWith("same-"))).toHaveLength(2);
  });

  it("returns every eligible unique exercise when fewer than requested exist", () => {
    const selected = selectPracticeExercises({
      questionCount: 5,
      touchedSkillIds: ["skill-touched"],
      pools: createPools({
        dueOrIncorrect: candidates("due", 1),
        weak: candidates("weak", 1),
        familiar: [],
        stale: [],
        sameDifficulty: [],
      }),
    });

    expect(selected).toEqual(["due-1", "weak-1"]);
  });
});

describe("selectPracticeExercises eligibility", () => {
  it("never repeats an exercise that appears in multiple pools", () => {
    const duplicate = {
      exerciseId: "exercise-shared",
      skillIds: ["skill-touched"],
      priority: 100,
    } satisfies PracticeCandidate;
    const selected = selectPracticeExercises({
      questionCount: 5,
      touchedSkillIds: ["skill-touched"],
      pools: createPools({
        dueOrIncorrect: [duplicate, ...candidates("due", 2)],
        weak: [duplicate, ...candidates("weak", 3)],
        familiar: [duplicate, ...candidates("familiar", 2)],
        stale: [duplicate],
      }),
    });

    expect(new Set(selected).size).toBe(selected.length);
    expect(selected.filter((id) => id === duplicate.exerciseId)).toHaveLength(
      1,
    );
  });

  it("requires every exercise skill to have been touched", () => {
    const selected = selectPracticeExercises({
      questionCount: 5,
      touchedSkillIds: ["skill-touched"],
      pools: createPools({
        dueOrIncorrect: [
          {
            exerciseId: "eligible",
            skillIds: ["skill-touched"],
            priority: 1,
          },
          {
            exerciseId: "partly-new",
            skillIds: ["skill-touched", "skill-new"],
            priority: 100,
          },
          {
            exerciseId: "entirely-new",
            skillIds: ["skill-new"],
            priority: 100,
          },
        ],
        weak: [],
        familiar: [],
      }),
    });

    expect(selected).toEqual(["eligible"]);
  });

  it("uses descending priority without mutating candidate pools", () => {
    const due = [
      { exerciseId: "low", skillIds: ["skill-touched"], priority: 1 },
      { exerciseId: "high", skillIds: ["skill-touched"], priority: 10 },
      { exerciseId: "middle", skillIds: ["skill-touched"], priority: 5 },
    ] satisfies PracticeCandidate[];
    const originalOrder = due.map((candidate) => candidate.exerciseId);

    const selected = selectPracticeExercises({
      questionCount: 5,
      touchedSkillIds: ["skill-touched"],
      pools: createPools({
        dueOrIncorrect: due,
        weak: [],
        familiar: [],
      }),
    });

    expect(selected).toEqual(["high", "middle", "low"]);
    expect(due.map((candidate) => candidate.exerciseId)).toEqual(
      originalOrder,
    );
  });
});
