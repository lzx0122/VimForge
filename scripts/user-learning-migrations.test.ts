import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const schemaSql = readProjectFile(
  "supabase/migrations/20260716000200_create_user_learning.sql",
);
const rlsSql = readProjectFile(
  "supabase/migrations/20260716000300_add_user_learning_rls.sql",
);
const rlsTestSql = readProjectFile("supabase/tests/rls_user_learning.sql");
const hydrationSql = readProjectFile(
  "supabase/migrations/20260721000100_add_p1_hydration_contract.sql",
);
const hydrationTestSql = readProjectFile(
  "supabase/tests/p1_learning_hydration.sql",
);

const userTables = [
  "profiles",
  "user_settings",
  "practice_sessions",
  "exercise_attempts",
  "user_exercise_progress",
  "user_skill_mastery",
  "user_review_items",
  "guest_imports",
] as const;

describe("user learning schema", () => {
  it("creates all user-owned tables with required constraints and indexes", () => {
    for (const table of userTables) {
      expect(schemaSql).toContain(`create table public.${table}`);
    }

    expect(schemaSql).toContain("unique (user_id, client_attempt_id)");
    expect(schemaSql).toContain("mastery_level between 0 and 5");
    expect(schemaSql).toContain("current_interval_days between 0 and 30");
    expect(schemaSql).toContain("review_user_due_idx");
    expect(schemaSql).toContain("attempts_user_exercise_created_idx");
    expect(schemaSql).toContain("sessions_user_status_updated_idx");
  });

  it("creates profile and settings with a fixed-path auth trigger", () => {
    expect(schemaSql).toContain("create schema if not exists private");
    expect(schemaSql).toContain("create function private.handle_new_user()");
    expect(schemaSql).toContain("security definer");
    expect(schemaSql).toContain("set search_path = ''");
    expect(schemaSql).toContain("create trigger on_auth_user_created");
    expect(schemaSql).toContain(
      "revoke all on schema private from public, anon, authenticated",
    );
    expect(schemaSql).toContain("left(coalesce(");
    expect(schemaSql).toContain(", 50)");
    expect(schemaSql).toContain(
      "revoke execute on function private.handle_new_user() from public",
    );
  });
});

describe("user learning RLS", () => {
  it("enables RLS and defines owner policies for every exposed table", () => {
    for (const table of userTables) {
      expect(rlsSql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(rlsSql).toContain(`create policy "${table}_select_own"`);
      expect(rlsSql).toContain(`create policy "${table}_insert_own"`);
    }

    expect(rlsSql).toContain("(select auth.uid()) = id");
    expect(rlsSql.match(/\(select auth\.uid\(\)\) = user_id/g)?.length)
      .toBeGreaterThanOrEqual(14);
  });

  it("keeps attempts append-only for authenticated users", () => {
    expect(rlsSql).not.toContain(
      'create policy "exercise_attempts_update_own"',
    );
    expect(rlsSql).not.toContain(
      'create policy "exercise_attempts_delete_own"',
    );
    expect(rlsSql).not.toMatch(/grant .*delete.*exercise_attempts/is);
  });

  it("contains executable A/B isolation tests for exercise attempts", () => {
    expect(rlsTestSql).toContain("select plan(");
    expect(rlsTestSql).toContain("00000000-0000-4000-8000-00000000000a");
    expect(rlsTestSql).toContain("00000000-0000-4000-8000-00000000000b");
    expect(rlsTestSql).toContain("set local role authenticated");
    expect(rlsTestSql).toContain("request.jwt.claim.sub");
    expect(rlsTestSql).toContain("from public.exercise_attempts");
    expect(rlsTestSql).toContain("select * from finish()");
    expect(rlsTestSql).toContain("rollback");
  });

  it("tests anonymous access to published and unpublished catalog rows", () => {
    expect(rlsTestSql).toContain("set local role anon");
    expect(rlsTestSql).toContain("where is_published = true");
    expect(rlsTestSql).toContain("where is_published = false");
    expect(rlsTestSql).toContain("anonymous users can read published exercises");
    expect(rlsTestSql).toContain("anonymous users cannot read unpublished exercises");
  });

  it("uses the pgTAP overload that accepts any thrown error", () => {
    const throwAssertions = [
      ...rlsTestSql.matchAll(/select throws_ok\(\n([\s\S]*?)\n\);/g),
    ];

    expect(throwAssertions).toHaveLength(3);
    for (const assertion of throwAssertions) {
      expect(assertion[1]?.trimEnd()).toMatch(/\$\$$/);
    }
  });
});

describe("P1 cloud hydration migration", () => {
  it("adds the attempt performance quality and practice context columns with backfill and constraints", () => {
    expect(hydrationSql).toContain(
      "alter table public.exercise_attempts",
    );
    expect(hydrationSql).toContain("add column performance_quality smallint");
    expect(hydrationSql).toContain("add column practice_context text");
    expect(hydrationSql).toContain(
      "alter column performance_quality set not null",
    );
    expect(hydrationSql).toContain(
      "alter column practice_context set not null",
    );
    expect(hydrationSql).toContain(
      "check (performance_quality between 0 and 5)",
    );
    expect(hydrationSql).toContain(
      "practice_context in (\n        'same_exercise_immediate',\n        'different_exercise',\n        'next_day',\n        'seven_days'\n      )",
    );
    expect(hydrationSql).toContain("practice_context = 'different_exercise'");
    expect(hydrationSql).toContain(">= 90 then 5");
    expect(hydrationSql).toContain(">= 75 then 4");
    expect(hydrationSql).toContain(">= 50 then 3");
    expect(hydrationSql).toContain(">= 25 then 2");
    expect(hydrationSql).toContain(">= 1 then 1");
    expect(hydrationSql).toContain("coalesce(speed_score, 0) * 0.5");
  });

  it("adds and backfills the mastery hydration columns as a sorted distinct array with unhinted-success cursors", () => {
    expect(hydrationSql).toContain("alter table public.user_skill_mastery");
    expect(hydrationSql).toContain(
      "add column unique_exercise_ids uuid[] not null default '{}'",
    );
    expect(hydrationSql).toContain(
      "add column first_unhinted_success_at timestamptz",
    );
    expect(hydrationSql).toContain(
      "add column latest_unhinted_success_at timestamptz",
    );
    expect(hydrationSql).toContain(
      "distinct exercise_attempts.exercise_id\n        order by exercise_attempts.exercise_id",
    );
    expect(hydrationSql).toContain("filter (where exercise_attempts.completed)");
    expect(hydrationSql).toContain(
      "and exercise_attempts.hint_level_used = 0",
    );
  });

  it("adds and backfills the review hydration columns with NOT NULL and range constraints", () => {
    expect(hydrationSql).toContain("alter table public.user_review_items");
    expect(hydrationSql).toContain("add column mastery_level smallint");
    expect(hydrationSql).toContain(
      "add column last_performance_quality smallint",
    );
    expect(hydrationSql).toContain("add column last_attempt_at timestamptz");
    expect(hydrationSql).toContain("alter column mastery_level set not null");
    expect(hydrationSql).toContain(
      "alter column last_performance_quality set not null",
    );
    expect(hydrationSql).toContain("alter column last_attempt_at set not null");
    expect(hydrationSql).toContain("check (mastery_level between 0 and 5)");
    expect(hydrationSql).toContain(
      "check (last_performance_quality between 0 and 5)",
    );
    expect(hydrationSql).toContain("coalesce(mastery.mastery_level, 0)");
    expect(hydrationSql).toContain(
      "coalesce(\n      latest_attempt.completed_at,\n      latest_attempt.started_at,\n      review.updated_at\n    )",
    );
  });

  it("creates the three stable pagination cursor indexes with explicit names", () => {
    expect(hydrationSql).toContain(
      "create index if not exists attempts_user_hydration_cursor_idx",
    );
    expect(hydrationSql).toContain(
      "on public.exercise_attempts (\n    user_id,\n    created_at,\n    client_attempt_id\n  )",
    );
    expect(hydrationSql).toContain(
      "create index if not exists mastery_user_hydration_cursor_idx",
    );
    expect(hydrationSql).toContain(
      "on public.user_skill_mastery (\n    user_id,\n    updated_at,\n    skill_id\n  )",
    );
    expect(hydrationSql).toContain(
      "create index if not exists reviews_user_hydration_cursor_idx",
    );
    expect(hydrationSql).toContain(
      "on public.user_review_items (\n    user_id,\n    updated_at,\n    exercise_id\n  )",
    );
  });

  it("replaces record_exercise_attempt with the same signature and security mode", () => {
    expect(hydrationSql).toContain(
      "create or replace function public.record_exercise_attempt(payload jsonb)",
    );
    expect(hydrationSql).toContain("security invoker");
    expect(hydrationSql).toContain("set search_path = ''");
    expect(hydrationSql).toContain(
      "on conflict (user_id, client_attempt_id) do nothing",
    );
  });

  it("has a pgTAP hydration test that plans, isolates users by RLS, and rolls back", () => {
    expect(hydrationTestSql).toContain("begin;");
    expect(hydrationTestSql).toContain("select plan(");
    expect(hydrationTestSql).toContain("record_exercise_attempt");
    expect(hydrationTestSql).toContain("performance_quality");
    expect(hydrationTestSql).toContain("unique_exercise_ids");
    expect(hydrationTestSql).toContain("first_unhinted_success_at");
    expect(hydrationTestSql).toContain("mastery_level");
    expect(hydrationTestSql).toContain("last_performance_quality");
    expect(hydrationTestSql).toContain("attempts_user_hydration_cursor_idx");
    expect(hydrationTestSql).toContain("mastery_user_hydration_cursor_idx");
    expect(hydrationTestSql).toContain("reviews_user_hydration_cursor_idx");
    expect(hydrationTestSql).toContain("set local role authenticated");
    expect(hydrationTestSql).toContain("select * from finish()");
    expect(hydrationTestSql).toContain("rollback");
  });
});
