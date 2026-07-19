import { describe, expect, it } from "vitest";

import type { MasteryUpdateInput } from "./mastery-calculator";
import { calculateMasteryUpdate } from "./mastery-calculator";

function createInput(
  overrides: Partial<MasteryUpdateInput> = {},
): MasteryUpdateInput {
  return {
    previousScore: 40,
    previousLevel: 2,
    performanceQuality: 5,
    learningMode: "memory_review",
    highestHintLevel: 0,
    practiceContext: "different_exercise",
    skillWeight: 1,
    successfulAttempts: 3,
    uniqueExercisesCompleted: 2,
    consecutiveSuccesses: 3,
    hasSevenDayUnhintedSuccess: false,
    ...overrides,
  };
}

describe("calculateMasteryUpdate delta multipliers", () => {
  it.each([
    { performanceQuality: 0 as const, expectedDelta: -12 },
    { performanceQuality: 1 as const, expectedDelta: -8 },
    { performanceQuality: 2 as const, expectedDelta: -4 },
    { performanceQuality: 3 as const, expectedDelta: 4 },
    { performanceQuality: 4 as const, expectedDelta: 7 },
    { performanceQuality: 5 as const, expectedDelta: 10 },
  ])(
    "applies the quality $performanceQuality change table",
    ({ performanceQuality, expectedDelta }) => {
      const result = calculateMasteryUpdate(
        createInput({ performanceQuality }),
      );

      expect(result.delta).toBe(expectedDelta);
    },
  );

  it.each([
    { learningMode: "beginner" as const, expectedDelta: 7.5 },
    { learningMode: "memory_review" as const, expectedDelta: 10 },
    { learningMode: "efficiency" as const, expectedDelta: 11.5 },
  ])(
    "applies the $learningMode mastery multiplier",
    ({ learningMode, expectedDelta }) => {
      expect(
        calculateMasteryUpdate(createInput({ learningMode })).delta,
      ).toBe(expectedDelta);
    },
  );

  it("applies only the highest hint multiplier", () => {
    expect(
      calculateMasteryUpdate(
        createInput({ highestHintLevel: 4 }),
      ).delta,
    ).toBe(1.5);
  });

  it.each([
    { practiceContext: "same_exercise_immediate" as const, expected: 4 },
    { practiceContext: "different_exercise" as const, expected: 10 },
    { practiceContext: "next_day" as const, expected: 12 },
    { practiceContext: "seven_days" as const, expected: 13.5 },
  ])(
    "applies the $practiceContext context multiplier",
    ({ practiceContext, expected }) => {
      expect(
        calculateMasteryUpdate(createInput({ practiceContext })).delta,
      ).toBe(expected);
    },
  );

  it("scales the delta by the exercise skill weight", () => {
    expect(
      calculateMasteryUpdate(createInput({ skillWeight: 0.25 })).delta,
    ).toBe(2.5);
  });

  it("clamps mastery score and reports the applied delta", () => {
    expect(
      calculateMasteryUpdate(createInput({ previousScore: 98 })),
    ).toMatchObject({ previousScore: 98, nextScore: 100, delta: 2 });
    expect(
      calculateMasteryUpdate(
        createInput({
          previousScore: 2,
          previousLevel: 0,
          performanceQuality: 0,
        }),
      ),
    ).toMatchObject({ previousScore: 2, nextScore: 0, delta: -2 });
  });
});

describe("calculateMasteryUpdate level evidence", () => {
  it("does not promote a single high-scoring attempt into Level 4 or 5", () => {
    const result = calculateMasteryUpdate(
      createInput({
        previousScore: 90,
        previousLevel: 0,
        performanceQuality: 3,
        skillWeight: 0,
        successfulAttempts: 1,
        uniqueExercisesCompleted: 1,
        consecutiveSuccesses: 1,
      }),
    );

    expect(result.nextScore).toBe(90);
    expect(result.nextLevel).toBe(2);
  });

  it.each([
    {
      previousScore: 60,
      successfulAttempts: 3,
      uniqueExercisesCompleted: 2,
      consecutiveSuccesses: 2,
      expectedLevel: 3,
    },
    {
      previousScore: 75,
      successfulAttempts: 6,
      uniqueExercisesCompleted: 3,
      consecutiveSuccesses: 3,
      expectedLevel: 4,
    },
    {
      previousScore: 85,
      successfulAttempts: 10,
      uniqueExercisesCompleted: 5,
      consecutiveSuccesses: 5,
      hasSevenDayUnhintedSuccess: true,
      expectedLevel: 5,
    },
  ])(
    "allows Level $expectedLevel only when its minimum evidence is met",
    ({ expectedLevel, ...overrides }) => {
      const result = calculateMasteryUpdate(
        createInput({
          previousLevel: 2,
          performanceQuality: 3,
          skillWeight: 0,
          ...overrides,
        }),
      );

      expect(result.nextLevel).toBe(expectedLevel);
    },
  );

  it("caps Level 5 at Level 4 without a seven-day unhinted success", () => {
    const result = calculateMasteryUpdate(
      createInput({
        previousScore: 90,
        previousLevel: 4,
        performanceQuality: 3,
        skillWeight: 0,
        successfulAttempts: 20,
        uniqueExercisesCompleted: 10,
        consecutiveSuccesses: 10,
        hasSevenDayUnhintedSuccess: false,
      }),
    );

    expect(result.nextScore).toBe(90);
    expect(result.nextLevel).toBe(4);
  });

  it.each([
    {
      previousScore: 90,
      previousLevel: 5 as const,
      expectedScore: 85,
      expectedLevel: 4,
    },
    {
      previousScore: 75,
      previousLevel: 4 as const,
      expectedScore: 70,
      expectedLevel: 3,
    },
  ])(
    "limits one Level $previousLevel failure to a one-level drop",
    ({ previousScore, previousLevel, expectedScore, expectedLevel }) => {
      const result = calculateMasteryUpdate(
        createInput({
          previousScore,
          previousLevel,
          performanceQuality: 0,
          learningMode: "efficiency",
          practiceContext: "seven_days",
          successfulAttempts: 20,
          uniqueExercisesCompleted: 10,
          consecutiveSuccesses: 0,
          hasSevenDayUnhintedSuccess: true,
        }),
      );

      expect(result.delta).toBe(-5);
      expect(result.nextScore).toBe(expectedScore);
      expect(result.nextLevel).toBe(expectedLevel);
    },
  );
});
