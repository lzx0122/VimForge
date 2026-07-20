import { describe, expect, it } from "vitest";

import type { NormalizedAction } from "../../../types";
import type { PracticeExercise } from "../repositories/exercise-repository";
import { createAttemptOutcome } from "./attempt-outcome-service";

const exercise: PracticeExercise = {
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
  solutions: [{
    sequence: "ix<Esc>",
    normalizedActions: [
      { type: "vim_command", command: "i" },
      { type: "insert_text", text: "x", textLength: 1 },
      { type: "mode_change", mode: "normal" },
    ],
    keystrokeCount: 3,
    recommended: true,
    explanation: "使用 i 插入後按 Esc。",
    displayOrder: 0,
  }],
  hints: [],
};

const baseInput = {
  exercise,
  sessionId: "session-1",
  learningMode: "memory_review" as const,
  clientAttemptId: "attempt-1",
  startedAt: "2026-07-16T08:00:00.000Z",
  completedAt: "2026-07-16T08:00:08.000Z",
  actualKeystrokeCount: 4,
  mistakeCount: 0,
  undoCount: 0,
  resetCount: 0,
  highestHintLevel: 0 as const,
  normalizedActions: [
    { type: "vim_command", command: "a" },
    { type: "insert_text", text: "x", textLength: 1 },
    { type: "mode_change", mode: "normal" },
  ] satisfies NormalizedAction[],
};

describe("createAttemptOutcome", () => {
  it("records an unknown valid completion and recommends the catalog solution", () => {
    const outcome = createAttemptOutcome({
      ...baseInput,
      completed: true,
    });

    expect(outcome.solutionMatch).toBe("unknown_valid");
    expect(outcome.attempt).toMatchObject({
      completed: true,
      durationMs: 8000,
      recommendedKeystrokeCount: 3,
      usedRecommendedSolution: false,
      accuracyScore: 100,
    });
    expect(outcome.feedback).toMatchObject({
      completed: true,
      userSequence: "ax<Esc>",
      recommendedSequence: "ix<Esc>",
      recommendedExplanation: "使用 i 插入後按 Esc。",
    });
    expect(outcome.feedback).not.toHaveProperty("recommendedActions");
    expect(outcome.feedback).not.toHaveProperty("previousMasteryLevel");
    expect(outcome.feedback).not.toHaveProperty("nextMasteryLevel");
    expect(outcome.feedback.improvementReason).toContain("操作未收錄於題庫");
  });

  it("assigns zero speed and accuracy to a skipped exercise", () => {
    const outcome = createAttemptOutcome({
      ...baseInput,
      completed: false,
    });

    expect(outcome.solutionMatch).toBeNull();
    expect(outcome.attempt).toMatchObject({
      completed: false,
      speedScore: 0,
      accuracyScore: 0,
      performanceQuality: 0,
    });
    expect(outcome.feedback).toMatchObject({
      completed: false,
    });
    expect(outcome.feedback).not.toHaveProperty("nextMasteryLevel");
  });

  it("falls back to the default improvement text when the recommended explanation is blank", () => {
    const blankExplanationExercise: PracticeExercise = {
      ...exercise,
      solutions: [{ ...exercise.solutions[0]!, explanation: "   " }],
    };

    const outcome = createAttemptOutcome({
      ...baseInput,
      exercise: blankExplanationExercise,
      completed: true,
    });

    expect(outcome.feedback.recommendedExplanation).toBe("");
    expect(outcome.feedback.improvementReason).toContain(
      "題庫目前沒有推薦解法。",
    );
  });

  it("falls back to the default improvement text when there is no recommended solution", () => {
    const noRecommendedExercise: PracticeExercise = {
      ...exercise,
      solutions: [{ ...exercise.solutions[0]!, recommended: false }],
    };

    const outcome = createAttemptOutcome({
      ...baseInput,
      exercise: noRecommendedExercise,
      completed: true,
    });

    expect(outcome.feedback.recommendedSequence).toBe("—");
    expect(outcome.feedback.recommendedExplanation).toBe("");
    expect(outcome.feedback.improvementReason).toContain(
      "題庫目前沒有推薦解法。",
    );
  });
});
