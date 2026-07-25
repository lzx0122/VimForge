import {
  MASTERY_LEVEL_REQUIREMENTS,
  PRACTICE_CONTEXTS,
  type MasteryLevel,
  type MasteryPracticeContext,
} from "../../domain/mastery/mastery-config";
import type { PerformanceQuality } from "../../domain/scoring/scoring-calculator";
import type { HintLevel, NormalizedAction } from "../../types/attempt";
import {
  EXERCISE_SOURCES,
  LEARNING_MODES,
  QUESTION_COUNTS,
  VIM_MODES,
  type ExerciseSource,
  type LearningMode,
  type QuestionCount,
} from "../../types/learning";
import type {
  CloudAttemptSnapshot,
  CloudExerciseReviewSnapshot,
  CloudSettingsSnapshot,
  CloudSkillMasterySnapshot,
} from "../../types/cloud-learning-state";
import type {
  ExerciseAttemptRow,
  UserReviewItemRow,
  UserSettingsRow,
  UserSkillMasteryRow,
} from "./database.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(field: string, expected: string): never {
  throw new Error(`Invalid Supabase row field "${field}": expected ${expected}.`);
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalid(field, "a UUID");
  }
  return value;
}

function assertNullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : assertUuid(value, field);
}

// Requires a full timestamp (date, time, seconds, optional fractional
// seconds, explicit Z or numeric UTC offset) and rejects impossible
// calendar dates. Date.parse()/`new Date(...)` alone are not strict
// enough: they accept locale-formatted and date-only strings, and they
// silently normalize invalid dates (e.g. Feb 30 rolls over to March)
// instead of rejecting them - both of those must throw here.
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function assertTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string") {
    invalid(field, "a full ISO timestamp string");
  }

  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    invalid(
      field,
      "a full ISO timestamp with date, time, seconds, and an explicit Z or numeric UTC offset",
    );
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    invalid(field, "valid calendar and time components");
  }
  if (offsetSign !== undefined) {
    if (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59) {
      invalid(field, "a valid UTC offset");
    }
  }

  const roundTrip = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    invalid(field, "a real calendar date");
  }

  return value;
}

function assertNullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : assertTimestamp(value, field);
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    invalid(field, "a boolean");
  }
  return value;
}

function assertNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    invalid(field, "a non-negative integer");
  }
  return value;
}

function assertPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    invalid(field, "a positive integer");
  }
  return value;
}

function assertNullablePositiveInteger(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : assertPositiveInteger(value, field);
}

function assertNullableNonNegativeInteger(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : assertNonNegativeInteger(value, field);
}

// For mastery_score: a PostgreSQL numeric(6,2), so decimals are valid.
function assertScoreRange(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    invalid(field, "a score between 0 and 100");
  }
  return value;
}

// For speed_score/accuracy_score: PostgreSQL smallint columns, so only
// whole numbers are valid.
function assertIntegerScoreRange(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  ) {
    invalid(field, "an integer score between 0 and 100");
  }
  return value;
}

function assertNullableIntegerScoreRange(value: unknown, field: string): number {
  return value === null ? 0 : assertIntegerScoreRange(value, field);
}

function assertNumberRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(field, `a value between ${minimum} and ${maximum}`);
  }
  return value;
}

function assertIntegerRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(field, `an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(field, `one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function assertOneOfNumber<T extends number>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "number" || !allowed.includes(value as T)) {
    invalid(field, `one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function isNormalizedAction(value: unknown): value is NormalizedAction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  if (candidate.type === "vim_command") {
    return typeof candidate.command === "string";
  }
  if (candidate.type === "insert_text") {
    return (
      typeof candidate.text === "string" &&
      typeof candidate.textLength === "number" &&
      Number.isInteger(candidate.textLength) &&
      candidate.textLength >= 0 &&
      candidate.textLength === candidate.text.length
    );
  }
  if (candidate.type === "mode_change") {
    return (
      typeof candidate.mode === "string" &&
      VIM_MODES.some((mode) => mode === candidate.mode)
    );
  }
  if (candidate.type === "undo" || candidate.type === "reset") {
    return true;
  }
  return (
    candidate.type === "search" &&
    typeof candidate.query === "string" &&
    (candidate.direction === "forward" || candidate.direction === "backward")
  );
}

function assertNormalizedActions(
  value: unknown,
  field: string,
): NormalizedAction[] {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    invalid(field, "null or an array");
  }
  if (!value.every(isNormalizedAction)) {
    invalid(field, "an array of valid NormalizedAction objects");
  }
  // Defensive copy: the mapped output must never alias the input row's
  // nested array/objects, so mutating the returned snapshot can never
  // reach back into the row Supabase handed us.
  return (value as NormalizedAction[]).map((action) => ({ ...action }));
}

function assertUuidArray(value: unknown, field: string): string[] {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    invalid(field, "null or an array of UUIDs");
  }
  return value.map((item, index) => assertUuid(item, `${field}[${index}]`));
}

export function mapCloudSettings(row: UserSettingsRow): CloudSettingsSnapshot {
  return {
    editorFontSize: assertIntegerRange(
      row.editor_font_size,
      "editor_font_size",
      12,
      28,
    ),
    showLineNumbers: assertBoolean(row.show_line_numbers, "show_line_numbers"),
    showKeypresses: assertBoolean(row.show_keypresses, "show_keypresses"),
    preferredQuestionCount: assertOneOfNumber<QuestionCount>(
      row.preferred_question_count,
      QUESTION_COUNTS,
      "preferred_question_count",
    ),
    lastLearningMode:
      row.last_learning_mode === null
        ? null
        : assertOneOf(
            row.last_learning_mode,
            LEARNING_MODES,
            "last_learning_mode",
          ),
    updatedAt: assertTimestamp(row.updated_at, "updated_at"),
  };
}

export function mapCloudAttempt(row: ExerciseAttemptRow): CloudAttemptSnapshot {
  const clientAttemptId = assertUuid(
    row.client_attempt_id,
    "client_attempt_id",
  );
  const exerciseId = assertUuid(row.exercise_id, "exercise_id");
  const sessionId = assertNullableUuid(row.session_id, "session_id");
  const exerciseVersion = assertPositiveInteger(
    row.exercise_version,
    "exercise_version",
  );
  const learningMode: LearningMode = assertOneOf(
    row.learning_mode,
    LEARNING_MODES,
    "learning_mode",
  );
  const source: ExerciseSource = assertOneOf(
    row.source,
    EXERCISE_SOURCES,
    "source",
  );
  const completed = assertBoolean(row.completed, "completed");
  const startedAt = assertTimestamp(row.started_at, "started_at");
  const completedAt = assertNullableTimestamp(
    row.completed_at,
    "completed_at",
  );
  const durationMs = assertNullableNonNegativeInteger(
    row.duration_ms,
    "duration_ms",
  );
  const keystrokeCount = assertNonNegativeInteger(
    row.keystroke_count,
    "keystroke_count",
  );
  const recommendedKeystrokeCount = assertNullablePositiveInteger(
    row.recommended_keystroke_count,
    "recommended_keystroke_count",
  );
  const mistakeCount = assertNonNegativeInteger(
    row.mistake_count,
    "mistake_count",
  );
  const undoCount = assertNonNegativeInteger(row.undo_count, "undo_count");
  const resetCount = assertNonNegativeInteger(row.reset_count, "reset_count");
  const highestHintLevel = assertIntegerRange(
    row.hint_level_used,
    "hint_level_used",
    0,
    4,
  ) as HintLevel;
  const usedRecommendedSolution = assertBoolean(
    row.used_recommended_solution,
    "used_recommended_solution",
  );
  const normalizedActions = assertNormalizedActions(
    row.normalized_actions,
    "normalized_actions",
  );
  const speedScore = assertNullableIntegerScoreRange(
    row.speed_score,
    "speed_score",
  );
  const accuracyScore = assertIntegerScoreRange(
    row.accuracy_score,
    "accuracy_score",
  );
  const performanceQuality = assertIntegerRange(
    row.performance_quality,
    "performance_quality",
    0,
    5,
  ) as PerformanceQuality;
  const practiceContext: MasteryPracticeContext = assertOneOf(
    row.practice_context,
    PRACTICE_CONTEXTS,
    "practice_context",
  );
  const createdAt = assertTimestamp(row.created_at, "created_at");

  return {
    clientAttemptId,
    sessionId,
    exerciseId,
    exerciseVersion,
    learningMode,
    source,
    completed,
    startedAt,
    completedAt,
    durationMs,
    keystrokeCount,
    recommendedKeystrokeCount,
    mistakeCount,
    undoCount,
    resetCount,
    highestHintLevel,
    usedRecommendedSolution,
    normalizedActions,
    speedScore,
    accuracyScore,
    performanceQuality,
    practiceContext,
    createdAt,
  };
}

export function mapCloudSkillMastery(
  row: UserSkillMasteryRow,
): CloudSkillMasterySnapshot {
  const skillId = assertUuid(row.skill_id, "skill_id");
  const masteryScore = assertScoreRange(row.mastery_score, "mastery_score");
  const masteryLevel = assertIntegerRange(
    row.mastery_level,
    "mastery_level",
    0,
    5,
  ) as MasteryLevel;
  if (MASTERY_LEVEL_REQUIREMENTS[masteryLevel] === undefined) {
    invalid("mastery_level", "a known mastery level");
  }
  const successfulAttempts = assertNonNegativeInteger(
    row.successful_attempts,
    "successful_attempts",
  );
  const uniqueExerciseIds = assertUuidArray(
    row.unique_exercise_ids,
    "unique_exercise_ids",
  );
  const consecutiveSuccesses = assertNonNegativeInteger(
    row.consecutive_successes,
    "consecutive_successes",
  );
  const firstUnhintedSuccessAt = assertNullableTimestamp(
    row.first_unhinted_success_at,
    "first_unhinted_success_at",
  );
  const latestUnhintedSuccessAt = assertNullableTimestamp(
    row.latest_unhinted_success_at,
    "latest_unhinted_success_at",
  );
  const updatedAt = assertTimestamp(row.updated_at, "updated_at");
  // Legacy-compatible fallback: rows written before last_practiced_at was
  // guaranteed to reflect every attempt fall back to the row's own
  // updated_at, matching the local projection's meaning of "most recent
  // known activity" rather than surfacing null.
  const lastAttemptAt =
    row.last_practiced_at === null
      ? updatedAt
      : assertTimestamp(row.last_practiced_at, "last_practiced_at");

  return {
    skillId,
    masteryScore,
    masteryLevel,
    successfulAttempts,
    uniqueExerciseIds,
    consecutiveSuccesses,
    firstUnhintedSuccessAt,
    latestUnhintedSuccessAt,
    lastAttemptAt,
    updatedAt,
  };
}

export function mapCloudExerciseReview(
  row: UserReviewItemRow,
): CloudExerciseReviewSnapshot {
  return {
    exerciseId: assertUuid(row.exercise_id, "exercise_id"),
    masteryLevel: assertIntegerRange(
      row.mastery_level,
      "mastery_level",
      0,
      5,
    ) as MasteryLevel,
    currentIntervalDays: assertNumberRange(
      row.current_interval_days,
      "current_interval_days",
      0,
      30,
    ),
    dueAt: assertTimestamp(row.due_at, "due_at"),
    lastPerformanceQuality: assertIntegerRange(
      row.last_performance_quality,
      "last_performance_quality",
      0,
      5,
    ) as PerformanceQuality,
    lastAttemptAt: assertTimestamp(row.last_attempt_at, "last_attempt_at"),
    updatedAt: assertTimestamp(row.updated_at, "updated_at"),
  };
}
