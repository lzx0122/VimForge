import type { MasteryLevel } from "../domain/mastery/mastery-config";
import type { PerformanceQuality } from "../domain/scoring/scoring-calculator";
import type { AttemptSyncInput } from "../features/practice/repositories/attempt-sync-repository";
import type { LearningMode, QuestionCount } from "./learning";

export interface CloudSettingsSnapshot {
  editorFontSize: number;
  showLineNumbers: boolean;
  showKeypresses: boolean;
  preferredQuestionCount: QuestionCount;
  lastLearningMode: LearningMode | null;
  updatedAt: string;
}

export interface CloudAttemptSnapshot extends AttemptSyncInput {
  createdAt: string;
}

export interface CloudSkillMasterySnapshot {
  skillId: string;
  masteryScore: number;
  masteryLevel: MasteryLevel;
  successfulAttempts: number;
  uniqueExerciseIds: string[];
  consecutiveSuccesses: number;
  firstUnhintedSuccessAt: string | null;
  latestUnhintedSuccessAt: string | null;
  lastAttemptAt: string;
  updatedAt: string;
}

export interface CloudExerciseReviewSnapshot {
  exerciseId: string;
  masteryLevel: MasteryLevel;
  currentIntervalDays: number;
  dueAt: string;
  lastPerformanceQuality: PerformanceQuality;
  lastAttemptAt: string;
  updatedAt: string;
}

export interface AttemptHydrationCursor {
  createdAt: string;
  clientAttemptId: string;
}

export interface MasteryHydrationCursor {
  updatedAt: string;
  skillId: string;
}

export interface ReviewHydrationCursor {
  updatedAt: string;
  exerciseId: string;
}

export interface CloudPage<TItem, TCursor> {
  items: TItem[];
  nextCursor: TCursor | null;
  hasMore: boolean;
}

export interface CloudHydrationMetadata {
  key: "cloud-hydration";
  userId: string;
  attemptsCursor: AttemptHydrationCursor | null;
  masteryCursor: MasteryHydrationCursor | null;
  reviewsCursor: ReviewHydrationCursor | null;
  completedAt: string | null;
  schemaVersion: 1;
}
