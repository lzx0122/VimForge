import type {
  CursorPosition,
  LearningMode,
  VimMode,
} from "./learning";

export type NormalizedAction =
  | { type: "vim_command"; command: string }
  | { type: "insert_text"; text: string; textLength: number }
  | { type: "mode_change"; mode: VimMode }
  | { type: "undo" }
  | { type: "reset" }
  | {
      type: "search";
      query: string;
      direction: "forward" | "backward";
    };

export type HintLevel = 0 | 1 | 2 | 3 | 4;

export interface AttemptDraft {
  clientAttemptId: string;
  exerciseId: string;
  exerciseVersion: number;
  learningMode: LearningMode;
  source: "web";
  startedAt: string;
  completedAt: string | null;
  initialContent: string;
  currentContent: string;
  initialCursor: CursorPosition;
  currentCursor: CursorPosition;
  currentMode: VimMode;
  actions: NormalizedAction[];
  mistakeCount: number;
  undoCount: number;
  resetCount: number;
  highestHintLevel: HintLevel;
  completed: boolean;
}
