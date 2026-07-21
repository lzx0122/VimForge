import { describe, expect, expectTypeOf, it } from "vitest";

import {
  isExerciseDefinition,
  type AttemptDraft,
  type CompletionRule,
  type ExerciseDefinition,
  type ExerciseSource,
  type LearningMode,
  type PracticeSelectionType,
  type PracticeSessionStatus,
  type QuestionCount,
  type VimMode,
} from "./index";

function createExercise(
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    id: "exercise-1",
    unitId: "unit-1",
    slug: "change-word",
    title: "Change a word",
    instruction: "Change the word under the cursor.",
    language: "typescript",
    exerciseType: "guided",
    difficulty: "beginner",
    initialContent: "const oldName = true;",
    expectedContent: "const newName = true;",
    initialCursor: { line: 0, column: 6 },
    completionRule: {
      contentMatch: "exact",
      cursorMatch: { type: "exact", line: 0, column: 12 },
      requiredMode: "normal",
    },
    supportedModes: ["beginner", "memory_review"],
    targetDurationMs: 5_000,
    version: 1,
    ...overrides,
  };
}

describe("shared learning types", () => {
  it("exposes the fixed learning mode and question count unions", () => {
    expectTypeOf<LearningMode>().toEqualTypeOf<
      "beginner" | "memory_review" | "efficiency"
    >();
    expectTypeOf<QuestionCount>().toEqualTypeOf<5 | 10 | 20>();
  });

  it("exposes the supported Vim modes and attempt sources", () => {
    expectTypeOf<VimMode>().toEqualTypeOf<
      "normal" | "insert" | "visual" | "replace" | "command"
    >();
    expectTypeOf<ExerciseSource>().toEqualTypeOf<
      "web" | "neovim" | "ideavim" | "vscode_vim"
    >();
    expectTypeOf<AttemptDraft["source"]>().toEqualTypeOf<"web">();
    expectTypeOf<AttemptDraft["keystrokeCount"]>().toEqualTypeOf<number>();
    expectTypeOf<AttemptDraft["lastMistakeFingerprint"]>()
      .toEqualTypeOf<string | null>();
  });

  it("models exact, range, and ignored cursor completion rules", () => {
    const exactRule: CompletionRule = {
      contentMatch: "exact",
      cursorMatch: { type: "exact", line: 1, column: 3 },
      requiredMode: "normal",
    };
    const rangeRule: CompletionRule = {
      contentMatch: "unchanged",
      cursorMatch: {
        type: "range",
        start: { line: 0, column: 0 },
        end: { line: 0, column: 5 },
      },
    };
    const ignoredRule: CompletionRule = {
      contentMatch: "exact",
      cursorMatch: { type: "ignore" },
    };

    expect(exactRule.cursorMatch.type).toBe("exact");
    expect(rangeRule.cursorMatch.type).toBe("range");
    expect(ignoredRule.cursorMatch.type).toBe("ignore");
  });

  it("exposes the fixed practice session unions", () => {
    expectTypeOf<PracticeSelectionType>().toEqualTypeOf<
      "course" | "daily_review" | "topic_practice" | "weakness_practice"
    >();
    expectTypeOf<PracticeSessionStatus>().toEqualTypeOf<
      "active" | "completed" | "abandoned"
    >();
  });
});

describe("isExerciseDefinition", () => {
  it("accepts a complete exercise definition", () => {
    const candidate = createExercise();

    expect(isExerciseDefinition(candidate)).toBe(true);
    if (!isExerciseDefinition(candidate)) {
      throw new Error("expected a valid exercise definition");
    }
    expectTypeOf(candidate).toEqualTypeOf<ExerciseDefinition>();
  });

  it("accepts a range cursor completion rule", () => {
    const candidate = createExercise({
      completionRule: {
        contentMatch: "unchanged",
        cursorMatch: {
          type: "range",
          start: { line: 0, column: 2 },
          end: { line: 0, column: 8 },
        },
      },
    });

    expect(isExerciseDefinition(candidate)).toBe(true);
  });

  it("rejects unsupported learning modes", () => {
    const candidate = createExercise({
      supportedModes: ["beginner", "expert"],
    });

    expect(isExerciseDefinition(candidate)).toBe(false);
  });

  it("rejects malformed cursor completion rules", () => {
    const candidate = createExercise({
      completionRule: {
        contentMatch: "exact",
        cursorMatch: { type: "range", start: { line: 0, column: 2 } },
      },
    });

    expect(isExerciseDefinition(candidate)).toBe(false);
  });

  it("rejects invalid positive numeric fields", () => {
    expect(isExerciseDefinition(createExercise({ version: 0 }))).toBe(false);
    expect(
      isExerciseDefinition(createExercise({ targetDurationMs: -1 })),
    ).toBe(false);
  });
});
