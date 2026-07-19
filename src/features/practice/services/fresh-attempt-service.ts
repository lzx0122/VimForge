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
    recordedActions: [],
    hasUserInteraction: false,
    unmetMessages: [],
  };
}
