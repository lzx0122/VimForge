import type {
  CursorMatchRule,
  CursorPosition,
  ExerciseDefinition,
  VimMode,
} from "../../types";

export interface EditorSnapshot {
  content: string;
  cursor: CursorPosition;
  mode: VimMode;
}

export type UnmetCondition =
  | { type: "content"; message: string }
  | { type: "cursor"; message: string }
  | { type: "mode"; message: string };

export interface ExerciseEvaluation {
  completed: boolean;
  contentMatched: boolean;
  cursorMatched: boolean;
  modeMatched: boolean;
  unmetConditions: UnmetCondition[];
}

const MODE_LABELS: Readonly<Record<VimMode, string>> = {
  normal: "Normal",
  insert: "Insert",
  visual: "Visual",
  replace: "Replace",
  command: "Command",
};

function normalizeLineEndings(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function compareCursorPositions(
  left: CursorPosition,
  right: CursorPosition,
) {
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  return left.column - right.column;
}

function cursorMatches(
  rule: CursorMatchRule,
  cursor: CursorPosition,
) {
  switch (rule.type) {
    case "ignore":
      return true;
    case "exact":
      return cursor.line === rule.line && cursor.column === rule.column;
    case "range":
      return (
        compareCursorPositions(cursor, rule.start) >= 0 &&
        compareCursorPositions(cursor, rule.end) <= 0
      );
  }
}

function modeMessage(requiredMode: VimMode) {
  if (requiredMode === "normal") {
    return "請回到 Normal Mode";
  }
  return `請切換到 ${MODE_LABELS[requiredMode]} Mode`;
}

export function evaluateExercise(
  exercise: ExerciseDefinition,
  snapshot: EditorSnapshot,
): ExerciseEvaluation {
  const { completionRule } = exercise;
  const expectedContent =
    completionRule.contentMatch === "exact"
      ? exercise.expectedContent
      : exercise.initialContent;
  const contentMatched =
    normalizeLineEndings(snapshot.content) ===
    normalizeLineEndings(expectedContent);
  const cursorMatched = cursorMatches(
    completionRule.cursorMatch,
    snapshot.cursor,
  );
  const modeMatched = completionRule.requiredMode
    ? snapshot.mode === completionRule.requiredMode
    : true;
  const unmetConditions: UnmetCondition[] = [];

  if (!contentMatched) {
    unmetConditions.push({
      type: "content",
      message: "內容尚未符合題目要求",
    });
  }
  if (!cursorMatched) {
    unmetConditions.push({
      type: "cursor",
      message: "游標位置尚未符合題目要求",
    });
  }
  if (!modeMatched && completionRule.requiredMode) {
    unmetConditions.push({
      type: "mode",
      message: modeMessage(completionRule.requiredMode),
    });
  }

  return {
    completed: contentMatched && cursorMatched && modeMatched,
    contentMatched,
    cursorMatched,
    modeMatched,
    unmetConditions,
  };
}
