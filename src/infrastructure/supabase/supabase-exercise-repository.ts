import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ExerciseHint,
  ExerciseListOptions,
  ExerciseRepository,
  ExerciseSolution,
  ExerciseSummary,
  PracticeExercise,
} from "../../features/practice/repositories/exercise-repository";
import type { NormalizedAction } from "../../types/attempt";
import {
  DIFFICULTIES,
  EXERCISE_TYPES,
  SUPPORTED_LANGUAGES,
  isExerciseDefinition,
  type ExerciseDefinition,
} from "../../types/exercise";
import {
  LEARNING_MODES,
  VIM_MODES,
  type LearningMode,
} from "../../types/learning";
import { getSupabaseBrowserClient } from "./client";
import type { Database } from "./database.types";

const MAX_SUMMARY_COUNT = 20;
/**
 * A course unit's full exercise list is never randomized or capped like a
 * QuestionCount-bounded practice session (see PracticeSession.actualCount).
 * Unit-scoped, display-order requests page through every row instead of
 * applying a fixed ceiling, so a unit can never be silently truncated.
 */
const COURSE_EXERCISE_PAGE_SIZE = 200;
const SUMMARY_COLUMNS =
  "id,unit_id,slug,title,instruction,language,exercise_type,difficulty,supported_modes,target_duration_ms,version";
const DETAIL_COLUMNS =
  "id,unit_id,slug,title,instruction,language,exercise_type,difficulty,supported_modes,target_duration_ms,version,initial_content,expected_content,initial_cursor,completion_rule";

function summaryLimit(options: ExerciseListOptions): number {
  const requestedLimit = options.limit;
  if (requestedLimit === undefined || !Number.isFinite(requestedLimit)) {
    return MAX_SUMMARY_COUNT;
  }
  return Math.min(MAX_SUMMARY_COUNT, Math.max(1, Math.floor(requestedLimit)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

function isLearningModeArray(value: unknown): value is LearningMode[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const modes: unknown[] = value;
  return modes.every((mode) => isOneOf(mode, LEARNING_MODES));
}

function toExerciseSummary(value: unknown): ExerciseSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.unit_id !== "string" ||
    typeof value.slug !== "string" ||
    typeof value.title !== "string" ||
    typeof value.instruction !== "string" ||
    !isOneOf(value.language, SUPPORTED_LANGUAGES) ||
    !isOneOf(value.exercise_type, EXERCISE_TYPES) ||
    !isOneOf(value.difficulty, DIFFICULTIES) ||
    !isLearningModeArray(value.supported_modes) ||
    typeof value.target_duration_ms !== "number" ||
    value.target_duration_ms <= 0 ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version <= 0
  ) {
    throw new Error("Invalid exercise summary received from Supabase.");
  }

  return {
    id: value.id,
    unitId: value.unit_id,
    slug: value.slug,
    title: value.title,
    instruction: value.instruction,
    language: value.language,
    exerciseType: value.exercise_type,
    difficulty: value.difficulty,
    supportedModes: value.supported_modes,
    targetDurationMs: value.target_duration_ms,
    version: value.version,
  };
}

function toExerciseDefinition(value: unknown): ExerciseDefinition {
  if (!isRecord(value)) {
    throw new Error("Invalid exercise detail received from Supabase.");
  }

  const definition = {
    id: value.id,
    unitId: value.unit_id,
    slug: value.slug,
    title: value.title,
    instruction: value.instruction,
    language: value.language,
    exerciseType: value.exercise_type,
    difficulty: value.difficulty,
    initialContent: value.initial_content,
    expectedContent: value.expected_content,
    initialCursor: value.initial_cursor,
    completionRule: value.completion_rule,
    supportedModes: value.supported_modes,
    targetDurationMs: value.target_duration_ms,
    version: value.version,
  };

  if (!isExerciseDefinition(definition)) {
    throw new Error("Invalid exercise detail received from Supabase.");
  }
  return definition;
}

function isNormalizedAction(value: unknown): value is NormalizedAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "vim_command") {
    return typeof value.command === "string";
  }
  if (value.type === "insert_text") {
    return (
      typeof value.text === "string" &&
      typeof value.textLength === "number"
    );
  }
  if (value.type === "mode_change") {
    return (
      typeof value.mode === "string" &&
      VIM_MODES.some((mode) => mode === value.mode)
    );
  }
  if (value.type === "undo" || value.type === "reset") {
    return true;
  }
  return (
    value.type === "search" &&
    typeof value.query === "string" &&
    (value.direction === "forward" || value.direction === "backward")
  );
}

function toSolution(value: unknown): ExerciseSolution {
  if (!isRecord(value) || !Array.isArray(value.normalized_actions)) {
    throw new Error("Invalid exercise solution received from Supabase.");
  }
  const actions: unknown[] = value.normalized_actions;
  if (!actions.every(isNormalizedAction)) {
    throw new Error("Invalid normalized actions received from Supabase.");
  }
  if (
    typeof value.sequence !== "string" ||
    typeof value.keystroke_count !== "number" ||
    typeof value.is_recommended !== "boolean" ||
    typeof value.explanation !== "string" ||
    typeof value.display_order !== "number"
  ) {
    throw new Error("Invalid exercise solution received from Supabase.");
  }

  return {
    sequence: value.sequence,
    normalizedActions: actions,
    keystrokeCount: value.keystroke_count,
    recommended: value.is_recommended,
    explanation: value.explanation,
    displayOrder: value.display_order,
  };
}

function toHint(value: unknown): ExerciseHint {
  if (
    !isRecord(value) ||
    (value.level !== 1 &&
      value.level !== 2 &&
      value.level !== 3 &&
      value.level !== 4) ||
    typeof value.content !== "string" ||
    (value.command_preview !== null &&
      typeof value.command_preview !== "string")
  ) {
    throw new Error("Invalid exercise hint received from Supabase.");
  }

  return {
    level: value.level,
    content: value.content,
    commandPreview: value.command_preview,
  };
}

function throwQueryError(message: string, error: unknown): never {
  throw new Error(message, { cause: error });
}

export class SupabaseExerciseRepository implements ExerciseRepository {
  public constructor(
    private readonly client: SupabaseClient<Database> =
      getSupabaseBrowserClient(),
  ) {}

  public async listPublishedExercises(
    options: ExerciseListOptions = {},
  ): Promise<readonly ExerciseSummary[]> {
    if (options.orderByDisplayOrder === true && options.unitId !== undefined) {
      return this.listUnitExercisesInFull(options.unitId, options.learningMode);
    }

    let query = this.client
      .from("exercises")
      .select(SUMMARY_COLUMNS)
      .eq("is_published", true)
      .order("slug", { ascending: true });

    if (options.unitId !== undefined) {
      query = query.eq("unit_id", options.unitId);
    }
    if (options.learningMode !== undefined) {
      query = query.contains("supported_modes", [options.learningMode]);
    }

    const { data, error } = await query.limit(summaryLimit(options));
    if (error !== null) {
      throwQueryError("Unable to load published exercises.", error);
    }

    return data.map(toExerciseSummary);
  }

  /**
   * Load every published exercise in a unit, ordered by display order then
   * slug. Pages through the full result set instead of applying a fixed
   * ceiling, so a unit's exercise list is never silently truncated.
   */
  private async listUnitExercisesInFull(
    unitId: string,
    learningMode: LearningMode | undefined,
  ): Promise<ExerciseSummary[]> {
    const results: ExerciseSummary[] = [];
    let from = 0;

    for (;;) {
      let query = this.client
        .from("exercises")
        .select(SUMMARY_COLUMNS)
        .eq("is_published", true)
        .eq("unit_id", unitId)
        .order("display_order", { ascending: true })
        .order("slug", { ascending: true });

      if (learningMode !== undefined) {
        query = query.contains("supported_modes", [learningMode]);
      }

      const { data, error } = await query.range(
        from,
        from + COURSE_EXERCISE_PAGE_SIZE - 1,
      );
      if (error !== null) {
        throwQueryError("Unable to load published exercises.", error);
      }

      results.push(...data.map(toExerciseSummary));
      if (data.length < COURSE_EXERCISE_PAGE_SIZE) {
        break;
      }
      from += COURSE_EXERCISE_PAGE_SIZE;
    }

    return results;
  }

  public async getPublishedExercise(
    id: string,
  ): Promise<PracticeExercise | null> {
    const exerciseResponse = await this.client
      .from("exercises")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();

    if (exerciseResponse.error !== null) {
      throwQueryError("Unable to load the published exercise.", exerciseResponse.error);
    }
    if (exerciseResponse.data === null) {
      return null;
    }

    const [skillsResponse, solutionsResponse, hintsResponse] = await Promise.all([
      this.client
        .from("exercise_skills")
        .select("skill_id,weight,is_primary")
        .eq("exercise_id", id),
      this.client
        .from("exercise_solutions")
        .select(
          "sequence,normalized_actions,keystroke_count,is_recommended,explanation,display_order",
        )
        .eq("exercise_id", id)
        .order("display_order", { ascending: true }),
      this.client
        .from("exercise_hints")
        .select("level,content,command_preview")
        .eq("exercise_id", id)
        .order("level", { ascending: true }),
    ]);

    if (skillsResponse.error !== null) {
      throwQueryError("Unable to load exercise skills.", skillsResponse.error);
    }
    if (solutionsResponse.error !== null) {
      throwQueryError("Unable to load exercise solutions.", solutionsResponse.error);
    }
    if (hintsResponse.error !== null) {
      throwQueryError("Unable to load exercise hints.", hintsResponse.error);
    }

    const definition = toExerciseDefinition(exerciseResponse.data);
    return {
      ...definition,
      skills: skillsResponse.data.map((skill) => ({
        skillId: skill.skill_id,
        weight: skill.weight,
        primary: skill.is_primary,
      })),
      solutions: solutionsResponse.data.map(toSolution),
      hints: hintsResponse.data.map(toHint),
    };
  }
}
