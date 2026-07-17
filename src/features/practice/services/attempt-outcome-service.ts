import type {
  MasteryLevel,
  MasteryPracticeContext,
} from "../../../domain/mastery/mastery-config";
import {
  calculateAttemptScore,
  type ScoreResult,
} from "../../../domain/scoring/scoring-calculator";
import {
  matchSolution,
  type SolutionMatch,
} from "../../../domain/exercise/solution-matcher";
import { formatActionSequence } from "../../../domain/exercise/action-sequence-formatter";
import type {
  HintLevel,
  NormalizedAction,
} from "../../../types/attempt";
import type { LearningMode } from "../../../types/learning";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import type { PracticeExercise } from "../repositories/exercise-repository";

export interface AttemptOutcomeInput {
  exercise: PracticeExercise;
  sessionId: string;
  learningMode: LearningMode;
  clientAttemptId: string;
  startedAt: string;
  completedAt: string;
  completed: boolean;
  actualKeystrokeCount: number;
  mistakeCount: number;
  undoCount: number;
  resetCount: number;
  highestHintLevel: HintLevel;
  normalizedActions: readonly NormalizedAction[];
  practiceContext?: MasteryPracticeContext;
}

export interface AttemptFeedback {
  completed: boolean;
  score: ScoreResult;
  previousMasteryLevel: MasteryLevel;
  nextMasteryLevel: MasteryLevel;
  userSequence: string;
  recommendedSequence: string;
  improvementReason: string;
  actualKeystrokeCount: number;
  recommendedKeystrokeCount: number;
  normalizedActions: NormalizedAction[];
}

export interface AttemptOutcome {
  attempt: AttemptSyncInput;
  feedback: AttemptFeedback;
  solutionMatch: SolutionMatch | null;
}

function elapsedMilliseconds(startedAt: string, completedAt: string): number {
  const elapsed = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(elapsed) ? Math.max(1, elapsed) : 1;
}

function feedbackReason(
  match: SolutionMatch | null,
  recommendedExplanation: string,
): string {
  if (match === "unknown_valid") {
    return `你的最終結果正確；操作未收錄於題庫。${recommendedExplanation}`;
  }
  if (match === "valid_but_inefficient") {
    return `結果正確，但還能使用更少按鍵。${recommendedExplanation}`;
  }
  return recommendedExplanation;
}

export function createAttemptOutcome(
  input: AttemptOutcomeInput,
): AttemptOutcome {
  const actualKeystrokeCount = Math.max(
    1,
    Math.floor(input.actualKeystrokeCount),
  );
  const durationMs = elapsedMilliseconds(input.startedAt, input.completedAt);
  const recommended = input.exercise.solutions.find(
    (solution) => solution.recommended,
  );
  const recommendedKeystrokeCount =
    recommended?.keystrokeCount ?? actualKeystrokeCount;
  const score = calculateAttemptScore({
    learningMode: input.learningMode,
    completed: input.completed,
    recommendedKeystrokeCount,
    actualKeystrokeCount,
    targetDurationMs: input.exercise.targetDurationMs,
    durationMs,
    mistakeCount: input.mistakeCount,
    undoCount: input.undoCount,
    resetCount: input.resetCount,
    highestHintLevel: input.highestHintLevel,
  });
  const normalizedActions = input.normalizedActions.map((action) => ({
    ...action,
  }));
  const solutionMatch = matchSolution({
    actions: normalizedActions,
    completed: input.completed,
    solutions: input.exercise.solutions.map((solution) => ({
      normalizedActions: solution.normalizedActions,
      keystrokeCount: solution.keystrokeCount,
      isRecommended: solution.recommended,
    })),
  });
  const recommendedSequence = recommended?.sequence ?? "—";
  const userSequence = formatActionSequence(normalizedActions);

  return {
    solutionMatch,
    attempt: {
      clientAttemptId: input.clientAttemptId,
      sessionId: input.sessionId,
      exerciseId: input.exercise.id,
      exerciseVersion: input.exercise.version,
      learningMode: input.learningMode,
      source: "web",
      completed: input.completed,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs,
      keystrokeCount: actualKeystrokeCount,
      recommendedKeystrokeCount,
      mistakeCount: input.mistakeCount,
      undoCount: input.undoCount,
      resetCount: input.resetCount,
      highestHintLevel: input.highestHintLevel,
      usedRecommendedSolution: solutionMatch === "recommended",
      normalizedActions,
      speedScore: score.speedScore,
      accuracyScore: score.accuracyScore,
      performanceQuality: score.performanceQuality,
      practiceContext: input.practiceContext ?? "different_exercise",
    },
    feedback: {
      completed: input.completed,
      score,
      previousMasteryLevel: 0,
      nextMasteryLevel: input.completed ? 1 : 0,
      userSequence,
      recommendedSequence,
      improvementReason: feedbackReason(
        solutionMatch,
        recommended?.explanation ?? "題庫目前沒有推薦解法。",
      ),
      actualKeystrokeCount,
      recommendedKeystrokeCount,
      normalizedActions,
    },
  };
}
