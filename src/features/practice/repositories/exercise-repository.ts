import type { NormalizedAction, HintLevel } from "../../../types/attempt";
import type {
  Difficulty,
  ExerciseDefinition,
  ExerciseType,
  SupportedLanguage,
} from "../../../types/exercise";
import type { LearningMode } from "../../../types/learning";

export interface ExerciseSummary {
  id: string;
  unitId: string;
  slug: string;
  title: string;
  instruction: string;
  language: SupportedLanguage;
  exerciseType: ExerciseType;
  difficulty: Difficulty;
  supportedModes: LearningMode[];
  targetDurationMs: number;
  version: number;
}

export interface ExerciseSkillLink {
  skillId: string;
  weight: number;
  primary: boolean;
}

export interface ExerciseSolution {
  sequence: string;
  normalizedActions: NormalizedAction[];
  keystrokeCount: number;
  recommended: boolean;
  explanation: string;
  displayOrder: number;
}

export interface ExerciseHint {
  level: Exclude<HintLevel, 0>;
  content: string;
  commandPreview: string | null;
}

export interface PracticeExercise extends ExerciseDefinition {
  skills: ExerciseSkillLink[];
  solutions: ExerciseSolution[];
  hints: ExerciseHint[];
}

export interface ExerciseListOptions {
  unitId?: string;
  learningMode?: LearningMode;
  limit?: number;
}

export interface ExerciseRepository {
  listPublishedExercises(
    options?: ExerciseListOptions,
  ): Promise<readonly ExerciseSummary[]>;
  getPublishedExercise(id: string): Promise<PracticeExercise | null>;
}
