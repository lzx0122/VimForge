import type { MasteryPracticeContext } from "../../../domain/mastery/mastery-config";
import type { PerformanceQuality } from "../../../domain/scoring/scoring-calculator";
import type {
  HintLevel,
  NormalizedAction,
} from "../../../types/attempt";
import type {
  ExerciseSource,
  LearningMode,
} from "../../../types/learning";

export interface AttemptSyncInput {
  clientAttemptId: string;
  sessionId: string | null;
  exerciseId: string;
  exerciseVersion: number;
  learningMode: LearningMode;
  source: ExerciseSource;
  completed: boolean;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  keystrokeCount: number;
  recommendedKeystrokeCount: number | null;
  mistakeCount: number;
  undoCount: number;
  resetCount: number;
  highestHintLevel: HintLevel;
  usedRecommendedSolution: boolean;
  normalizedActions: NormalizedAction[];
  speedScore: number;
  accuracyScore: number;
  performanceQuality: PerformanceQuality;
  practiceContext: MasteryPracticeContext;
}

export interface SyncedSkillMastery {
  skillId: string;
  masteryLevel: 0 | 1 | 2 | 3 | 4 | 5;
  masteryScore: number;
}

export interface AttemptSyncResult {
  attemptId: string;
  mastery: SyncedSkillMastery[];
  dueAt: string | null;
}

export interface AttemptSyncRepository {
  recordAttempt(attempt: AttemptSyncInput): Promise<AttemptSyncResult>;
}
