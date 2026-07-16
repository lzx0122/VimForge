import {
  LEARNING_MODES,
  VIM_MODES,
  type CursorPosition,
  type LearningMode,
  type VimMode,
} from "./learning";

export const SUPPORTED_LANGUAGES = [
  "csharp",
  "typescript",
  "javascript",
  "json",
  "html",
  "css",
  "sql",
  "markdown",
  "plaintext",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const EXERCISE_TYPES = [
  "tutorial",
  "guided",
  "challenge",
  "review",
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

export type ContentMatchRule = "exact" | "unchanged";

export type CursorMatchRule =
  | { type: "ignore" }
  | { type: "exact"; line: number; column: number }
  | { type: "range"; start: CursorPosition; end: CursorPosition };

export interface CompletionRule {
  contentMatch: ContentMatchRule;
  cursorMatch: CursorMatchRule;
  requiredMode?: VimMode;
}

export interface ExerciseDefinition {
  id: string;
  unitId: string;
  slug: string;
  title: string;
  instruction: string;
  language: SupportedLanguage;
  exerciseType: ExerciseType;
  difficulty: Difficulty;
  initialContent: string;
  expectedContent: string;
  initialCursor: CursorPosition;
  completionRule: CompletionRule;
  supportedModes: LearningMode[];
  targetDurationMs: number;
  version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isCursorPosition(value: unknown): value is CursorPosition {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.line) &&
    isNonNegativeInteger(value.column)
  );
}

function isCursorMatchRule(value: unknown): value is CursorMatchRule {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === "ignore") {
    return true;
  }

  if (value.type === "exact") {
    return (
      isNonNegativeInteger(value.line) &&
      isNonNegativeInteger(value.column)
    );
  }

  return (
    value.type === "range" &&
    isCursorPosition(value.start) &&
    isCursorPosition(value.end)
  );
}

function isCompletionRule(value: unknown): value is CompletionRule {
  if (
    !isRecord(value) ||
    !isOneOf(value.contentMatch, ["exact", "unchanged"]) ||
    !isCursorMatchRule(value.cursorMatch)
  ) {
    return false;
  }

  return (
    !("requiredMode" in value) || isOneOf(value.requiredMode, VIM_MODES)
  );
}

export function isExerciseDefinition(
  value: unknown,
): value is ExerciseDefinition {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.unitId) &&
    isNonEmptyString(value.slug) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.instruction) &&
    isOneOf(value.language, SUPPORTED_LANGUAGES) &&
    isOneOf(value.exerciseType, EXERCISE_TYPES) &&
    isOneOf(value.difficulty, DIFFICULTIES) &&
    typeof value.initialContent === "string" &&
    typeof value.expectedContent === "string" &&
    isCursorPosition(value.initialCursor) &&
    isCompletionRule(value.completionRule) &&
    Array.isArray(value.supportedModes) &&
    value.supportedModes.length > 0 &&
    value.supportedModes.every((mode) => isOneOf(mode, LEARNING_MODES)) &&
    isPositiveInteger(value.targetDurationMs) &&
    isPositiveInteger(value.version)
  );
}
