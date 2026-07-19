import type { HintLevel, LearningMode } from "../../types";

export const SPEED_WEIGHTS = {
  keystrokes: 0.6,
  time: 0.4,
} as const;

export const TIME_ALLOWANCE_MULTIPLIERS: Readonly<
  Record<LearningMode, number>
> = {
  beginner: 2,
  memory_review: 1.3,
  efficiency: 1,
};

export const ACCURACY_PENALTIES = {
  mistake: 5,
  undo: 3,
  reset: 12,
} as const;

export const HINT_PENALTIES: Readonly<Record<HintLevel, number>> = {
  0: 0,
  1: 3,
  2: 8,
  3: 15,
  4: 30,
};

export const PERFORMANCE_WEIGHTS = {
  speed: 0.5,
  accuracy: 0.5,
} as const;

export const PERFORMANCE_QUALITY_BANDS = [
  { minimumScore: 90, quality: 5 },
  { minimumScore: 75, quality: 4 },
  { minimumScore: 50, quality: 3 },
  { minimumScore: 25, quality: 2 },
  { minimumScore: 1, quality: 1 },
  { minimumScore: 0, quality: 0 },
] as const;
