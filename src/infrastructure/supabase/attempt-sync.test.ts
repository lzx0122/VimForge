import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import migrationSql from "../../../supabase/migrations/20260716000400_add_record_attempt_function.sql?raw";
import missingSessionMigrationSql from "../../../supabase/migrations/20260716125332_allow_missing_attempt_session.sql?raw";
import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import { SupabaseAttemptSyncRepository } from "./supabase-attempt-sync-repository";
import type { Database } from "./database.types";

let clientCount = 0;

function createAttempt(): AttemptSyncInput {
  return {
    clientAttemptId: "00000000-0000-4000-8000-000000000101",
    sessionId: "00000000-0000-4000-8000-000000000201",
    exerciseId: "00000000-0000-4000-8000-000000000301",
    exerciseVersion: 2,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-16T08:00:00.000Z",
    completedAt: "2026-07-16T08:00:12.000Z",
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
  };
}

function createMockClient(
  responseBody: unknown,
  status = 200,
): {
  client: SupabaseClient<Database>;
  requests: Request[];
} {
  const requests: Request[] = [];
  clientCount += 1;
  const mockFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);

    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createClient<Database>(
    "https://attempt-sync-test.supabase.co",
    "sb_publishable_attempt_sync_test_key",
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
        storageKey: `attempt-sync-test-${clientCount}`,
      },
      global: { fetch: mockFetch },
    },
  );

  return { client, requests };
}

describe("record_exercise_attempt migration", () => {
  const normalizedSql = migrationSql.toLowerCase();

  it("uses an invoker RPC and derives the owner only from auth.uid", () => {
    expect(normalizedSql).toContain(
      "create function public.record_exercise_attempt(payload jsonb)",
    );
    expect(normalizedSql).toContain("security invoker");
    expect(normalizedSql).not.toContain("security definer");
    expect(normalizedSql).toContain("(select auth.uid())");
    expect(normalizedSql).not.toMatch(/payload\s*->>?\s*'user_id'/);
    expect(normalizedSql).not.toMatch(
      /record_exercise_attempt\([^)]*user_id/,
    );
  });

  it("deduplicates before updating every learning summary", () => {
    const attemptInsert = normalizedSql.indexOf(
      "insert into public.exercise_attempts",
    );
    const progressUpsert = normalizedSql.indexOf(
      "insert into public.user_exercise_progress",
    );
    const masteryUpsert = normalizedSql.indexOf(
      "insert into public.user_skill_mastery",
    );
    const reviewUpsert = normalizedSql.indexOf(
      "insert into public.user_review_items",
    );
    const sessionUpdate = normalizedSql.indexOf(
      "update public.practice_sessions",
    );

    expect(normalizedSql).toContain(
      "on conflict (user_id, client_attempt_id) do nothing",
    );
    expect(normalizedSql).toContain("if v_attempt_id is null then");
    expect(normalizedSql).toMatch(
      /select\s+exercise_attempts\.id,\s+exercise_attempts\.exercise_id\s+into\s+v_attempt_id,\s+v_exercise_id/,
    );
    expect(attemptInsert).toBeGreaterThan(-1);
    expect(progressUpsert).toBeGreaterThan(attemptInsert);
    expect(masteryUpsert).toBeGreaterThan(progressUpsert);
    expect(reviewUpsert).toBeGreaterThan(masteryUpsert);
    expect(sessionUpdate).toBeGreaterThan(reviewUpsert);
  });

  it("exposes the RPC only to authenticated users", () => {
    const signature =
      "function public.record_exercise_attempt(jsonb)";

    expect(normalizedSql).toContain(
      `revoke execute on ${signature} from public, anon`,
    );
    expect(normalizedSql).toContain(
      `grant execute on ${signature} to authenticated`,
    );
    expect(normalizedSql).not.toContain(
      `grant execute on ${signature} to anon`,
    );
  });
});

describe("record_exercise_attempt missing-session regression", () => {
  const normalizedSql = missingSessionMigrationSql.toLowerCase();

  it("normalizes an unavailable session before inserting the attempt", () => {
    const sessionParse = normalizedSql.indexOf(
      "v_session_id := nullif(payload ->> 'sessionid', '')::uuid",
    );
    const ownedSessionLookup = normalizedSql.indexOf(
      "select practice_sessions.id into v_session_id",
    );
    const attemptInsert = normalizedSql.indexOf(
      "insert into public.exercise_attempts",
    );

    expect(normalizedSql).toContain(
      "create or replace function public.record_exercise_attempt(payload jsonb)",
    );
    expect(normalizedSql).toContain("security invoker");
    expect(normalizedSql).toContain(
      "where practice_sessions.id = v_session_id",
    );
    expect(normalizedSql).toContain(
      "and practice_sessions.user_id = v_user_id",
    );
    expect(sessionParse).toBeGreaterThan(-1);
    expect(ownedSessionLookup).toBeGreaterThan(sessionParse);
    expect(attemptInsert).toBeGreaterThan(ownedSessionLookup);
  });
});

describe("SupabaseAttemptSyncRepository", () => {
  it("calls the RPC without a caller-controlled user ID and maps its result", async () => {
    const { client, requests } = createMockClient({
      attemptId: "00000000-0000-4000-8000-000000000401",
      mastery: [
        {
          skillId: "00000000-0000-4000-8000-000000000501",
          masteryLevel: 2,
          masteryScore: 48.25,
        },
      ],
      dueAt: "2026-07-19T08:00:12.000Z",
    });
    const repository = new SupabaseAttemptSyncRepository(client);

    await expect(repository.recordAttempt(createAttempt())).resolves.toEqual({
      attemptId: "00000000-0000-4000-8000-000000000401",
      mastery: [
        {
          skillId: "00000000-0000-4000-8000-000000000501",
          masteryLevel: 2,
          masteryScore: 48.25,
        },
      ],
      dueAt: "2026-07-19T08:00:12.000Z",
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request).toBeDefined();
    expect(new URL(request?.url ?? "").pathname).toBe(
      "/rest/v1/rpc/record_exercise_attempt",
    );
    expect(request?.method).toBe("POST");
    const body: unknown = await request?.json();
    expect(body).toMatchObject({
      payload: {
        clientAttemptId: "00000000-0000-4000-8000-000000000101",
        exerciseId: "00000000-0000-4000-8000-000000000301",
        performanceQuality: 4,
        practiceContext: "different_exercise",
      },
    });
    expect(JSON.stringify(body)).not.toContain("userId");
    expect(JSON.stringify(body)).not.toContain("user_id");
  });

  it("rejects malformed RPC data", async () => {
    const { client } = createMockClient({
      attemptId: "not-a-complete-result",
      mastery: "invalid",
    });
    const repository = new SupabaseAttemptSyncRepository(client);

    await expect(repository.recordAttempt(createAttempt())).rejects.toThrow(
      "Invalid record attempt response from Supabase.",
    );
  });

  it("reports an RPC error without leaking the payload", async () => {
    const { client } = createMockClient(
      {
        code: "42501",
        details: null,
        hint: null,
        message: "permission denied",
      },
      403,
    );
    const repository = new SupabaseAttemptSyncRepository(client);

    await expect(repository.recordAttempt(createAttempt())).rejects.toThrow(
      "Unable to sync the exercise attempt.",
    );
  });
});
