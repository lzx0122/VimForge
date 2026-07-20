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

export interface StoredLearningOutcome {
  clientAttemptId: string;
  sessionId: string;
  exerciseId: string;
  completedAt: string;
  skillChanges: SkillMasteryChange[];
  previousDueAt: string | null;
  nextDueAt: string;
  projectionSource: "local" | "remote";
}
