import { describe, expect, it } from "vitest";

import type { ExerciseDefinition } from "../../../types";
import type { EditorSnapshot } from "../../../domain/exercise/exercise-evaluator";
import { evaluateAutoCompletion } from "./auto-completion-service";

const exercise: ExerciseDefinition = {
  id: "exercise-1",
  unitId: "unit-1",
  slug: "move-cursor",
  title: "移動游標",
  instruction: "把游標移到目標位置。",
  language: "plaintext",
  exerciseType: "challenge",
  difficulty: "beginner",
  initialContent: "abc",
  expectedContent: "abc",
  initialCursor: { line: 0, column: 0 },
  completionRule: {
    contentMatch: "unchanged",
    cursorMatch: { type: "exact", line: 0, column: 2 },
    requiredMode: "normal",
  },
  supportedModes: ["beginner"],
  targetDurationMs: 5_000,
  version: 1,
};

const completedSnapshot: EditorSnapshot = {
  content: "abc",
  cursor: { line: 0, column: 2 },
  mode: "normal",
};

describe("evaluateAutoCompletion", () => {
  it("does not submit an initially complete snapshot without user interaction", () => {
    expect(
      evaluateAutoCompletion(exercise, completedSnapshot, false),
    ).toMatchObject({
      shouldSubmit: false,
      evaluation: { completed: true },
    });
  });

  it("submits after user interaction when every condition matches", () => {
    expect(
      evaluateAutoCompletion(exercise, completedSnapshot, true).shouldSubmit,
    ).toBe(true);
  });

  it("keeps the exercise active when the cursor or mode is wrong", () => {
    expect(
      evaluateAutoCompletion(
        exercise,
        { ...completedSnapshot, cursor: { line: 0, column: 1 } },
        true,
      ),
    ).toMatchObject({
      shouldSubmit: false,
      evaluation: { cursorMatched: false },
    });
    expect(
      evaluateAutoCompletion(
        exercise,
        { ...completedSnapshot, mode: "insert" },
        true,
      ),
    ).toMatchObject({
      shouldSubmit: false,
      evaluation: { modeMatched: false },
    });
  });

  it("supports ignored cursors and exact content rules", () => {
    const exactContentExercise: ExerciseDefinition = {
      ...exercise,
      completionRule: {
        contentMatch: "exact",
        cursorMatch: { type: "ignore" },
      },
      expectedContent: "done",
    };

    expect(
      evaluateAutoCompletion(
        exactContentExercise,
        { content: "done", cursor: { line: 3, column: 9 }, mode: "normal" },
        true,
      ).shouldSubmit,
    ).toBe(true);
  });
});
