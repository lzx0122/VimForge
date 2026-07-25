import type {
  AttemptHydrationCursor,
  CloudAttemptSnapshot,
  CloudExerciseReviewSnapshot,
  CloudPage,
  CloudSettingsSnapshot,
  CloudSkillMasterySnapshot,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "../../../types/cloud-learning-state";

export interface CloudLearningStateRepository {
  getSettings(): Promise<CloudSettingsSnapshot | null>;

  listAttemptsPage(
    cursor: AttemptHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<CloudAttemptSnapshot, AttemptHydrationCursor>>;

  listMasteryPage(
    cursor: MasteryHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<CloudSkillMasterySnapshot, MasteryHydrationCursor>>;

  listReviewsPage(
    cursor: ReviewHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<CloudExerciseReviewSnapshot, ReviewHydrationCursor>>;
}
