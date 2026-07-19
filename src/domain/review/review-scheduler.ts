import type { HintLevel } from "../../types";
import {
  FAILURE_MAX_QUALITY,
  type MasteryLevel,
} from "../mastery/mastery-config";
import type { PerformanceQuality } from "../scoring/scoring-calculator";

const DAY_MS = 86_400_000;
export const FAILED_REVIEW_DELAY_MINUTES = 10;
const FAILED_REVIEW_DELAY_MS = FAILED_REVIEW_DELAY_MINUTES * 60 * 1_000;

export const LEVEL_BASE_INTERVAL_DAYS: Readonly<
  Record<MasteryLevel, number>
> = {
  0: 0.25,
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export const QUALITY_INTERVAL_MULTIPLIERS: Readonly<
  Record<PerformanceQuality, number>
> = {
  0: 0,
  1: 0,
  2: 0,
  3: 0.75,
  4: 1,
  5: 1.25,
};

export const HINT_MAX_INTERVAL_DAYS: Readonly<
  Record<HintLevel, number>
> = {
  0: 30,
  1: 14,
  2: 7,
  3: 3,
  4: 1,
};

export const MAX_REVIEW_INTERVAL_DAYS = 30;

export interface ReviewScheduleInput {
  masteryLevel: MasteryLevel;
  performanceQuality: PerformanceQuality;
  highestHintLevel: HintLevel;
  currentIntervalDays: number;
  now: Date;
  sessionTailAt?: Date;
}

export interface ReviewSchedule {
  intervalDays: number;
  dueAt: Date;
  requeueAtSessionEnd: boolean;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function failedSchedule(input: ReviewScheduleInput): ReviewSchedule {
  const nowMs = input.now.getTime();
  const sessionTailMs = input.sessionTailAt?.getTime();
  const hasFutureSessionTail =
    sessionTailMs !== undefined &&
    Number.isFinite(sessionTailMs) &&
    sessionTailMs > nowMs;
  const dueAtMs = hasFutureSessionTail
    ? sessionTailMs
    : nowMs + FAILED_REVIEW_DELAY_MS;

  return {
    intervalDays: 0,
    dueAt: new Date(dueAtMs),
    requeueAtSessionEnd: hasFutureSessionTail,
  };
}

export function scheduleReview(
  input: ReviewScheduleInput,
): ReviewSchedule {
  if (input.performanceQuality <= FAILURE_MAX_QUALITY) {
    return failedSchedule(input);
  }

  const baseInterval = Math.max(
    LEVEL_BASE_INTERVAL_DAYS[input.masteryLevel],
    clamp(input.currentIntervalDays, 0, MAX_REVIEW_INTERVAL_DAYS),
  );
  const multipliedInterval =
    baseInterval * QUALITY_INTERVAL_MULTIPLIERS[input.performanceQuality];
  const intervalDays = roundToTwoDecimals(
    Math.min(
      multipliedInterval,
      HINT_MAX_INTERVAL_DAYS[input.highestHintLevel],
      MAX_REVIEW_INTERVAL_DAYS,
    ),
  );

  return {
    intervalDays,
    dueAt: new Date(input.now.getTime() + intervalDays * DAY_MS),
    requeueAtSessionEnd: false,
  };
}
