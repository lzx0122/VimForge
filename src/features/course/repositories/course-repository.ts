import type { SkillCategory } from "../../../content/catalog-types";
import type { Difficulty, ExerciseType } from "../../../types/exercise";

export interface CourseSkillSummary {
  id: string;
  slug: string;
  name: string;
  category: SkillCategory;
  primary: boolean;
  displayOrder: number;
}

export interface CourseExerciseSummary {
  id: string;
  slug: string;
  title: string;
  exerciseType: ExerciseType;
  difficulty: Difficulty;
  displayOrder: number;
}

export interface CourseUnitSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  displayOrder: number;
  exerciseCount: number;
  primarySkills: CourseSkillSummary[];
}

export interface CourseUnitDetail
  extends Omit<CourseUnitSummary, "primarySkills"> {
  skills: CourseSkillSummary[];
  exercises: CourseExerciseSummary[];
}

export interface CourseRepository {
  listPublishedUnits(): Promise<readonly CourseUnitSummary[]>;
  getPublishedUnitBySlug(slug: string): Promise<CourseUnitDetail | null>;
}
