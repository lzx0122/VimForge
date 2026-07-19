import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type { HintLevel } from "../../types/attempt";

export interface ExerciseLearningSnapshot {
  exerciseId: string;
  attemptCount: number;
  successfulAttemptCount: number;
  failedAttemptCount: number;
  lastAttemptAt: string | null;
  lastCompleted: boolean | null;
  averageAccuracy: number | null;
  averageSpeed: number | null;
  highestRecentHintLevel: HintLevel;
  sameDayAttemptCount: number;
}

/** How many of the most recently dated attempts count toward highestRecentHintLevel. */
const RECENT_HINT_WINDOW = 3;

function effectiveTimestamp(attempt: AttemptSyncInput): string {
  return attempt.completedAt ?? attempt.startedAt;
}

function isParseableTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function calendarDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function groupByExerciseId(
  attempts: readonly AttemptSyncInput[],
): Map<string, AttemptSyncInput[]> {
  const groups = new Map<string, AttemptSyncInput[]>();

  for (const attempt of attempts) {
    const group = groups.get(attempt.exerciseId);
    if (group === undefined) {
      groups.set(attempt.exerciseId, [attempt]);
    } else {
      group.push(attempt);
    }
  }

  return groups;
}

function buildSnapshot(
  exerciseId: string,
  attempts: readonly AttemptSyncInput[],
  nowCalendarDate: string,
): ExerciseLearningSnapshot {
  const chronological = attempts
    .filter((attempt) => isParseableTimestamp(effectiveTimestamp(attempt)))
    .sort(
      (a, b) =>
        Date.parse(effectiveTimestamp(b)) - Date.parse(effectiveTimestamp(a)),
    );
  const mostRecent = chronological[0] ?? null;
  const recentWindow = chronological.slice(0, RECENT_HINT_WINDOW);

  const successfulAttemptCount = attempts.filter(
    (attempt) => attempt.completed,
  ).length;

  let highestRecentHintLevel = 0;
  for (const attempt of recentWindow) {
    highestRecentHintLevel = Math.max(
      highestRecentHintLevel,
      attempt.highestHintLevel,
    );
  }

  return {
    exerciseId,
    attemptCount: attempts.length,
    successfulAttemptCount,
    failedAttemptCount: attempts.length - successfulAttemptCount,
    lastAttemptAt: mostRecent === null ? null : effectiveTimestamp(mostRecent),
    lastCompleted: mostRecent === null ? null : mostRecent.completed,
    averageAccuracy: average(attempts.map((attempt) => attempt.accuracyScore)),
    averageSpeed: average(attempts.map((attempt) => attempt.speedScore)),
    highestRecentHintLevel: highestRecentHintLevel as HintLevel,
    sameDayAttemptCount: chronological.filter(
      (attempt) => calendarDate(effectiveTimestamp(attempt)) === nowCalendarDate,
    ).length,
  };
}

/**
 * Reduce raw local attempt history into one learning snapshot per exercise.
 * Pure: relies entirely on the supplied `now` for recency, never reads the
 * clock itself, so results are deterministic and testable.
 */
export function buildExerciseLearningSnapshots(
  attempts: readonly AttemptSyncInput[],
  now: Date,
): ReadonlyMap<string, ExerciseLearningSnapshot> {
  const nowCalendarDate = calendarDate(now.toISOString());
  const snapshots = new Map<string, ExerciseLearningSnapshot>();

  for (const [exerciseId, exerciseAttempts] of groupByExerciseId(attempts)) {
    snapshots.set(
      exerciseId,
      buildSnapshot(exerciseId, exerciseAttempts, nowCalendarDate),
    );
  }

  return snapshots;
}
