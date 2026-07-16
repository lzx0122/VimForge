import type { HintLevel, LearningMode } from "../../types";
import {
  ACCURACY_PENALTIES,
  HINT_PENALTIES,
  PERFORMANCE_QUALITY_BANDS,
  PERFORMANCE_WEIGHTS,
  SPEED_WEIGHTS,
  TIME_ALLOWANCE_MULTIPLIERS,
} from "./scoring-config";

export type PerformanceQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface AttemptScoreInput {
  learningMode: LearningMode;
  completed: boolean;
  recommendedKeystrokeCount: number;
  actualKeystrokeCount: number;
  targetDurationMs: number;
  durationMs: number;
  mistakeCount: number;
  undoCount: number;
  resetCount: number;
  highestHintLevel: HintLevel;
}

export interface ScoreResult {
  speedScore: number;
  accuracyScore: number;
  performanceQuality: PerformanceQuality;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function ratioScore(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return numerator >= 0 ? 100 : 0;
  }
  return clamp((numerator / denominator) * 100, 0, 100);
}

function calculateSpeedScore(input: AttemptScoreInput) {
  if (!input.completed) {
    return 0;
  }

  const keystrokeEfficiency = ratioScore(
    input.recommendedKeystrokeCount,
    input.actualKeystrokeCount,
  );
  const allowedDuration =
    input.targetDurationMs *
    TIME_ALLOWANCE_MULTIPLIERS[input.learningMode];
  const timeEfficiency = ratioScore(allowedDuration, input.durationMs);

  return Math.round(
    clamp(
      keystrokeEfficiency * SPEED_WEIGHTS.keystrokes +
        timeEfficiency * SPEED_WEIGHTS.time,
      0,
      100,
    ),
  );
}

function calculateAccuracyScore(input: AttemptScoreInput) {
  if (!input.completed) {
    return 0;
  }

  const penalty =
    Math.max(0, input.mistakeCount) * ACCURACY_PENALTIES.mistake +
    Math.max(0, input.undoCount) * ACCURACY_PENALTIES.undo +
    Math.max(0, input.resetCount) * ACCURACY_PENALTIES.reset +
    HINT_PENALTIES[input.highestHintLevel];

  return Math.round(clamp(100 - penalty, 0, 100));
}

function toPerformanceQuality(score: number): PerformanceQuality {
  for (const band of PERFORMANCE_QUALITY_BANDS) {
    if (score >= band.minimumScore) {
      return band.quality;
    }
  }
  return 0;
}

export function calculateAttemptScore(
  input: AttemptScoreInput,
): ScoreResult {
  const speedScore = calculateSpeedScore(input);
  const accuracyScore = calculateAccuracyScore(input);
  const performanceScore =
    speedScore * PERFORMANCE_WEIGHTS.speed +
    accuracyScore * PERFORMANCE_WEIGHTS.accuracy;

  return {
    speedScore,
    accuracyScore,
    performanceQuality: toPerformanceQuality(performanceScore),
  };
}
