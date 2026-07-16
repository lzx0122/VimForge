import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateSeedSql } from "./validate-seed";

const seedSql = readFileSync(
  resolve(process.cwd(), "supabase/seed.sql"),
  "utf8",
);
const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716000100_create_catalog.sql",
  ),
  "utf8",
);

function replaceOnce(source: string, search: string, replacement: string) {
  const result = source.replace(search, replacement);
  expect(result).not.toBe(source);
  return result;
}

describe("catalog migration", () => {
  it("creates every catalog table with indexes and row-level security", () => {
    const tables = [
      "learning_units",
      "skills",
      "unit_skills",
      "exercises",
      "exercise_skills",
      "exercise_solutions",
      "exercise_hints",
    ];

    for (const table of tables) {
      expect(migrationSql).toContain(`create table public.${table}`);
      expect(migrationSql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migrationSql).toContain(`create policy "${table}_read_published"`);
    }

    expect(migrationSql.match(/create (unique )?index /g)?.length).toBeGreaterThanOrEqual(
      10,
    );
    expect(migrationSql).toContain("supported_modes <@");
    expect(migrationSql).toContain("weight > 0 and weight <= 1");
    expect(migrationSql).toContain("level between 1 and 4");
    expect(migrationSql).toContain("skills.id = unit_skills.skill_id");
  });
});

describe("seed validator", () => {
  it("accepts the complete published catalog", () => {
    const result = validateSeedSql(seedSql);

    expect(result.errors).toEqual([]);
    expect(result.summary).toEqual({
      publishedUnitCount: 10,
      publishedExerciseCount: 100,
      languageCounts: {
        csharp: 60,
        javascript: 10,
        typescript: 10,
        other: 20,
      },
    });
  });

  it("rejects skill weights that do not sum to one", () => {
    const invalidSql = replaceOnce(
      seedSql,
      '"weight": 1',
      '"weight": 0.5',
    );

    expect(validateSeedSql(invalidSql).errors).toContain(
      "Unit mode-switching-basic-editing skill weights must sum to 1.",
    );
  });

  it("requires a recommended solution and unique hint levels", () => {
    const missingSolution = replaceOnce(
      seedSql,
      '"recommended": true',
      '"recommended": false',
    );
    const duplicateHint = replaceOnce(
      seedSql,
      '"level": 2',
      '"level": 1',
    );

    expect(validateSeedSql(missingSolution).errors).toContain(
      "Unit mode-switching-basic-editing requires a recommended solution.",
    );
    expect(validateSeedSql(duplicateHint).errors).toContain(
      "Unit mode-switching-basic-editing hint levels must be unique.",
    );
  });

  it("rejects invalid supported modes and out-of-range cursors", () => {
    const invalidMode = replaceOnce(
      seedSql,
      '"supportedModes": ["beginner", "memory_review"]',
      '"supportedModes": ["unsupported"]',
    );
    const invalidCursor = replaceOnce(
      seedSql,
      '"initialCursor": { "line": 0, "column": 13 }',
      '"initialCursor": { "line": 0, "column": 999 }',
    );

    expect(validateSeedSql(invalidMode).errors).toContain(
      "Unit mode-switching-basic-editing contains an invalid supported mode.",
    );
    expect(validateSeedSql(invalidCursor).errors).toContain(
      "Unit mode-switching-basic-editing has an invalid initial cursor.",
    );
  });

  it("reports malformed catalog records without throwing", () => {
    const invalidSql = replaceOnce(
      seedSql,
      '"initialContent": "public class Demo{{n}} { }"',
      '"initialContentBroken": "public class Demo{{n}} { }"',
    );

    expect(() => validateSeedSql(invalidSql)).not.toThrow();
    expect(validateSeedSql(invalidSql).errors).toContain(
      "Seed catalog contains an invalid unit record.",
    );
  });
});
