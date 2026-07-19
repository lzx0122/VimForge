import type { SupabaseClient } from "@supabase/supabase-js";

import { SKILL_CATEGORIES, type SkillCategory } from "../../content/catalog-types";
import type {
  CourseExerciseSummary,
  CourseRepository,
  CourseSkillSummary,
  CourseUnitDetail,
  CourseUnitSummary,
} from "../../features/course/repositories/course-repository";
import { DIFFICULTIES, EXERCISE_TYPES, type Difficulty } from "../../types/exercise";
import { getSupabaseBrowserClient } from "./client";
import type { Database } from "./database.types";

const UNIT_SUMMARY_COLUMNS =
  "id,slug,title,description,difficulty,estimated_minutes,display_order";
const UNIT_SKILL_COLUMNS = "unit_id,skill_id,is_primary,display_order";
const SKILL_COLUMNS = "id,slug,name,category";
const EXERCISE_COUNT_COLUMNS = "unit_id";
const EXERCISE_SUMMARY_COLUMNS =
  "id,slug,title,exercise_type,difficulty,display_order";

function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.some((difficulty) => difficulty === value);
}

function isExerciseType(value: string): value is CourseExerciseSummary["exerciseType"] {
  return EXERCISE_TYPES.some((type) => type === value);
}

function isSkillCategory(value: string): value is SkillCategory {
  return SKILL_CATEGORIES.some((category) => category === value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function throwQueryError(message: string, error: unknown): never {
  throw new Error(message, { cause: error });
}

interface UnitSummaryRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: string;
  estimated_minutes: number;
  display_order: number;
}

function toUnitCore(
  row: UnitSummaryRow,
): Omit<CourseUnitSummary, "exerciseCount" | "primarySkills"> {
  if (!isDifficulty(row.difficulty)) {
    throw new Error(`Invalid unit difficulty: ${row.difficulty}.`);
  }
  if (!isPositiveInteger(row.estimated_minutes)) {
    throw new Error(`Invalid unit estimated minutes: ${row.estimated_minutes}.`);
  }
  if (!isPositiveInteger(row.display_order)) {
    throw new Error(`Invalid unit display order: ${row.display_order}.`);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    estimatedMinutes: row.estimated_minutes,
    displayOrder: row.display_order,
  };
}

interface UnitSkillRow {
  unit_id: string;
  skill_id: string;
  is_primary: boolean;
  display_order: number;
}

interface SkillRow {
  id: string;
  slug: string;
  name: string;
  category: string;
}

function toSkillSummaries(
  unitSkills: readonly UnitSkillRow[],
  skills: readonly SkillRow[],
): CourseSkillSummary[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));

  return unitSkills
    .map((link): CourseSkillSummary => {
      const skill = skillById.get(link.skill_id);
      if (skill === undefined) {
        throw new Error(`Unknown skill referenced by unit_skills: ${link.skill_id}.`);
      }
      if (!isSkillCategory(skill.category)) {
        throw new Error(`Invalid skill category: ${skill.category}.`);
      }
      if (!isNonNegativeInteger(link.display_order)) {
        throw new Error(`Invalid unit skill display order: ${link.display_order}.`);
      }

      return {
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        category: skill.category,
        primary: link.is_primary,
        displayOrder: link.display_order,
      };
    })
    .sort(
      (a, b) => a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug),
    );
}

interface ExerciseSummaryRow {
  id: string;
  slug: string;
  title: string;
  exercise_type: string;
  difficulty: string;
  display_order: number;
}

function toExerciseSummary(row: ExerciseSummaryRow): CourseExerciseSummary {
  if (!isExerciseType(row.exercise_type)) {
    throw new Error(`Invalid exercise type: ${row.exercise_type}.`);
  }
  if (!isDifficulty(row.difficulty)) {
    throw new Error(`Invalid exercise difficulty: ${row.difficulty}.`);
  }
  if (!isNonNegativeInteger(row.display_order)) {
    throw new Error(`Invalid exercise display order: ${row.display_order}.`);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    exerciseType: row.exercise_type,
    difficulty: row.difficulty,
    displayOrder: row.display_order,
  };
}

export class SupabaseCourseRepository implements CourseRepository {
  public constructor(
    private readonly client: SupabaseClient<Database> =
      getSupabaseBrowserClient(),
  ) {}

  private async loadSkillsByIds(
    skillIds: readonly string[],
  ): Promise<SkillRow[]> {
    if (skillIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from("skills")
      .select(SKILL_COLUMNS)
      .in("id", skillIds);

    if (error !== null) {
      throwQueryError("Unable to load course unit skills.", error);
    }
    return data;
  }

  public async listPublishedUnits(): Promise<readonly CourseUnitSummary[]> {
    const unitsResponse = await this.client
      .from("learning_units")
      .select(UNIT_SUMMARY_COLUMNS)
      .eq("is_published", true)
      .order("display_order", { ascending: true });

    if (unitsResponse.error !== null) {
      throwQueryError(
        "Unable to load published course units.",
        unitsResponse.error,
      );
    }
    const unitRows = unitsResponse.data;
    if (unitRows.length === 0) {
      return [];
    }
    const unitIds = unitRows.map((unit) => unit.id);

    const [unitSkillsResponse, exerciseCountsResponse] = await Promise.all([
      this.client
        .from("unit_skills")
        .select(UNIT_SKILL_COLUMNS)
        .in("unit_id", unitIds)
        .eq("is_primary", true),
      this.client
        .from("exercises")
        .select(EXERCISE_COUNT_COLUMNS)
        .in("unit_id", unitIds)
        .eq("is_published", true),
    ]);
    if (unitSkillsResponse.error !== null) {
      throwQueryError(
        "Unable to load course unit skills.",
        unitSkillsResponse.error,
      );
    }
    if (exerciseCountsResponse.error !== null) {
      throwQueryError(
        "Unable to load course unit exercise counts.",
        exerciseCountsResponse.error,
      );
    }

    const skillIds = [
      ...new Set(unitSkillsResponse.data.map((link) => link.skill_id)),
    ];
    const skills = await this.loadSkillsByIds(skillIds);

    const exerciseCountByUnit = new Map<string, number>();
    for (const row of exerciseCountsResponse.data) {
      exerciseCountByUnit.set(
        row.unit_id,
        (exerciseCountByUnit.get(row.unit_id) ?? 0) + 1,
      );
    }

    return unitRows.map((row) => ({
      ...toUnitCore(row),
      exerciseCount: exerciseCountByUnit.get(row.id) ?? 0,
      primarySkills: toSkillSummaries(
        unitSkillsResponse.data.filter((link) => link.unit_id === row.id),
        skills,
      ),
    }));
  }

  public async getPublishedUnitBySlug(
    slug: string,
  ): Promise<CourseUnitDetail | null> {
    const unitResponse = await this.client
      .from("learning_units")
      .select(UNIT_SUMMARY_COLUMNS)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (unitResponse.error !== null) {
      throwQueryError("Unable to load the course unit.", unitResponse.error);
    }
    if (unitResponse.data === null) {
      return null;
    }
    const unit = unitResponse.data;

    const [unitSkillsResponse, exercisesResponse] = await Promise.all([
      this.client
        .from("unit_skills")
        .select(UNIT_SKILL_COLUMNS)
        .eq("unit_id", unit.id),
      this.client
        .from("exercises")
        .select(EXERCISE_SUMMARY_COLUMNS)
        .eq("unit_id", unit.id)
        .eq("is_published", true)
        .order("display_order", { ascending: true })
        .order("slug", { ascending: true }),
    ]);
    if (unitSkillsResponse.error !== null) {
      throwQueryError(
        "Unable to load course unit skills.",
        unitSkillsResponse.error,
      );
    }
    if (exercisesResponse.error !== null) {
      throwQueryError(
        "Unable to load course unit exercises.",
        exercisesResponse.error,
      );
    }

    const skillIds = [
      ...new Set(unitSkillsResponse.data.map((link) => link.skill_id)),
    ];
    const skills = await this.loadSkillsByIds(skillIds);
    const exercises = exercisesResponse.data
      .map(toExerciseSummary)
      .sort(
        (a, b) =>
          a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug),
      );

    return {
      ...toUnitCore(unit),
      exerciseCount: exercises.length,
      skills: toSkillSummaries(unitSkillsResponse.data, skills),
      exercises,
    };
  }
}
