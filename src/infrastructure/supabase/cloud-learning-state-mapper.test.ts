import { describe, expect, it } from "vitest";

import {
  mapCloudAttempt,
  mapCloudExerciseReview,
  mapCloudSettings,
  mapCloudSkillMastery,
} from "./cloud-learning-state-mapper";
import type {
  ExerciseAttemptRow,
  UserReviewItemRow,
  UserSettingsRow,
  UserSkillMasteryRow,
} from "./database.types";

function settingsRow(overrides: Partial<UserSettingsRow> = {}): UserSettingsRow {
  return {
    user_id: "00000000-0000-4000-8000-000000000001",
    editor_font_size: 18,
    show_line_numbers: true,
    show_keypresses: false,
    sound_enabled: false,
    preferred_question_count: 20,
    last_learning_mode: "efficiency",
    created_at: "2026-07-16T08:00:00.000Z",
    updated_at: "2026-07-16T08:01:00.000Z",
    ...overrides,
  };
}

function attemptRow(
  overrides: Partial<ExerciseAttemptRow> = {},
): ExerciseAttemptRow {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    client_attempt_id: "00000000-0000-4000-8000-000000000102",
    user_id: "00000000-0000-4000-8000-000000000001",
    session_id: "00000000-0000-4000-8000-000000000103",
    exercise_id: "00000000-0000-4000-8000-000000000104",
    exercise_version: 2,
    learning_mode: "memory_review",
    source: "web",
    completed: true,
    started_at: "2026-07-21T08:00:00.000Z",
    completed_at: "2026-07-21T08:00:12.000Z",
    duration_ms: 12_000,
    keystroke_count: 8,
    recommended_keystroke_count: 6,
    mistake_count: 1,
    undo_count: 0,
    reset_count: 0,
    hint_level_used: 1,
    used_recommended_solution: false,
    normalized_actions: [
      { type: "vim_command", command: "ciw" },
      { type: "insert_text", text: "value", textLength: 5 },
    ],
    speed_score: 82,
    accuracy_score: 92,
    scoring_version: "v1",
    performance_quality: 4,
    practice_context: "different_exercise",
    created_at: "2026-07-21T08:00:13.000Z",
    ...overrides,
  };
}

function masteryRow(
  overrides: Partial<UserSkillMasteryRow> = {},
): UserSkillMasteryRow {
  return {
    user_id: "00000000-0000-4000-8000-000000000001",
    skill_id: "00000000-0000-4000-8000-000000000201",
    mastery_level: 3,
    mastery_score: 61.5,
    successful_attempts: 4,
    failed_attempts: 1,
    unique_exercises_completed: 3,
    unique_exercise_ids: [
      "00000000-0000-4000-8000-000000000301",
      "00000000-0000-4000-8000-000000000302",
    ],
    consecutive_successes: 2,
    average_speed_score: 70,
    average_accuracy_score: 88,
    average_hint_level: 0.5,
    first_unhinted_success_at: "2026-07-18T08:00:00.000Z",
    latest_unhinted_success_at: "2026-07-20T08:00:00.000Z",
    last_practiced_at: "2026-07-21T08:00:00.000Z",
    last_success_at: "2026-07-20T08:00:00.000Z",
    updated_at: "2026-07-21T08:00:01.000Z",
    ...overrides,
  };
}

function reviewRow(
  overrides: Partial<UserReviewItemRow> = {},
): UserReviewItemRow {
  return {
    user_id: "00000000-0000-4000-8000-000000000001",
    exercise_id: "00000000-0000-4000-8000-000000000104",
    skill_id: "00000000-0000-4000-8000-000000000201",
    review_status: "reviewing",
    priority: 55,
    current_interval_days: 7,
    due_at: "2026-07-28T08:00:00.000Z",
    last_reviewed_at: "2026-07-21T08:00:12.000Z",
    last_result: "completed",
    mastery_level: 3,
    last_performance_quality: 4,
    last_attempt_at: "2026-07-21T08:00:12.000Z",
    updated_at: "2026-07-21T08:00:13.000Z",
    ...overrides,
  };
}

describe("mapCloudSettings", () => {
  it("maps a valid row exactly", () => {
    const row = settingsRow();

    expect(mapCloudSettings(row)).toEqual({
      editorFontSize: 18,
      showLineNumbers: true,
      showKeypresses: false,
      preferredQuestionCount: 20,
      lastLearningMode: "efficiency",
      updatedAt: "2026-07-16T08:01:00.000Z",
    });
  });

  it("accepts a null last_learning_mode", () => {
    const row = settingsRow({ last_learning_mode: null });

    expect(mapCloudSettings(row).lastLearningMode).toBeNull();
  });

  it("throws on an unsupported preferred question count", () => {
    const row = settingsRow({ preferred_question_count: 15 });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("throws on an unsupported learning mode", () => {
    const row = settingsRow({ last_learning_mode: "expert" });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("throws on an invalid updated_at timestamp", () => {
    const row = settingsRow({ updated_at: "not-a-timestamp" });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("throws on a locale-formatted updated_at", () => {
    const row = settingsRow({ updated_at: "07/21/2026" });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("throws on a date-only updated_at with no time component", () => {
    const row = settingsRow({ updated_at: "2026-07-21" });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("throws on a font size below the 12-28 domain", () => {
    const row = settingsRow({ editor_font_size: 11 });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("throws on a font size above the 12-28 domain", () => {
    const row = settingsRow({ editor_font_size: 29 });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("throws on a fractional font size", () => {
    const row = settingsRow({ editor_font_size: 16.5 });

    expect(() => mapCloudSettings(row)).toThrow();
  });

  it("does not mutate the input row", () => {
    const row = Object.freeze(settingsRow());

    expect(() => mapCloudSettings(row)).not.toThrow();
  });
});

describe("mapCloudAttempt", () => {
  it("maps a valid row exactly", () => {
    const row = attemptRow();

    expect(mapCloudAttempt(row)).toEqual({
      clientAttemptId: "00000000-0000-4000-8000-000000000102",
      sessionId: "00000000-0000-4000-8000-000000000103",
      exerciseId: "00000000-0000-4000-8000-000000000104",
      exerciseVersion: 2,
      learningMode: "memory_review",
      source: "web",
      completed: true,
      startedAt: "2026-07-21T08:00:00.000Z",
      completedAt: "2026-07-21T08:00:12.000Z",
      durationMs: 12_000,
      keystrokeCount: 8,
      recommendedKeystrokeCount: 6,
      mistakeCount: 1,
      undoCount: 0,
      resetCount: 0,
      highestHintLevel: 1,
      usedRecommendedSolution: false,
      normalizedActions: [
        { type: "vim_command", command: "ciw" },
        { type: "insert_text", text: "value", textLength: 5 },
      ],
      speedScore: 82,
      accuracyScore: 92,
      performanceQuality: 4,
      practiceContext: "different_exercise",
      createdAt: "2026-07-21T08:00:13.000Z",
    });
  });

  it("normalizes a null normalized_actions and null speed_score for legacy rows", () => {
    const row = attemptRow({
      normalized_actions: null,
      speed_score: null,
      session_id: null,
      completed_at: null,
      duration_ms: null,
      recommended_keystroke_count: null,
    });

    const mapped = mapCloudAttempt(row);

    expect(mapped.normalizedActions).toEqual([]);
    expect(mapped.speedScore).toBe(0);
    expect(mapped.sessionId).toBeNull();
    expect(mapped.completedAt).toBeNull();
    expect(mapped.durationMs).toBeNull();
    expect(mapped.recommendedKeystrokeCount).toBeNull();
  });

  it("throws on a malformed client_attempt_id", () => {
    const row = attemptRow({ client_attempt_id: "not-a-uuid" });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an accuracy score outside 0..100", () => {
    const row = attemptRow({ accuracy_score: 101 });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on a performance quality outside 0..5", () => {
    const row = attemptRow({ performance_quality: 6 });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on a hint level outside 0..4", () => {
    const row = attemptRow({ hint_level_used: 5 });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an unsupported practice context", () => {
    const row = attemptRow({ practice_context: "whenever" });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an unsupported learning mode", () => {
    const row = attemptRow({ learning_mode: "expert" });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an invalid started_at timestamp", () => {
    const row = attemptRow({ started_at: "not-a-timestamp" });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws when normalized_actions is neither null nor an array", () => {
    const row = attemptRow({
      normalized_actions: { type: "vim_command", command: "x" } as never,
    });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an invalid NormalizedAction object inside the array", () => {
    const row = attemptRow({
      normalized_actions: [{ type: "vim_command" }] as never,
    });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on a negative counter", () => {
    const row = attemptRow({ mistake_count: -1 });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an impossible calendar date in started_at", () => {
    const row = attemptRow({ started_at: "2026-02-30T00:00:00Z" });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on a fractional speed_score", () => {
    const row = attemptRow({ speed_score: 82.5 });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on a fractional accuracy_score", () => {
    const row = attemptRow({ accuracy_score: 92.5 });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an insert_text action with a negative textLength", () => {
    const row = attemptRow({
      normalized_actions: [
        { type: "insert_text", text: "value", textLength: -1 },
      ] as never,
    });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an insert_text action with a fractional textLength", () => {
    const row = attemptRow({
      normalized_actions: [
        { type: "insert_text", text: "value", textLength: 2.5 },
      ] as never,
    });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("throws on an insert_text action whose textLength does not match text.length", () => {
    const row = attemptRow({
      normalized_actions: [
        { type: "insert_text", text: "value", textLength: 3 },
      ] as never,
    });

    expect(() => mapCloudAttempt(row)).toThrow();
  });

  it("never aliases the input row's normalized_actions array or its action objects", () => {
    const row = attemptRow();
    const originalActions = structuredClone(row.normalized_actions);
    const mapped = mapCloudAttempt(row);

    mapped.normalizedActions.push({ type: "undo" });
    if (mapped.normalizedActions[0]?.type === "vim_command") {
      mapped.normalizedActions[0].command = "mutated";
    }

    expect(row.normalized_actions).toEqual(originalActions);
    expect(mapped.normalizedActions).not.toBe(row.normalized_actions);
  });

  it("does not mutate the input row", () => {
    const row = Object.freeze(attemptRow());

    expect(() => mapCloudAttempt(row)).not.toThrow();
  });
});

describe("mapCloudSkillMastery", () => {
  it("maps a valid row exactly", () => {
    const row = masteryRow();

    expect(mapCloudSkillMastery(row)).toEqual({
      skillId: "00000000-0000-4000-8000-000000000201",
      masteryScore: 61.5,
      masteryLevel: 3,
      successfulAttempts: 4,
      uniqueExerciseIds: [
        "00000000-0000-4000-8000-000000000301",
        "00000000-0000-4000-8000-000000000302",
      ],
      consecutiveSuccesses: 2,
      firstUnhintedSuccessAt: "2026-07-18T08:00:00.000Z",
      latestUnhintedSuccessAt: "2026-07-20T08:00:00.000Z",
      lastAttemptAt: "2026-07-21T08:00:00.000Z",
      updatedAt: "2026-07-21T08:00:01.000Z",
    });
  });

  it("normalizes null unique_exercise_ids to an empty array and falls back last_practiced_at to updated_at", () => {
    const row = masteryRow({
      unique_exercise_ids: null as unknown as string[],
      last_practiced_at: null,
      first_unhinted_success_at: null,
      latest_unhinted_success_at: null,
    });

    const mapped = mapCloudSkillMastery(row);

    expect(mapped.uniqueExerciseIds).toEqual([]);
    expect(mapped.lastAttemptAt).toBe(row.updated_at);
    expect(mapped.firstUnhintedSuccessAt).toBeNull();
    expect(mapped.latestUnhintedSuccessAt).toBeNull();
  });

  it("throws on a malformed skill_id", () => {
    const row = masteryRow({ skill_id: "not-a-uuid" });

    expect(() => mapCloudSkillMastery(row)).toThrow();
  });

  it("throws on a mastery level outside 0..5", () => {
    const row = masteryRow({ mastery_level: 6 });

    expect(() => mapCloudSkillMastery(row)).toThrow();
  });

  it("throws on a mastery score outside 0..100", () => {
    const row = masteryRow({ mastery_score: 150 });

    expect(() => mapCloudSkillMastery(row)).toThrow();
  });

  it("throws on a malformed uuid inside unique_exercise_ids", () => {
    const row = masteryRow({ unique_exercise_ids: ["not-a-uuid"] });

    expect(() => mapCloudSkillMastery(row)).toThrow();
  });

  it("throws on a negative counter", () => {
    const row = masteryRow({ successful_attempts: -1 });

    expect(() => mapCloudSkillMastery(row)).toThrow();
  });

  it("never aliases the input row's unique_exercise_ids array", () => {
    const row = masteryRow();
    const mapped = mapCloudSkillMastery(row);

    mapped.uniqueExerciseIds.push("00000000-0000-4000-8000-000000000999");

    expect(row.unique_exercise_ids).not.toContain(
      "00000000-0000-4000-8000-000000000999",
    );
    expect(mapped.uniqueExerciseIds).not.toBe(row.unique_exercise_ids);
  });

  it("does not mutate the input row", () => {
    const row = Object.freeze(masteryRow());

    expect(() => mapCloudSkillMastery(row)).not.toThrow();
  });
});

describe("mapCloudExerciseReview", () => {
  it("maps a valid row exactly", () => {
    const row = reviewRow();

    expect(mapCloudExerciseReview(row)).toEqual({
      exerciseId: "00000000-0000-4000-8000-000000000104",
      masteryLevel: 3,
      currentIntervalDays: 7,
      dueAt: "2026-07-28T08:00:00.000Z",
      lastPerformanceQuality: 4,
      lastAttemptAt: "2026-07-21T08:00:12.000Z",
      updatedAt: "2026-07-21T08:00:13.000Z",
    });
  });

  it("accepts the minimum current_interval_days of 0", () => {
    const row = reviewRow({ current_interval_days: 0 });

    expect(mapCloudExerciseReview(row).currentIntervalDays).toBe(0);
  });

  it("throws on a malformed exercise_id", () => {
    const row = reviewRow({ exercise_id: "not-a-uuid" });

    expect(() => mapCloudExerciseReview(row)).toThrow();
  });

  it("throws on a mastery level outside 0..5", () => {
    const row = reviewRow({ mastery_level: 6 });

    expect(() => mapCloudExerciseReview(row)).toThrow();
  });

  it("throws on a last performance quality outside 0..5", () => {
    const row = reviewRow({ last_performance_quality: 6 });

    expect(() => mapCloudExerciseReview(row)).toThrow();
  });

  it("throws on a negative current_interval_days", () => {
    const row = reviewRow({ current_interval_days: -1 });

    expect(() => mapCloudExerciseReview(row)).toThrow();
  });

  it("throws on an invalid due_at timestamp", () => {
    const row = reviewRow({ due_at: "not-a-timestamp" });

    expect(() => mapCloudExerciseReview(row)).toThrow();
  });

  it("throws on a date-only due_at with no time component", () => {
    const row = reviewRow({ due_at: "2026-07-21" });

    expect(() => mapCloudExerciseReview(row)).toThrow();
  });

  it("does not mutate the input row", () => {
    const row = Object.freeze(reviewRow());

    expect(() => mapCloudExerciseReview(row)).not.toThrow();
  });
});
