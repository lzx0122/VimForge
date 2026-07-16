export const LEARNING_MODES = [
  "beginner",
  "memory_review",
  "efficiency",
] as const;

export type LearningMode = (typeof LEARNING_MODES)[number];

export const QUESTION_COUNTS = [5, 10, 20] as const;

export type QuestionCount = (typeof QUESTION_COUNTS)[number];

export const VIM_MODES = [
  "normal",
  "insert",
  "visual",
  "replace",
  "command",
] as const;

export type VimMode = (typeof VIM_MODES)[number];

export const EXERCISE_SOURCES = [
  "web",
  "neovim",
  "ideavim",
  "vscode_vim",
] as const;

export type ExerciseSource = (typeof EXERCISE_SOURCES)[number];

export interface CursorPosition {
  line: number;
  column: number;
}
