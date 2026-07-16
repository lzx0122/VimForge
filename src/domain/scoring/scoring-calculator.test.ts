import { describe, expect, it } from "vitest";

import type { AttemptScoreInput } from "./scoring-calculator";
import { calculateAttemptScore } from "./scoring-calculator";

function createInput(
  overrides: Partial<AttemptScoreInput> = {},
): AttemptScoreInput {
  return {
    learningMode: "efficiency",
    completed: true,
    recommendedKeystrokeCount: 3,
    actualKeystrokeCount: 3,
    targetDurationMs: 1_000,
    durationMs: 1_000,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    ...overrides,
  };
}

describe("calculateAttemptScore speed", () => {
  it("returns 100 for recommended keystrokes completed within target time", () => {
    expect(calculateAttemptScore(createInput())).toEqual({
      speedScore: 100,
      accuracyScore: 100,
      performanceQuality: 5,
    });
  });

  it("weights keystroke efficiency at 60% and time efficiency at 40%", () => {
    const result = calculateAttemptScore(
      createInput({
        actualKeystrokeCount: 6,
        durationMs: 2_000,
      }),
    );

    expect(result.speedScore).toBe(50);
  });

  it.each([
    { learningMode: "beginner" as const, durationMs: 2_000 },
    { learningMode: "memory_review" as const, durationMs: 1_300 },
    { learningMode: "efficiency" as const, durationMs: 1_000 },
  ])(
    "applies the $learningMode target-time allowance",
    ({ learningMode, durationMs }) => {
      const result = calculateAttemptScore(
        createInput({ learningMode, durationMs }),
      );

      expect(result.speedScore).toBe(100);
    },
  );

  it("clamps speed to 0–100", () => {
    expect(
      calculateAttemptScore(
        createInput({ actualKeystrokeCount: 1, durationMs: 1 }),
      ).speedScore,
    ).toBe(100);
    expect(
      calculateAttemptScore(
        createInput({
          actualKeystrokeCount: 1_000_000,
          durationMs: 1_000_000,
        }),
      ).speedScore,
    ).toBe(0);
  });

  it("sets speed to 0 when the attempt is incomplete", () => {
    expect(
      calculateAttemptScore(createInput({ completed: false })).speedScore,
    ).toBe(0);
  });
});

describe("calculateAttemptScore accuracy", () => {
  it("applies the specified mistake, undo, and highest-hint penalties", () => {
    const result = calculateAttemptScore(
      createInput({
        mistakeCount: 2,
        undoCount: 1,
        highestHintLevel: 2,
      }),
    );

    expect(result.accuracyScore).toBe(79);
  });

  it("applies reset and Level 4 penalties", () => {
    const result = calculateAttemptScore(
      createInput({
        mistakeCount: 1,
        undoCount: 1,
        resetCount: 1,
        highestHintLevel: 4,
      }),
    );

    expect(result.accuracyScore).toBe(50);
  });

  it("deducts only the highest hint level once", () => {
    expect(
      calculateAttemptScore(
        createInput({ highestHintLevel: 3 }),
      ).accuracyScore,
    ).toBe(85);
  });

  it("does not deduct accuracy for low keystroke efficiency", () => {
    expect(
      calculateAttemptScore(
        createInput({ actualKeystrokeCount: 30 }),
      ).accuracyScore,
    ).toBe(100);
  });

  it("sets accuracy to 0 for incomplete attempts and clamps deductions", () => {
    expect(
      calculateAttemptScore(createInput({ completed: false })).accuracyScore,
    ).toBe(0);
    expect(
      calculateAttemptScore(
        createInput({ mistakeCount: 100, resetCount: 100 }),
      ).accuracyScore,
    ).toBe(0);
  });
});

describe("calculateAttemptScore performance quality", () => {
  it.each([
    { overrides: { completed: false }, expected: 0 },
    {
      overrides: {
        actualKeystrokeCount: 1_000_000,
        durationMs: 1_000_000,
        mistakeCount: 1,
        undoCount: 1,
        resetCount: 6,
      },
      expected: 1,
    },
    {
      overrides: {
        actualKeystrokeCount: 1_000_000,
        durationMs: 1_000_000,
        mistakeCount: 10,
      },
      expected: 2,
    },
    {
      overrides: {
        actualKeystrokeCount: 1_000_000,
        durationMs: 1_000_000,
      },
      expected: 3,
    },
    {
      overrides: { actualKeystrokeCount: 6, durationMs: 2_000 },
      expected: 4,
    },
    { overrides: {}, expected: 5 },
  ] satisfies Array<{
    overrides: Partial<AttemptScoreInput>;
    expected: number;
  }>)("maps attempts into quality $expected", ({ overrides, expected }) => {
    const result = calculateAttemptScore(createInput(overrides));

    expect(result.performanceQuality).toBe(expected);
    expect(result.performanceQuality).toBeGreaterThanOrEqual(0);
    expect(result.performanceQuality).toBeLessThanOrEqual(5);
  });
});
