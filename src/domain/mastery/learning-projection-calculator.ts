import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type {
  ExerciseSkillLink,
  PracticeExercise,
} from "../../features/practice/repositories/exercise-repository";
import type {
  SkillMasteryChange,
  StoredExerciseReview,
  StoredLearningOutcome,
  StoredSkillMastery,
} from "../../types/learning-projection";
import { scheduleReview } from "../review/review-scheduler";
import { calculateMasteryUpdate } from "./mastery-calculator";
import type { MasteryLevel } from "./mastery-config";

export interface LearningProjectionInput {
  attempt: AttemptSyncInput;
  exercise: PracticeExercise;
  previousMastery: ReadonlyMap<string, StoredSkillMastery>;
  previousReview: StoredExerciseReview | null;
  now: Date;
}

export interface LearningProjectionResult {
  masteryUpdates: StoredSkillMastery[];
  reviewUpdate: StoredExerciseReview;
  learningOutcome: StoredLearningOutcome;
}

interface SkillProjection {
  mastery: StoredSkillMastery;
  change: SkillMasteryChange;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * StoredLearningOutcome requires a real sessionId and completedAt - silently
 * substituting "" or startedAt would let a malformed attempt produce a
 * corrupted projection record. Fail loudly instead.
 */
function requireCompletedAttemptContext(attempt: AttemptSyncInput): {
  sessionId: string;
  completedAt: string;
} {
  if (attempt.sessionId === null) {
    throw new Error(
      "Learning projection requires an attempt with a session id.",
    );
  }
  if (attempt.completedAt === null) {
    throw new Error(
      "Learning projection requires a completed-at timestamp.",
    );
  }
  return {
    sessionId: attempt.sessionId,
    completedAt: attempt.completedAt,
  };
}

function hasSevenDayUnhintedSuccess(
  firstUnhintedSuccessAt: string | null,
  now: Date,
): boolean {
  if (firstUnhintedSuccessAt === null) {
    return false;
  }
  const elapsed = now.getTime() - Date.parse(firstUnhintedSuccessAt);
  return Number.isFinite(elapsed) && elapsed >= SEVEN_DAYS_MS;
}

function projectSkill(
  skillLink: ExerciseSkillLink,
  attempt: AttemptSyncInput,
  exerciseId: string,
  completedAt: string,
  previous: StoredSkillMastery | undefined,
  now: Date,
): SkillProjection {
  const isSuccess = attempt.completed;
  const isUnhinted = attempt.highestHintLevel === 0;

  const uniqueExerciseIds = new Set(previous?.uniqueExerciseIds ?? []);
  if (isSuccess) {
    uniqueExerciseIds.add(exerciseId);
  }
  const successfulAttempts =
    (previous?.successfulAttempts ?? 0) + (isSuccess ? 1 : 0);
  const consecutiveSuccesses = isSuccess
    ? (previous?.consecutiveSuccesses ?? 0) + 1
    : 0;

  const isFirstUnhintedSuccess = isSuccess && isUnhinted;
  const firstUnhintedSuccessAt =
    previous?.firstUnhintedSuccessAt ??
    (isFirstUnhintedSuccess ? completedAt : null);
  const latestUnhintedSuccessAt = isFirstUnhintedSuccess
    ? completedAt
    : (previous?.latestUnhintedSuccessAt ?? null);

  const change = calculateMasteryUpdate({
    previousScore: previous?.masteryScore ?? 0,
    previousLevel: previous?.masteryLevel ?? 0,
    performanceQuality: attempt.performanceQuality,
    learningMode: attempt.learningMode,
    highestHintLevel: attempt.highestHintLevel,
    practiceContext: attempt.practiceContext,
    skillWeight: skillLink.weight,
    successfulAttempts,
    uniqueExercisesCompleted: uniqueExerciseIds.size,
    consecutiveSuccesses,
    hasSevenDayUnhintedSuccess: hasSevenDayUnhintedSuccess(
      firstUnhintedSuccessAt,
      now,
    ),
  });

  return {
    mastery: {
      skillId: skillLink.skillId,
      masteryScore: change.nextScore,
      masteryLevel: change.nextLevel,
      successfulAttempts,
      uniqueExerciseIds: [...uniqueExerciseIds],
      consecutiveSuccesses,
      firstUnhintedSuccessAt,
      latestUnhintedSuccessAt,
      lastAttemptAt: completedAt,
      updatedAt: now.toISOString(),
      revision: (previous?.revision ?? 0) + 1,
    },
    change: { skillId: skillLink.skillId, ...change },
  };
}

function primarySkillMasteryLevel(
  exercise: PracticeExercise,
  projections: readonly SkillProjection[],
  previousReview: StoredExerciseReview | null,
): MasteryLevel {
  const primarySkillLink =
    exercise.skills.find((skill) => skill.primary) ?? exercise.skills[0];
  if (primarySkillLink === undefined) {
    return previousReview?.masteryLevel ?? 0;
  }

  const projection = projections.find(
    (candidate) => candidate.mastery.skillId === primarySkillLink.skillId,
  );
  return projection?.mastery.masteryLevel ?? previousReview?.masteryLevel ?? 0;
}

/**
 * Composes calculateMasteryUpdate() (per touched skill) and scheduleReview()
 * (from the primary skill's resulting level) into one local projection, so
 * an attempt's mastery and spaced-repetition effects can be committed
 * atomically without duplicating either domain's scoring or interval
 * tables.
 */
export function calculateLearningProjection(
  input: LearningProjectionInput,
): LearningProjectionResult {
  const { attempt, exercise, previousMastery, previousReview, now } = input;
  const { sessionId, completedAt } = requireCompletedAttemptContext(attempt);

  const projections = exercise.skills.map((skillLink) =>
    projectSkill(
      skillLink,
      attempt,
      exercise.id,
      completedAt,
      previousMastery.get(skillLink.skillId),
      now,
    ),
  );

  const masteryLevel = primarySkillMasteryLevel(
    exercise,
    projections,
    previousReview,
  );
  const schedule = scheduleReview({
    masteryLevel,
    performanceQuality: attempt.performanceQuality,
    highestHintLevel: attempt.highestHintLevel,
    currentIntervalDays: previousReview?.currentIntervalDays ?? 0,
    now,
  });

  const reviewUpdate: StoredExerciseReview = {
    exerciseId: exercise.id,
    masteryLevel,
    currentIntervalDays: schedule.intervalDays,
    dueAt: schedule.dueAt.toISOString(),
    lastPerformanceQuality: attempt.performanceQuality,
    lastAttemptAt: completedAt,
    updatedAt: now.toISOString(),
    revision: (previousReview?.revision ?? 0) + 1,
  };

  const learningOutcome: StoredLearningOutcome = {
    clientAttemptId: attempt.clientAttemptId,
    sessionId,
    exerciseId: exercise.id,
    completedAt,
    skillChanges: projections.map((projection) => projection.change),
    masteryRevisions: projections.map((projection) => ({
      skillId: projection.mastery.skillId,
      revision: projection.mastery.revision,
    })),
    reviewRevision: reviewUpdate.revision,
    previousDueAt: previousReview?.dueAt ?? null,
    nextDueAt: reviewUpdate.dueAt,
    projectionSource: "local",
  };

  return {
    masteryUpdates: projections.map((projection) => projection.mastery),
    reviewUpdate,
    learningOutcome,
  };
}
