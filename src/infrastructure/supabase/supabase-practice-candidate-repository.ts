import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PracticeCandidateListOptions,
  PracticeCandidateRecord,
  PracticeCandidateRepository,
} from "../../features/practice/repositories/practice-candidate-repository";
import { DIFFICULTIES, type Difficulty } from "../../types/exercise";
import { LEARNING_MODES, type LearningMode } from "../../types/learning";
import { getSupabaseBrowserClient } from "./client";
import type { Database } from "./database.types";

const EXERCISE_COLUMNS =
  "id,unit_id,slug,difficulty,display_order,supported_modes";
const EXERCISE_SKILL_COLUMNS = "exercise_id,skill_id";
const SKILL_COLUMNS = "id,slug";

/**
 * Exercises are paginated instead of trusting a single request's default
 * row cap, so the candidate pool is never silently truncated as the
 * catalog grows. exercise_skills is looked up in id batches of the same
 * size to avoid one request per exercise while keeping IN-list length bounded.
 */
const PAGE_SIZE = 200;

function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.some((difficulty) => difficulty === value);
}

function isLearningModeArray(value: unknown): value is LearningMode[] {
  return (
    Array.isArray(value) &&
    value.every((mode) => LEARNING_MODES.some((learningMode) => learningMode === mode))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function throwQueryError(message: string, error: unknown): never {
  throw new Error(message, { cause: error });
}

interface ExerciseRow {
  id: string;
  unit_id: string;
  slug: string;
  difficulty: string;
  display_order: number;
  supported_modes: string[];
}

interface ExerciseSkillLinkRow {
  exercise_id: string;
  skill_id: string;
}

interface SkillRow {
  id: string;
  slug: string;
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }
  return chunks;
}

export class SupabasePracticeCandidateRepository
  implements PracticeCandidateRepository
{
  public constructor(
    private readonly client: SupabaseClient<Database> =
      getSupabaseBrowserClient(),
  ) {}

  private async loadPublishedExercises(
    learningMode: LearningMode,
  ): Promise<ExerciseRow[]> {
    const results: ExerciseRow[] = [];
    let from = 0;

    for (;;) {
      const { data, error } = await this.client
        .from("exercises")
        .select(EXERCISE_COLUMNS)
        .eq("is_published", true)
        .contains("supported_modes", [learningMode])
        .order("display_order", { ascending: true })
        .order("slug", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error !== null) {
        throwQueryError("Unable to load practice candidate exercises.", error);
      }

      results.push(...data);
      if (data.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }

    return results;
  }

  private async loadExerciseSkillLinks(
    exerciseIds: readonly string[],
  ): Promise<ExerciseSkillLinkRow[]> {
    if (exerciseIds.length === 0) {
      return [];
    }

    const results: ExerciseSkillLinkRow[] = [];
    for (const idChunk of chunk(exerciseIds, PAGE_SIZE)) {
      const { data, error } = await this.client
        .from("exercise_skills")
        .select(EXERCISE_SKILL_COLUMNS)
        .in("exercise_id", idChunk);

      if (error !== null) {
        throwQueryError(
          "Unable to load practice candidate exercise skills.",
          error,
        );
      }
      results.push(...data);
    }

    return results;
  }

  private async loadAllSkills(): Promise<SkillRow[]> {
    const { data, error } = await this.client.from("skills").select(SKILL_COLUMNS);

    if (error !== null) {
      throwQueryError("Unable to load skills.", error);
    }
    return data;
  }

  public async listPublishedCandidates(
    options: PracticeCandidateListOptions,
  ): Promise<readonly PracticeCandidateRecord[]> {
    const exerciseRows = await this.loadPublishedExercises(options.learningMode);
    if (exerciseRows.length === 0) {
      return [];
    }

    const exerciseIds = exerciseRows.map((row) => row.id);
    const [exerciseSkillLinks, skills] = await Promise.all([
      this.loadExerciseSkillLinks(exerciseIds),
      this.loadAllSkills(),
    ]);

    const skillById = new Map(skills.map((skill) => [skill.id, skill]));
    const skillLinksByExercise = new Map<string, ExerciseSkillLinkRow[]>();
    for (const link of exerciseSkillLinks) {
      const links = skillLinksByExercise.get(link.exercise_id);
      if (links === undefined) {
        skillLinksByExercise.set(link.exercise_id, [link]);
      } else {
        links.push(link);
      }
    }

    const requestedSkillSlugs =
      options.skillSlugs === undefined ? null : new Set(options.skillSlugs);

    const candidates: PracticeCandidateRecord[] = [];
    for (const exercise of exerciseRows) {
      if (!isDifficulty(exercise.difficulty)) {
        throw new Error(`Invalid exercise difficulty: ${exercise.difficulty}.`);
      }
      if (!isNonNegativeInteger(exercise.display_order)) {
        throw new Error(
          `Invalid exercise display order: ${exercise.display_order}.`,
        );
      }
      if (!isLearningModeArray(exercise.supported_modes)) {
        throw new Error(
          `Invalid exercise supported modes: ${String(exercise.supported_modes)}.`,
        );
      }

      const links = skillLinksByExercise.get(exercise.id) ?? [];
      const matchedSkills = links
        .map((link) => skillById.get(link.skill_id))
        .filter((skill): skill is SkillRow => skill !== undefined)
        .sort((a, b) => a.slug.localeCompare(b.slug));

      if (
        requestedSkillSlugs !== null &&
        !matchedSkills.some((skill) => requestedSkillSlugs.has(skill.slug))
      ) {
        continue;
      }

      candidates.push({
        exerciseId: exercise.id,
        unitId: exercise.unit_id,
        exerciseSlug: exercise.slug,
        skillIds: matchedSkills.map((skill) => skill.id),
        skillSlugs: matchedSkills.map((skill) => skill.slug),
        learningModes: exercise.supported_modes,
        difficulty: exercise.difficulty,
        displayOrder: exercise.display_order,
      });
    }

    return candidates;
  }
}
