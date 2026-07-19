import type { HintLevel, LearningMode } from "../../types";
import type { PerformanceQuality } from "../scoring/scoring-calculator";

export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const PRACTICE_CONTEXTS = [
  "same_exercise_immediate",
  "different_exercise",
  "next_day",
  "seven_days",
] as const;

export type MasteryPracticeContext = (typeof PRACTICE_CONTEXTS)[number];

export const QUALITY_SCORE_CHANGES: Readonly<
  Record<PerformanceQuality, number>
> = {
  0: -12,
  1: -8,
  2: -4,
  3: 4,
  4: 7,
  5: 10,
};

export const MASTERY_MODE_MULTIPLIERS: Readonly<
  Record<LearningMode, number>
> = {
  beginner: 0.75,
  memory_review: 1,
  efficiency: 1.15,
};

export const MASTERY_HINT_MULTIPLIERS: Readonly<
  Record<HintLevel, number>
> = {
  0: 1,
  1: 0.85,
  2: 0.65,
  3: 0.4,
  4: 0.15,
};

export const MASTERY_CONTEXT_MULTIPLIERS: Readonly<
  Record<MasteryPracticeContext, number>
> = {
  same_exercise_immediate: 0.4,
  different_exercise: 1,
  next_day: 1.2,
  seven_days: 1.35,
};

export interface MasteryLevelRequirement {
  minimumScore: number;
  minimumSuccessfulAttempts: number;
  minimumUniqueExercises: number;
  minimumConsecutiveSuccesses: number;
  requiresSevenDayUnhintedSuccess: boolean;
}

export const MASTERY_LEVEL_REQUIREMENTS: Readonly<
  Record<MasteryLevel, MasteryLevelRequirement>
> = {
  0: {
    minimumScore: 0,
    minimumSuccessfulAttempts: 0,
    minimumUniqueExercises: 0,
    minimumConsecutiveSuccesses: 0,
    requiresSevenDayUnhintedSuccess: false,
  },
  1: {
    minimumScore: 20,
    minimumSuccessfulAttempts: 0,
    minimumUniqueExercises: 0,
    minimumConsecutiveSuccesses: 0,
    requiresSevenDayUnhintedSuccess: false,
  },
  2: {
    minimumScore: 40,
    minimumSuccessfulAttempts: 0,
    minimumUniqueExercises: 0,
    minimumConsecutiveSuccesses: 0,
    requiresSevenDayUnhintedSuccess: false,
  },
  3: {
    minimumScore: 60,
    minimumSuccessfulAttempts: 3,
    minimumUniqueExercises: 2,
    minimumConsecutiveSuccesses: 2,
    requiresSevenDayUnhintedSuccess: false,
  },
  4: {
    minimumScore: 75,
    minimumSuccessfulAttempts: 6,
    minimumUniqueExercises: 3,
    minimumConsecutiveSuccesses: 3,
    requiresSevenDayUnhintedSuccess: false,
  },
  5: {
    minimumScore: 85,
    minimumSuccessfulAttempts: 10,
    minimumUniqueExercises: 5,
    minimumConsecutiveSuccesses: 5,
    requiresSevenDayUnhintedSuccess: true,
  },
};

export const HIGH_LEVEL_FAILURE_MINIMUM = 4;
export const FAILURE_MAX_QUALITY: PerformanceQuality = 2;
export const HIGH_LEVEL_FAILURE_MAX_SCORE_LOSS = 5;
