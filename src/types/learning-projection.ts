import type { MasteryLevel } from "../domain/mastery/mastery-config";
import type { MasteryUpdate } from "../domain/mastery/mastery-calculator";
import type { PerformanceQuality } from "../domain/scoring/scoring-calculator";

export interface StoredSkillMastery {
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
  revision: number;
}

export interface StoredExerciseReview {
  exerciseId: string;
  masteryLevel: MasteryLevel;
  currentIntervalDays: number;
  dueAt: string;
  lastPerformanceQuality: PerformanceQuality;
  lastAttemptAt: string;
  updatedAt: string;
  revision: number;
}

export interface SkillMasteryChange extends MasteryUpdate {
  skillId: string;
}

export interface StoredProjectionRevision {
  skillId: string;
  revision: number;
}

export interface StoredLearningOutcome {
  clientAttemptId: string;
  sessionId: string;
  exerciseId: string;
  completedAt: string;
  skillChanges: SkillMasteryChange[];
  /**
   * The exact skillMastery.revision each touched skill had immediately
   * after this outcome's local commit. Remote sync reconciliation
   * (synced-attempt-committer.ts) uses this - not lastAttemptAt - as the
   * authoritative version guard: it only replaces local mastery when the
   * skill's current revision still equals this snapshot.
   */
  masteryRevisions: StoredProjectionRevision[];
  /** The exact exerciseReviews.revision immediately after this outcome's local commit; the review's version guard, mirroring masteryRevisions. */
  reviewRevision: number;
  previousDueAt: string | null;
  nextDueAt: string;
  projectionSource: "local" | "remote";
}
