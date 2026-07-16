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
});
