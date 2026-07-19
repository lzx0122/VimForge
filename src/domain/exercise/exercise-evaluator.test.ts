import { describe, expect, it } from "vitest";

import type { ExerciseDefinition } from "../../types";
import {
  evaluateExercise,
  type EditorSnapshot,
} from "./exercise-evaluator";

function createExercise(
  overrides: Partial<ExerciseDefinition> = {},
): ExerciseDefinition {
  return {
    id: "exercise-1",
    unitId: "unit-1",
    slug: "change-word",
    title: "Change a word",
    instruction: "Change oldName to newName.",
    language: "typescript",
    exerciseType: "guided",
    difficulty: "beginner",
    initialContent: "const oldName = true;",
    expectedContent: "const newName = true;",
    initialCursor: { line: 0, column: 6 },
    completionRule: {
      contentMatch: "exact",
      cursorMatch: { type: "ignore" },
    },
    supportedModes: ["beginner", "memory_review", "efficiency"],
    targetDurationMs: 5_000,
    version: 1,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<EditorSnapshot> = {},
): EditorSnapshot {
  return {
    content: "const newName = true;",
    cursor: { line: 0, column: 0 },
    mode: "normal",
    ...overrides,
  };
}

describe("evaluateExercise content rules", () => {
  it("matches exact content and rejects a one-character difference", () => {
    const exercise = createExercise();

    expect(evaluateExercise(exercise, createSnapshot())).toMatchObject({
      completed: true,
      contentMatched: true,
    });
    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ content: "const newName = truf;" }),
      ),
    ).toMatchObject({ completed: false, contentMatched: false });
  });

  it("matches unchanged content against the initial content", () => {
    const exercise = createExercise({
      completionRule: {
        contentMatch: "unchanged",
        cursorMatch: { type: "ignore" },
      },
    });

    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ content: exercise.initialContent }),
      ),
    ).toMatchObject({ completed: true, contentMatched: true });
    expect(evaluateExercise(exercise, createSnapshot())).toMatchObject({
      completed: false,
      contentMatched: false,
    });
  });

  it("normalizes CRLF to LF before exact and unchanged comparisons", () => {
    const exactExercise = createExercise({
      expectedContent: "alpha\nbeta",
    });
    const unchangedExercise = createExercise({
      initialContent: "alpha\r\nbeta",
      completionRule: {
        contentMatch: "unchanged",
        cursorMatch: { type: "ignore" },
      },
    });

    expect(
      evaluateExercise(
        exactExercise,
        createSnapshot({ content: "alpha\r\nbeta" }),
      ).contentMatched,
    ).toBe(true);
    expect(
      evaluateExercise(
        unchangedExercise,
        createSnapshot({ content: "alpha\nbeta" }),
      ).contentMatched,
    ).toBe(true);
  });
});

describe("evaluateExercise cursor rules", () => {
  it("ignores the cursor when configured", () => {
    const evaluation = evaluateExercise(
      createExercise(),
      createSnapshot({ cursor: { line: 99, column: 99 } }),
    );

    expect(evaluation.cursorMatched).toBe(true);
    expect(evaluation.completed).toBe(true);
  });

  it("requires an exact cursor position", () => {
    const exercise = createExercise({
      completionRule: {
        contentMatch: "exact",
        cursorMatch: { type: "exact", line: 1, column: 4 },
      },
    });

    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ cursor: { line: 1, column: 4 } }),
      ).cursorMatched,
    ).toBe(true);
    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ cursor: { line: 1, column: 5 } }),
      ).cursorMatched,
    ).toBe(false);
  });

  it("accepts inclusive range boundaries and rejects positions outside", () => {
    const exercise = createExercise({
      completionRule: {
        contentMatch: "exact",
        cursorMatch: {
          type: "range",
          start: { line: 1, column: 2 },
          end: { line: 2, column: 4 },
        },
      },
    });

    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ cursor: { line: 1, column: 2 } }),
      ).cursorMatched,
    ).toBe(true);
    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ cursor: { line: 2, column: 4 } }),
      ).cursorMatched,
    ).toBe(true);
    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ cursor: { line: 1, column: 1 } }),
      ).cursorMatched,
    ).toBe(false);
    expect(
      evaluateExercise(
        exercise,
        createSnapshot({ cursor: { line: 2, column: 5 } }),
      ).cursorMatched,
    ).toBe(false);
  });
});

describe("evaluateExercise mode and unmet conditions", () => {
  it("requires the configured Vim mode", () => {
    const exercise = createExercise({
      completionRule: {
        contentMatch: "exact",
        cursorMatch: { type: "ignore" },
        requiredMode: "normal",
      },
    });

    expect(evaluateExercise(exercise, createSnapshot()).modeMatched).toBe(true);
    expect(
      evaluateExercise(exercise, createSnapshot({ mode: "insert" })),
    ).toMatchObject({ completed: false, modeMatched: false });
  });

  it("returns typed, display-ready unmet conditions", () => {
    const exercise = createExercise({
      completionRule: {
        contentMatch: "exact",
        cursorMatch: { type: "exact", line: 2, column: 1 },
        requiredMode: "normal",
      },
    });

    const evaluation = evaluateExercise(
      exercise,
      createSnapshot({
        content: "wrong",
        cursor: { line: 0, column: 0 },
        mode: "insert",
      }),
    );

    expect(evaluation).toEqual({
      completed: false,
      contentMatched: false,
      cursorMatched: false,
      modeMatched: false,
      unmetConditions: [
        { type: "content", message: "內容尚未符合題目要求" },
        { type: "cursor", message: "游標位置尚未符合題目要求" },
        { type: "mode", message: "請回到 Normal Mode" },
      ],
    });
  });
});
