import type { ExerciseLearningSnapshot } from "../../../domain/review/exercise-learning-snapshot";
import type {
  PracticeCandidate,
  PracticeCandidatePools,
} from "../../../domain/review/practice-selector";
import { stableSeededOrder } from "../../../domain/review/seeded-order";
import type { PracticeCandidateRecord } from "../repositories/practice-candidate-repository";

export interface PracticePoolBuildInput {
  candidates: readonly PracticeCandidateRecord[];
  snapshots: ReadonlyMap<string, ExerciseLearningSnapshot>;
  touchedSkillIds: readonly string[];
  now: Date;
}

/** A recent average below this (0-100) signals the learner is struggling. */
const WEAK_ACCURACY_THRESHOLD = 70;
const WEAK_SPEED_THRESHOLD = 70;
/** Needing this many hints or more recently signals the learner is struggling. */
const WEAK_HINT_LEVEL_THRESHOLD = 2;
/** How many days without an attempt before a previously-learned exercise resurfaces. */
const STALE_DAYS_THRESHOLD = 7;
const FAMILIAR_MIN_SUCCESSFUL_ATTEMPTS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function localCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasOnlyTouchedSkills(
  skillIds: readonly string[],
  touchedSkillIds: ReadonlySet<string>,
): boolean {
  return (
    skillIds.length > 0 &&
    skillIds.every((skillId) => touchedSkillIds.has(skillId))
  );
}

/**
 * The initial weakness/priority formula (see Task 10 plan). Missing signals
 * (no snapshot, or a null average) fall back to the same moderate defaults
 * whether the exercise was never attempted or simply has no valid data yet.
 */
function computePriority(
  snapshot: ExerciseLearningSnapshot | undefined,
): number {
  const failureWeight =
    snapshot === undefined
      ? 0
      : snapshot.lastCompleted === false
        ? 40
        : snapshot.failedAttemptCount * 5;
  const accuracyWeight =
    snapshot === undefined || snapshot.averageAccuracy === null
      ? 10
      : (100 - snapshot.averageAccuracy) * 0.25;
  const speedWeight =
    snapshot === undefined || snapshot.averageSpeed === null
      ? 5
      : (100 - snapshot.averageSpeed) * 0.15;
  const hintWeight = (snapshot?.highestRecentHintLevel ?? 0) * 5;
  const exposureWeight = Math.max(0, 3 - (snapshot?.attemptCount ?? 0)) * 4;

  return failureWeight + accuracyWeight + speedWeight + hintWeight + exposureWeight;
}

function isStale(snapshot: ExerciseLearningSnapshot, now: Date): boolean {
  if (snapshot.lastAttemptAt === null) {
    return false;
  }
  const elapsedDays =
    (now.getTime() - Date.parse(snapshot.lastAttemptAt)) / MS_PER_DAY;
  return elapsedDays >= STALE_DAYS_THRESHOLD;
}

function isWeak(snapshot: ExerciseLearningSnapshot): boolean {
  return (
    (snapshot.averageAccuracy !== null &&
      snapshot.averageAccuracy < WEAK_ACCURACY_THRESHOLD) ||
    (snapshot.averageSpeed !== null &&
      snapshot.averageSpeed < WEAK_SPEED_THRESHOLD) ||
    snapshot.highestRecentHintLevel >= WEAK_HINT_LEVEL_THRESHOLD
  );
}

function isFamiliar(snapshot: ExerciseLearningSnapshot): boolean {
  return snapshot.successfulAttemptCount >= FAMILIAR_MIN_SUCCESSFUL_ATTEMPTS;
}

type PoolName = keyof PracticeCandidatePools;

/**
 * Classify a candidate into exactly one pool. Order matters: a failed last
 * attempt always wins (dueOrIncorrect); a long-unseen success resurfaces as
 * stale before it can be called familiar, since spaced repetition should
 * favor bringing old material back over treating it as already comfortable.
 */
function classify(
  snapshot: ExerciseLearningSnapshot | undefined,
  now: Date,
): PoolName {
  if (snapshot === undefined) {
    return "sameDifficulty";
  }
  if (snapshot.lastCompleted === false) {
    return "dueOrIncorrect";
  }
  if (isStale(snapshot, now)) {
    return "stale";
  }
  if (isWeak(snapshot)) {
    return "weak";
  }
  if (isFamiliar(snapshot)) {
    return "familiar";
  }
  return "sameDifficulty";
}

/**
 * Classify published practice candidates into review pools and compute each
 * one's weakness priority, using only local attempt-history snapshots (the
 * P0.2 attempt-snapshot adapter - persisted mastery/review projections
 * arrive in P0.3). Candidates outside the learner's touched skills never
 * appear in daily review. Tie order is deterministically reshuffled per
 * calendar day via `now`, so repeat visits on the same day are stable but
 * different days see different variety.
 */
export function buildPracticeCandidatePools(
  input: PracticePoolBuildInput,
): PracticeCandidatePools {
  const touchedSkillIds = new Set(input.touchedSkillIds);
  const seed = localCalendarDate(input.now);
  const orderedCandidates = stableSeededOrder(
    input.candidates,
    seed,
    (candidate) => candidate.exerciseId,
  );

  const pools: Record<PoolName, PracticeCandidate[]> = {
    dueOrIncorrect: [],
    weak: [],
    familiar: [],
    stale: [],
    sameDifficulty: [],
  };

  for (const candidate of orderedCandidates) {
    if (!hasOnlyTouchedSkills(candidate.skillIds, touchedSkillIds)) {
      continue;
    }

    const snapshot = input.snapshots.get(candidate.exerciseId);
    const poolName = classify(snapshot, input.now);

    pools[poolName].push({
      exerciseId: candidate.exerciseId,
      skillIds: candidate.skillIds,
      priority: computePriority(snapshot),
    });
  }

  return pools;
}
