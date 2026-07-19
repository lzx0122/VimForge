import type { HintLevel, LearningMode } from "../../types";
import type { PerformanceQuality } from "../scoring/scoring-calculator";
import {
  FAILURE_MAX_QUALITY,
  HIGH_LEVEL_FAILURE_MAX_SCORE_LOSS,
  HIGH_LEVEL_FAILURE_MINIMUM,
  MASTERY_CONTEXT_MULTIPLIERS,
  MASTERY_HINT_MULTIPLIERS,
  MASTERY_LEVEL_REQUIREMENTS,
  MASTERY_MODE_MULTIPLIERS,
  QUALITY_SCORE_CHANGES,
  type MasteryLevel,
  type MasteryPracticeContext,
} from "./mastery-config";

export interface MasteryUpdateInput {
  previousScore: number;
  previousLevel: MasteryLevel;
  performanceQuality: PerformanceQuality;
  learningMode: LearningMode;
  highestHintLevel: HintLevel;
  practiceContext: MasteryPracticeContext;
  skillWeight: number;
  successfulAttempts: number;
  uniqueExercisesCompleted: number;
  consecutiveSuccesses: number;
  hasSevenDayUnhintedSuccess: boolean;
}

export interface MasteryUpdate {
  previousScore: number;
  nextScore: number;
  previousLevel: MasteryLevel;
  nextLevel: MasteryLevel;
  delta: number;
}

const LEVELS_DESCENDING = [5, 4, 3, 2, 1, 0] as const;

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function meetsLevelRequirement(
  level: MasteryLevel,
  score: number,
  input: MasteryUpdateInput,
) {
  const requirement = MASTERY_LEVEL_REQUIREMENTS[level];
  return (
    score >= requirement.minimumScore &&
    input.successfulAttempts >= requirement.minimumSuccessfulAttempts &&
    input.uniqueExercisesCompleted >= requirement.minimumUniqueExercises &&
    input.consecutiveSuccesses >= requirement.minimumConsecutiveSuccesses &&
    (!requirement.requiresSevenDayUnhintedSuccess ||
      input.hasSevenDayUnhintedSuccess)
  );
}

function levelForScore(score: number, input: MasteryUpdateInput) {
  return (
    LEVELS_DESCENDING.find((level) =>
      meetsLevelRequirement(level, score, input),
    ) ?? 0
  );
}

function protectHighLevelFailure(
  calculatedLevel: MasteryLevel,
  previousLevel: MasteryLevel,
) {
  if (previousLevel === 5 && calculatedLevel < 4) {
    return 4;
  }
  if (previousLevel === 4 && calculatedLevel < 3) {
    return 3;
  }
  return calculatedLevel;
}

export function calculateMasteryUpdate(
  input: MasteryUpdateInput,
): MasteryUpdate {
  const previousScore = roundToTwoDecimals(
    clamp(input.previousScore, 0, 100),
  );
  const skillWeight = clamp(input.skillWeight, 0, 1);
  let calculatedDelta =
    QUALITY_SCORE_CHANGES[input.performanceQuality] *
    MASTERY_MODE_MULTIPLIERS[input.learningMode] *
    MASTERY_HINT_MULTIPLIERS[input.highestHintLevel] *
    MASTERY_CONTEXT_MULTIPLIERS[input.practiceContext] *
    skillWeight;
  const isFailure = input.performanceQuality <= FAILURE_MAX_QUALITY;
  const isProtectedHighLevelFailure =
    isFailure && input.previousLevel >= HIGH_LEVEL_FAILURE_MINIMUM;

  if (isProtectedHighLevelFailure) {
    calculatedDelta = Math.max(
      calculatedDelta,
      -HIGH_LEVEL_FAILURE_MAX_SCORE_LOSS,
    );
  }

  const nextScore = roundToTwoDecimals(
    clamp(previousScore + calculatedDelta, 0, 100),
  );
  const delta = roundToTwoDecimals(nextScore - previousScore);
  const calculatedLevel = levelForScore(nextScore, input);
  const nextLevel = isProtectedHighLevelFailure
    ? protectHighLevelFailure(calculatedLevel, input.previousLevel)
    : calculatedLevel;

  return {
    previousScore,
    nextScore,
    previousLevel: input.previousLevel,
    nextLevel,
    delta,
  };
}
