import {
  evaluateExercise,
  type EditorSnapshot,
  type ExerciseEvaluation,
} from "../../../domain/exercise/exercise-evaluator";
import type { ExerciseDefinition } from "../../../types";

export interface AutoCompletionResult {
  evaluation: ExerciseEvaluation;
  shouldSubmit: boolean;
}

export function evaluateAutoCompletion(
  exercise: ExerciseDefinition,
  snapshot: EditorSnapshot,
  hasUserInteraction: boolean,
): AutoCompletionResult {
  const evaluation = evaluateExercise(exercise, snapshot);

  return {
    evaluation,
    shouldSubmit: hasUserInteraction && evaluation.completed,
  };
}
