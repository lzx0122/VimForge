import type { Difficulty } from "../../../types/exercise";
import type { LearningMode } from "../../../types/learning";

export interface PracticeCandidateRecord {
  exerciseId: string;
  unitId: string;
  exerciseSlug: string;
  skillIds: string[];
  skillSlugs: string[];
  learningModes: LearningMode[];
  difficulty: Difficulty;
  displayOrder: number;
}

export interface PracticeCandidateListOptions {
  learningMode: LearningMode;
  skillSlugs?: readonly string[];
}

export interface PracticeCandidateRepository {
  listPublishedCandidates(
    options: PracticeCandidateListOptions,
  ): Promise<readonly PracticeCandidateRecord[]>;
}
