import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migrationSql = readProjectFile(
  "supabase/migrations/20260719163028_add_exercise_display_order.sql",
);

describe("exercises.display_order migration", () => {
  it("adds a non-nullable, non-negative display_order column", () => {
    expect(migrationSql).toContain(
      "add column display_order smallint not null default 0",
    );
    expect(migrationSql).toContain("check (display_order >= 0)");
  });

  it("backfills existing rows deterministically, partitioned by unit, using the slug numeric suffix then slug", () => {
    expect(migrationSql).toContain("update public.exercises e");
    expect(migrationSql).toContain("row_number() over");
    expect(migrationSql).toContain("partition by unit_id");
    expect(migrationSql).toMatch(
      /when slug ~ '-\[0-9\]\+\$' then \(regexp_match\(slug, '\(\[0-9\]\+\)\$'\)\)\[1\]::integer/,
    );
    expect(migrationSql).toContain("set display_order = ordered.computed_display_order");
  });

  it("indexes exercises by unit and display order", () => {
    expect(migrationSql).toContain(
      "create index exercises_unit_display_order_idx",
    );
    expect(migrationSql).toContain("on public.exercises (unit_id, display_order)");
  });
});
