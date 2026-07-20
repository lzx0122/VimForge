import { calculateLearningProjection } from "../../../domain/mastery/learning-projection-calculator";
import { ExerciseReviewRepository } from "../../../infrastructure/indexed-db/exercise-review-repository";
import { LearningOutcomeRepository } from "../../../infrastructure/indexed-db/learning-outcome-repository";
import { commitLearningProjection } from "../../../infrastructure/indexed-db/learning-projection-commit";
import { SkillMasteryRepository } from "../../../infrastructure/indexed-db/skill-mastery-repository";
import type {
  StoredExerciseReview,
  StoredLearningOutcome,
  StoredSkillMastery,
} from "../../../types/learning-projection";
import type { PracticeSession } from "../../../types/session";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import type { PracticeExercise } from "../repositories/exercise-repository";

export interface CompleteAttemptRequest {
  attempt: AttemptSyncInput;
  exercise: PracticeExercise;
  session: PracticeSession;
}

export interface CompleteAttemptResult {
  attempt: AttemptSyncInput;
  learningOutcome: StoredLearningOutcome;
  session: PracticeSession;
}

/**
 * Loads the prior local mastery/review state for an exercise's skills,
 * calculates the resulting projection, and commits the attempt together
 * with that projection in one atomic transaction (Task 18). A retry with
 * an identical clientAttemptId is safe: commitLearningProjection() treats
 * it as a no-op, so this returns the outcome the first commit actually
 * persisted rather than a freshly recalculated one, which would otherwise
 * double-count mastery counters computed from state the first commit
 * already advanced past.
 */
export class AttemptCompletionService {
  public constructor(
    private readonly database: IDBDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async complete(
    request: CompleteAttemptRequest,
  ): Promise<CompleteAttemptResult> {
    const masteryRepository = new SkillMasteryRepository(this.database);
    const reviewRepository = new ExerciseReviewRepository(this.database);

    const previousMasteryEntries = await Promise.all(
      request.exercise.skills.map(
        async (skill): Promise<[string, StoredSkillMastery] | null> => {
          const record = await masteryRepository.get(skill.skillId);
          return record === null ? null : [skill.skillId, record];
        },
      ),
    );
    const previousMastery = new Map(
      previousMasteryEntries.filter(
        (entry): entry is [string, StoredSkillMastery] => entry !== null,
      ),
    );
    const previousReview: StoredExerciseReview | null =
      await reviewRepository.get(request.exercise.id);

    const projection = calculateLearningProjection({
      attempt: request.attempt,
      exercise: request.exercise,
      previousMastery,
      previousReview,
      now: this.now(),
    });

    const commitResult = await commitLearningProjection(this.database, {
      attempt: request.attempt,
      session: request.session,
      attemptDraft: null,
      masteryUpdates: projection.masteryUpdates,
      reviewUpdate: projection.reviewUpdate,
      learningOutcome: projection.learningOutcome,
    });

    const learningOutcome =
      commitResult === "duplicate"
        ? ((await new LearningOutcomeRepository(this.database).get(
            request.attempt.clientAttemptId,
          )) ?? projection.learningOutcome)
        : projection.learningOutcome;

    return {
      attempt: request.attempt,
      learningOutcome,
      session: request.session,
    };
  }
}
