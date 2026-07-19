import type { Difficulty } from "../../../types/exercise";

export interface CourseUnitSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  displayOrder: number;
}

export interface CourseRepository {
  listPublishedUnits(): Promise<readonly CourseUnitSummary[]>;
}
