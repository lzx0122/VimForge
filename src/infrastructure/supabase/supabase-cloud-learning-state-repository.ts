import type { SupabaseClient } from "@supabase/supabase-js";

import type { CloudLearningStateRepository } from "../../features/cloud-hydration/repositories/cloud-learning-state-repository";
import type {
  AttemptHydrationCursor,
  CloudAttemptSnapshot,
  CloudExerciseReviewSnapshot,
  CloudPage,
  CloudSettingsSnapshot,
  CloudSkillMasterySnapshot,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "../../types/cloud-learning-state";
import {
  mapCloudAttempt,
  mapCloudExerciseReview,
  mapCloudSettings,
  mapCloudSkillMastery,
} from "./cloud-learning-state-mapper";
import { getSupabaseBrowserClient } from "./client";
import type {
  Database,
  ExerciseAttemptRow,
  UserReviewItemRow,
  UserSettingsRow,
  UserSkillMasteryRow,
} from "./database.types";

const DEFAULT_PAGE_LIMIT = 200;
const MAXIMUM_PAGE_LIMIT = 500;

const SETTINGS_COLUMNS =
  "editor_font_size,show_line_numbers,show_keypresses,preferred_question_count,last_learning_mode,updated_at";

const ATTEMPT_COLUMNS = [
  "client_attempt_id",
  "session_id",
  "exercise_id",
  "exercise_version",
  "learning_mode",
  "source",
  "completed",
  "started_at",
  "completed_at",
  "duration_ms",
  "keystroke_count",
  "recommended_keystroke_count",
  "mistake_count",
  "undo_count",
  "reset_count",
  "hint_level_used",
  "used_recommended_solution",
  "normalized_actions",
  "speed_score",
  "accuracy_score",
  "performance_quality",
  "practice_context",
  "created_at",
].join(",");

const MASTERY_COLUMNS = [
  "skill_id",
  "mastery_score",
  "mastery_level",
  "successful_attempts",
  "unique_exercise_ids",
  "consecutive_successes",
  "first_unhinted_success_at",
  "latest_unhinted_success_at",
  "last_practiced_at",
  "updated_at",
].join(",");

const REVIEW_COLUMNS = [
  "exercise_id",
  "mastery_level",
  "current_interval_days",
  "due_at",
  "last_performance_quality",
  "last_attempt_at",
  "updated_at",
].join(",");

function throwQueryError(message: string, error: unknown): never {
  throw new Error(message, { cause: error });
}

/**
 * postgrest-js can't narrow a hand-maintained (non-codegen'd) Database
 * type's row shape from a comma-separated select() column string, so a
 * narrower-than-full-Row select() resolves to an untyped result even
 * though the real response only ever contains exactly the requested
 * columns. Each *_COLUMNS list above includes every field its mapper
 * function actually reads, so this cast is asserting a shape the runtime
 * data genuinely has - not papering over a real mismatch.
 */
function asRow<TRow>(value: unknown): TRow {
  return value as TRow;
}

function resolveLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.min(MAXIMUM_PAGE_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * Every list query fetches one extra row beyond the page limit: if it comes
 * back, there is a next page (hasMore) and the cursor is derived from the
 * last row actually returned (not the extra one) - the standard keyset
 * "fetch limit+1" pagination technique.
 *
 * All limit+1 rows are mapped (and therefore validated) before slicing, so
 * a malformed row hiding in the extra, soon-to-be-discarded slot still
 * throws instead of silently escaping this request's validation.
 *
 * When the page has no rows at all, nextCursor falls back to the *input*
 * cursor rather than null - an empty page resuming from an existing
 * cursor means "nothing new since that cursor", not "start over". Only a
 * genuinely first page (input cursor null, no rows) produces a null
 * nextCursor. Losing this distinction would let a caller that persists
 * nextCursor after every page reset a resumed hydration back to the start
 * of the dataset whenever it catches up to the latest data.
 */
function buildPage<TRow, TItem, TCursor>(
  rows: readonly TRow[],
  limit: number,
  currentCursor: TCursor | null,
  mapRow: (row: TRow) => TItem,
  cursorOf: (row: TRow) => TCursor,
): CloudPage<TItem, TCursor> {
  const mappedRows = rows.map((row) => ({
    item: mapRow(row),
    cursor: cursorOf(row),
  }));
  const hasMore = mappedRows.length > limit;
  const pageRows = hasMore ? mappedRows.slice(0, limit) : mappedRows;
  const lastRow = pageRows.at(-1);

  return {
    items: pageRows.map((row) => row.item),
    nextCursor: lastRow === undefined ? currentCursor : lastRow.cursor,
    hasMore,
  };
}

export class SupabaseCloudLearningStateRepository
  implements CloudLearningStateRepository
{
  public constructor(
    private readonly client: SupabaseClient<Database> =
      getSupabaseBrowserClient(),
  ) {}

  public async getSettings(): Promise<CloudSettingsSnapshot | null> {
    const { data, error } = await this.client
      .from("user_settings")
      .select(SETTINGS_COLUMNS)
      .maybeSingle();

    if (error !== null) {
      throwQueryError("Unable to load cloud settings.", error);
    }
    if (data === null) {
      return null;
    }

    return mapCloudSettings(asRow<UserSettingsRow>(data));
  }

  public async listAttemptsPage(
    cursor: AttemptHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<CloudAttemptSnapshot, AttemptHydrationCursor>> {
    const resolvedLimit = resolveLimit(limit);
    let query = this.client
      .from("exercise_attempts")
      .select(ATTEMPT_COLUMNS)
      .order("created_at", { ascending: true })
      .order("client_attempt_id", { ascending: true });

    if (cursor !== null) {
      query = query.or(
        `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},client_attempt_id.gt.${cursor.clientAttemptId})`,
      );
    }

    const { data, error } = await query.limit(resolvedLimit + 1);
    if (error !== null) {
      throwQueryError("Unable to load cloud attempts.", error);
    }

    return buildPage(
      asRow<ExerciseAttemptRow[]>(data ?? []),
      resolvedLimit,
      cursor,
      mapCloudAttempt,
      (row) => ({
        createdAt: row.created_at,
        clientAttemptId: row.client_attempt_id,
      }),
    );
  }

  public async listMasteryPage(
    cursor: MasteryHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<CloudSkillMasterySnapshot, MasteryHydrationCursor>> {
    const resolvedLimit = resolveLimit(limit);
    let query = this.client
      .from("user_skill_mastery")
      .select(MASTERY_COLUMNS)
      .order("updated_at", { ascending: true })
      .order("skill_id", { ascending: true });

    if (cursor !== null) {
      query = query.or(
        `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},skill_id.gt.${cursor.skillId})`,
      );
    }

    const { data, error } = await query.limit(resolvedLimit + 1);
    if (error !== null) {
      throwQueryError("Unable to load cloud skill mastery.", error);
    }

    return buildPage(
      asRow<UserSkillMasteryRow[]>(data ?? []),
      resolvedLimit,
      cursor,
      mapCloudSkillMastery,
      (row) => ({
        updatedAt: row.updated_at,
        skillId: row.skill_id,
      }),
    );
  }

  public async listReviewsPage(
    cursor: ReviewHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<CloudExerciseReviewSnapshot, ReviewHydrationCursor>> {
    const resolvedLimit = resolveLimit(limit);
    let query = this.client
      .from("user_review_items")
      .select(REVIEW_COLUMNS)
      .order("updated_at", { ascending: true })
      .order("exercise_id", { ascending: true });

    if (cursor !== null) {
      query = query.or(
        `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},exercise_id.gt.${cursor.exerciseId})`,
      );
    }

    const { data, error } = await query.limit(resolvedLimit + 1);
    if (error !== null) {
      throwQueryError("Unable to load cloud exercise reviews.", error);
    }

    return buildPage(
      asRow<UserReviewItemRow[]>(data ?? []),
      resolvedLimit,
      cursor,
      mapCloudExerciseReview,
      (row) => ({
        updatedAt: row.updated_at,
        exerciseId: row.exercise_id,
      }),
    );
  }
}
