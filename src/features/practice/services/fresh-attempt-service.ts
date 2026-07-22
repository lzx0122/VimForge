import type { EditorSnapshot } from "../../../domain/exercise/exercise-evaluator";
import type { HintLevel, NormalizedAction } from "../../../types/attempt";
import type { PracticeExercise } from "../repositories/exercise-repository";

export interface FreshAttemptState {
  clientAttemptId: string;
  startedAt: string;
  snapshot: EditorSnapshot;
  highestHintLevel: HintLevel;
  resetCount: number;
  keystrokeCount: number;
  mistakeCount: number;
  lastMistakeFingerprint: string | null;
  recordedActions: NormalizedAction[];
  hasUserInteraction: boolean;
  unmetMessages: string[];
}

export interface CreateFreshAttemptStateInput {
  exercise: Pick<PracticeExercise, "initialContent" | "initialCursor">;
  clientAttemptId: string;
  startedAt: string;
}

export function createFreshAttemptState(
  input: CreateFreshAttemptStateInput,
): FreshAttemptState {
  return {
    clientAttemptId: input.clientAttemptId,
    startedAt: input.startedAt,
    snapshot: {
      content: input.exercise.initialContent,
      cursor: { ...input.exercise.initialCursor },
      mode: "normal",
    },
    highestHintLevel: 0,
    resetCount: 0,
    keystrokeCount: 0,
    mistakeCount: 0,
    lastMistakeFingerprint: null,
    recordedActions: [],
    hasUserInteraction: false,
    unmetMessages: [],
  };
}

export interface RestartCurrentAttemptInput {
  exercise: Pick<PracticeExercise, "initialContent" | "initialCursor">;
  current: FreshAttemptState;
}

export function restartCurrentAttempt(
  input: RestartCurrentAttemptInput,
): FreshAttemptState {
  const { exercise, current } = input;

  return {
    clientAttemptId: current.clientAttemptId,
    startedAt: current.startedAt,
    snapshot: {
      content: exercise.initialContent,
      cursor: { ...exercise.initialCursor },
      mode: "normal",
    },
    highestHintLevel: current.highestHintLevel,
    resetCount: current.resetCount + 1,
    keystrokeCount: current.keystrokeCount,
    mistakeCount: current.mistakeCount,
    lastMistakeFingerprint: current.lastMistakeFingerprint,
    recordedActions: [
      ...current.recordedActions.map((action) => ({ ...action })),
      { type: "reset" },
    ],
    hasUserInteraction: current.hasUserInteraction,
    unmetMessages: [],
  };
}
