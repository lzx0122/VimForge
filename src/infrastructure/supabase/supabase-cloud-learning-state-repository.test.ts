import { describe, expect, it } from "vitest";

import type {
  AttemptHydrationCursor,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "../../types/cloud-learning-state";
import { SupabaseCloudLearningStateRepository } from "./supabase-cloud-learning-state-repository";
import type { Database } from "./database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface RecordedQuery {
  table: string;
  select: string | null;
  order: Array<{ column: string; ascending: boolean }>;
  or: string | null;
  limit: number | null;
  maybeSingle: boolean;
}

function emptyQuery(): RecordedQuery {
  return { table: "", select: null, order: [], or: null, limit: null, maybeSingle: false };
}

function createFakeSupabaseClient(result: {
  data: unknown;
  error: { message: string } | null;
}): { client: SupabaseClient<Database>; query: RecordedQuery } {
  const query = emptyQuery();

  const builder = {
    select(columns: string) {
      query.select = columns;
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      query.order.push({ column, ascending: options.ascending });
      return builder;
    },
    or(filter: string) {
      query.or = filter;
      return builder;
    },
    limit(count: number) {
      query.limit = count;
      return builder;
    },
    maybeSingle() {
      query.maybeSingle = true;
      return Promise.resolve(result);
    },
    then<TResult1, TResult2 = never>(
      onFulfilled?:
        | ((value: typeof result) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  const client = {
    from(table: string) {
      query.table = table;
      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, query };
}

function settingsRow() {
  return {
    editor_font_size: 18,
    show_line_numbers: true,
    show_keypresses: false,
    preferred_question_count: 20,
    last_learning_mode: "efficiency",
    updated_at: "2026-07-16T08:01:00.000Z",
  };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    client_attempt_id: "00000000-0000-4000-8000-000000000102",
    session_id: null,
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
    normalized_actions: [],
    speed_score: 82,
    accuracy_score: 92,
    performance_quality: 4,
    practice_context: "different_exercise",
    created_at: "2026-07-21T08:00:13.000Z",
    ...overrides,
  };
}

function masteryRow(overrides: Record<string, unknown> = {}) {
  return {
    skill_id: "00000000-0000-4000-8000-000000000201",
    mastery_score: 61.5,
    mastery_level: 3,
    successful_attempts: 4,
    unique_exercise_ids: [],
    consecutive_successes: 2,
    first_unhinted_success_at: null,
    latest_unhinted_success_at: null,
    last_practiced_at: "2026-07-21T08:00:00.000Z",
    updated_at: "2026-07-21T08:00:01.000Z",
    ...overrides,
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: "00000000-0000-4000-8000-000000000104",
    mastery_level: 3,
    current_interval_days: 7,
    due_at: "2026-07-28T08:00:00.000Z",
    last_performance_quality: 4,
    last_attempt_at: "2026-07-21T08:00:12.000Z",
    updated_at: "2026-07-21T08:00:13.000Z",
    ...overrides,
  };
}

const attemptCursor: AttemptHydrationCursor = {
  createdAt: "2026-07-20T00:00:00.000Z",
  clientAttemptId: "00000000-0000-4000-8000-000000000099",
};
const masteryCursor: MasteryHydrationCursor = {
  updatedAt: "2026-07-20T00:00:00.000Z",
  skillId: "00000000-0000-4000-8000-000000000199",
};
const reviewCursor: ReviewHydrationCursor = {
  updatedAt: "2026-07-20T00:00:00.000Z",
  exerciseId: "00000000-0000-4000-8000-000000000299",
};

describe("SupabaseCloudLearningStateRepository.getSettings", () => {
  it("selects only the active frontend fields and updated_at, excluding sound_enabled", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: settingsRow(),
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.getSettings();

    expect(query.table).toBe("user_settings");
    expect(query.select).not.toBeNull();
    expect(query.select).not.toContain("sound_enabled");
    for (const column of [
      "editor_font_size",
      "show_line_numbers",
      "show_keypresses",
      "preferred_question_count",
      "last_learning_mode",
      "updated_at",
    ]) {
      expect(query.select).toContain(column);
    }
    expect(query.maybeSingle).toBe(true);
  });

  it("maps a returned row through mapCloudSettings", async () => {
    const { client } = createFakeSupabaseClient({
      data: settingsRow(),
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.getSettings()).resolves.toEqual({
      editorFontSize: 18,
      showLineNumbers: true,
      showKeypresses: false,
      preferredQuestionCount: 20,
      lastLearningMode: "efficiency",
      updatedAt: "2026-07-16T08:01:00.000Z",
    });
  });

  it("returns null when no settings row exists", async () => {
    const { client } = createFakeSupabaseClient({ data: null, error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.getSettings()).resolves.toBeNull();
  });

  it("propagates a mapper error for a malformed row without swallowing it", async () => {
    const { client } = createFakeSupabaseClient({
      data: { ...settingsRow(), editor_font_size: 999 },
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.getSettings()).rejects.toThrow();
  });

  it("wraps a Supabase error as a cause-preserving Error", async () => {
    const supabaseError = { message: "permission denied" };
    const { client } = createFakeSupabaseClient({
      data: null,
      error: supabaseError,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.getSettings()).rejects.toMatchObject({
      cause: supabaseError,
    });
  });
});

describe("SupabaseCloudLearningStateRepository.listAttemptsPage", () => {
  it("selects the exact attempt columns the mapper needs", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listAttemptsPage(null);

    expect(query.table).toBe("exercise_attempts");
    for (const column of [
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
    ]) {
      expect(query.select).toContain(column);
    }
  });

  it("orders by created_at then client_attempt_id, both ascending", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listAttemptsPage(null);

    expect(query.order).toEqual([
      { column: "created_at", ascending: true },
      { column: "client_attempt_id", ascending: true },
    ]);
  });

  it("applies no cursor filter on the first page", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listAttemptsPage(null);

    expect(query.or).toBeNull();
  });

  it("applies a compound (created_at, client_attempt_id) cursor filter", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listAttemptsPage(attemptCursor);

    expect(query.or).toBe(
      `created_at.gt.${attemptCursor.createdAt},and(created_at.eq.${attemptCursor.createdAt},client_attempt_id.gt.${attemptCursor.clientAttemptId})`,
    );
  });

  it("requests limit + 1 rows, defaulting the limit to 200", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listAttemptsPage(null);

    expect(query.limit).toBe(201);
  });

  it("requests limit + 1 rows for a custom limit, clamped to the 500 maximum", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listAttemptsPage(null, 900);

    expect(query.limit).toBe(501);
  });

  it("returns an empty page with a null cursor when there are no rows", async () => {
    const { client } = createFakeSupabaseClient({ data: [], error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.listAttemptsPage(null)).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("returns exactly `limit` items with hasMore and a cursor from the last returned item when an extra row exists", async () => {
    const rows = [
      attemptRow({ client_attempt_id: "00000000-0000-4000-8000-000000000001" }),
      attemptRow({ client_attempt_id: "00000000-0000-4000-8000-000000000002" }),
      attemptRow({ client_attempt_id: "00000000-0000-4000-8000-000000000003" }),
    ];
    const { client } = createFakeSupabaseClient({ data: rows, error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    const page = await repository.listAttemptsPage(null, 2);

    expect(page.items).toHaveLength(2);
    expect(page.items.map((item) => item.clientAttemptId)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual({
      createdAt: rows[1]?.created_at,
      clientAttemptId: "00000000-0000-4000-8000-000000000002",
    });
  });

  it("has no more pages, but still gives the last-item cursor, when exactly `limit` rows exist", async () => {
    const rows = [attemptRow(), attemptRow({ client_attempt_id: "00000000-0000-4000-8000-000000000777" })];
    const { client } = createFakeSupabaseClient({ data: rows, error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    const page = await repository.listAttemptsPage(null, 2);

    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toEqual({
      createdAt: rows[1]?.created_at,
      clientAttemptId: "00000000-0000-4000-8000-000000000777",
    });
  });

  it("propagates a mapper error for a malformed row without swallowing it", async () => {
    const rows = [attemptRow({ client_attempt_id: "not-a-uuid" })];
    const { client } = createFakeSupabaseClient({ data: rows, error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.listAttemptsPage(null)).rejects.toThrow();
  });

  it("wraps a Supabase error as a cause-preserving Error", async () => {
    const supabaseError = { message: "connection reset" };
    const { client } = createFakeSupabaseClient({
      data: null,
      error: supabaseError,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.listAttemptsPage(null)).rejects.toMatchObject({
      cause: supabaseError,
    });
  });
});

describe("SupabaseCloudLearningStateRepository.listMasteryPage", () => {
  it("selects the exact mastery columns the mapper needs", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listMasteryPage(null);

    expect(query.table).toBe("user_skill_mastery");
    for (const column of [
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
    ]) {
      expect(query.select).toContain(column);
    }
  });

  it("orders by updated_at then skill_id, both ascending", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listMasteryPage(null);

    expect(query.order).toEqual([
      { column: "updated_at", ascending: true },
      { column: "skill_id", ascending: true },
    ]);
  });

  it("applies a compound (updated_at, skill_id) cursor filter", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listMasteryPage(masteryCursor);

    expect(query.or).toBe(
      `updated_at.gt.${masteryCursor.updatedAt},and(updated_at.eq.${masteryCursor.updatedAt},skill_id.gt.${masteryCursor.skillId})`,
    );
  });

  it("requests limit + 1 rows, defaulting the limit to 200", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listMasteryPage(null);

    expect(query.limit).toBe(201);
  });

  it("returns an empty page with a null cursor when there are no rows", async () => {
    const { client } = createFakeSupabaseClient({ data: [], error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.listMasteryPage(null)).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("returns a cursor from the last returned item when an extra row exists", async () => {
    const rows = [
      masteryRow({ skill_id: "00000000-0000-4000-8000-000000000001" }),
      masteryRow({ skill_id: "00000000-0000-4000-8000-000000000002" }),
      masteryRow({ skill_id: "00000000-0000-4000-8000-000000000003" }),
    ];
    const { client } = createFakeSupabaseClient({ data: rows, error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    const page = await repository.listMasteryPage(null, 2);

    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual({
      updatedAt: rows[1]?.updated_at,
      skillId: "00000000-0000-4000-8000-000000000002",
    });
  });

  it("propagates a mapper error and wraps a Supabase error", async () => {
    const malformedRows = [masteryRow({ skill_id: "not-a-uuid" })];
    const { client: malformedClient } = createFakeSupabaseClient({
      data: malformedRows,
      error: null,
    });
    const repositoryWithMalformedRow = new SupabaseCloudLearningStateRepository(
      malformedClient,
    );
    await expect(
      repositoryWithMalformedRow.listMasteryPage(null),
    ).rejects.toThrow();

    const supabaseError = { message: "timeout" };
    const { client: errorClient } = createFakeSupabaseClient({
      data: null,
      error: supabaseError,
    });
    const repositoryWithError = new SupabaseCloudLearningStateRepository(
      errorClient,
    );
    await expect(
      repositoryWithError.listMasteryPage(null),
    ).rejects.toMatchObject({ cause: supabaseError });
  });
});

describe("SupabaseCloudLearningStateRepository.listReviewsPage", () => {
  it("selects the exact review columns the mapper needs", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listReviewsPage(null);

    expect(query.table).toBe("user_review_items");
    for (const column of [
      "exercise_id",
      "mastery_level",
      "current_interval_days",
      "due_at",
      "last_performance_quality",
      "last_attempt_at",
      "updated_at",
    ]) {
      expect(query.select).toContain(column);
    }
  });

  it("orders by updated_at then exercise_id, both ascending", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listReviewsPage(null);

    expect(query.order).toEqual([
      { column: "updated_at", ascending: true },
      { column: "exercise_id", ascending: true },
    ]);
  });

  it("applies a compound (updated_at, exercise_id) cursor filter", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listReviewsPage(reviewCursor);

    expect(query.or).toBe(
      `updated_at.gt.${reviewCursor.updatedAt},and(updated_at.eq.${reviewCursor.updatedAt},exercise_id.gt.${reviewCursor.exerciseId})`,
    );
  });

  it("requests limit + 1 rows, defaulting the limit to 200", async () => {
    const { client, query } = createFakeSupabaseClient({
      data: [],
      error: null,
    });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await repository.listReviewsPage(null);

    expect(query.limit).toBe(201);
  });

  it("returns an empty page with a null cursor when there are no rows", async () => {
    const { client } = createFakeSupabaseClient({ data: [], error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    await expect(repository.listReviewsPage(null)).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("returns a cursor from the last returned item when an extra row exists", async () => {
    const rows = [
      reviewRow({ exercise_id: "00000000-0000-4000-8000-000000000001" }),
      reviewRow({ exercise_id: "00000000-0000-4000-8000-000000000002" }),
      reviewRow({ exercise_id: "00000000-0000-4000-8000-000000000003" }),
    ];
    const { client } = createFakeSupabaseClient({ data: rows, error: null });
    const repository = new SupabaseCloudLearningStateRepository(client);

    const page = await repository.listReviewsPage(null, 2);

    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual({
      updatedAt: rows[1]?.updated_at,
      exerciseId: "00000000-0000-4000-8000-000000000002",
    });
  });

  it("propagates a mapper error and wraps a Supabase error", async () => {
    const malformedRows = [reviewRow({ exercise_id: "not-a-uuid" })];
    const { client: malformedClient } = createFakeSupabaseClient({
      data: malformedRows,
      error: null,
    });
    const repositoryWithMalformedRow = new SupabaseCloudLearningStateRepository(
      malformedClient,
    );
    await expect(
      repositoryWithMalformedRow.listReviewsPage(null),
    ).rejects.toThrow();

    const supabaseError = { message: "service unavailable" };
    const { client: errorClient } = createFakeSupabaseClient({
      data: null,
      error: supabaseError,
    });
    const repositoryWithError = new SupabaseCloudLearningStateRepository(
      errorClient,
    );
    await expect(
      repositoryWithError.listReviewsPage(null),
    ).rejects.toMatchObject({ cause: supabaseError });
  });
});
