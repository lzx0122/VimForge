import { describe, expect, it } from "vitest";

import { buildCatalogReleasePlan } from "./catalog-release-plan";
import { escapeSqlString, renderCatalogMigration } from "./catalog-sql";
import { hashCatalog, type CatalogExercise, type CatalogSnapshot } from "./catalog-contract";

function exercise(slug: string, expectedContent = "before"): CatalogExercise {
  return {
    slug,
    title: slug,
    instruction: "Edit Bob's target",
    language: "plaintext",
    exerciseType: "challenge",
    difficulty: "beginner",
    initialContent: "before",
    expectedContent,
    initialCursor: { line: 0, column: 0 },
    completionRule: { contentMatch: "exact", cursorMatch: { type: "ignore" } },
    supportedModes: ["beginner"],
    targetDurationMs: 1_000,
    version: 1,
    isPublished: true,
    skills: [{ skillSlug: "movement", weight: 1, primary: true }],
    solutions: [{
      sequence: "i",
      normalizedActions: [{ type: "vim_command", command: "i" }],
      keystrokeCount: 1,
      recommended: true,
      explanation: "Type Bob's target.",
    }],
    hints: [1, 2, 3, 4].map((level) => ({ level: level as 1 | 2 | 3 | 4, content: `Hint ${level}`, commandPreview: null })),
  };
}

function snapshot(
  exercises: CatalogExercise[],
  revision = 1,
  unitSlug = "unit",
  additionalUnits: Array<{ slug: string; exercises: CatalogExercise[]; skillSlug?: string }> = [],
  unitSkillSlug = "movement",
): CatalogSnapshot {
  const draft: CatalogSnapshot = {
    schemaVersion: 1,
    catalogRevision: revision,
    catalogHash: "sha256:" + "0".repeat(64),
    exportedAt: "2026-07-17T00:00:00.000Z",
    units: [
      {
        slug: unitSlug,
        title: "Unit",
        description: "A unit",
        difficulty: "beginner",
        estimatedMinutes: 5,
        displayOrder: 1,
        isPublished: true,
        skills: [{ slug: unitSkillSlug, name: "Movement", description: "Move", category: "movement", difficulty: "beginner" }],
        exercises,
      },
      ...additionalUnits.map((unit, index) => ({
        slug: unit.slug,
        title: unit.slug,
        description: "A unit",
        difficulty: "beginner" as const,
        estimatedMinutes: 5,
        displayOrder: index + 2,
        isPublished: true,
        skills: [{ slug: unit.skillSlug ?? `${unit.slug}-movement`, name: "Movement", description: "Move", category: "movement" as const, difficulty: "beginner" as const }],
        exercises: unit.exercises,
      })),
    ],
  };
  return { ...draft, catalogHash: hashCatalog(draft) };
}

describe("catalog release planning", () => {
  it("preserves existing slugs, versions changed content once, adds rows, replaces affected children, and unpublishes removals", () => {
    const base = snapshot([exercise("keep"), exercise("change"), exercise("remove")]);
    const next = snapshot([exercise("keep"), { ...exercise("change", "after"), version: 99 }, exercise("new")]);

    const plan = buildCatalogReleasePlan(base, next);

    expect(plan.changed[0]).toMatchObject({ slug: "change", version: 2 });
    expect(plan.targetRevision).toBe(2);
    expect(plan.added[0]).toMatchObject({ slug: "new", version: 1 });
    expect(plan.unpublished[0]).toMatchObject({ slug: "remove", isPublished: false });
    expect(plan.unchanged.map((entry) => entry.slug)).toEqual(["keep"]);
    expect(plan.changed[0]?.replaceChildren).toBe(true);
    expect(plan.unchanged[0]?.replaceChildren).toBe(false);
  });

  it("renders guarded transactional SQL without destructive catalog deletion", () => {
    const base = snapshot([exercise("old")]);
    const next = snapshot([exercise("new")]);
    const sql = renderCatalogMigration(buildCatalogReleasePlan(base, next));

    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(sql).toMatch(/catalog_release_state[\s\S]*for update/i);
    expect(sql).toContain("update public.learning_units set display_order = display_order + 1000;");
    expect(sql).toMatch(/expected.*revision|revision.*expected/i);
    expect(sql.toLowerCase()).not.toContain("truncate");
    expect(sql.toLowerCase()).not.toContain("delete from public.exercises");
    expect(sql).toContain("old");
    expect(sql).toContain("is_published = false");
    expect(sql).toContain("Bob''s target");
    expect(sql).toContain("delete from public.unit_skills");
  });

  it("persists each exercise's displayOrder into public.exercises on insert and upsert", () => {
    const base = snapshot([exercise("filler")]);
    const next = snapshot([
      exercise("filler"),
      { ...exercise("ordered"), displayOrder: 5 },
    ]);
    const sql = renderCatalogMigration(buildCatalogReleasePlan(base, next));

    expect(sql).toContain(
      "insert into public.exercises (unit_id, slug, title, instruction, language, exercise_type, difficulty, initial_content, expected_content, initial_cursor, completion_rule, supported_modes, target_duration_ms, version, is_published, display_order)",
    );
    expect(sql).toMatch(/,\s*true,\s*5\b/);
    expect(sql).toContain("display_order = excluded.display_order");
  });

  it("models publication-only changes without advancing the exercise version or rewriting content", () => {
    const base = snapshot([exercise("visibility")]);
    const next = snapshot([{ ...exercise("visibility"), isPublished: false }]);

    const plan = buildCatalogReleasePlan(base, next);
    expect(plan.changed[0]).toMatchObject({
      slug: "visibility",
      version: 1,
      versionChanged: false,
      replaceChildren: false,
    });
    const sql = renderCatalogMigration(plan);
    expect(sql).toContain("update public.exercises set is_published = false");
    expect(sql).not.toContain("insert into public.exercises");
    expect(sql).not.toContain("delete from public.exercise_skills");
  });

  it("detects a unit move, updates unit_id, and replaces stale child links", () => {
    const movedBefore = { ...exercise("moved"), skills: [{ skillSlug: "unit-a-movement", weight: 1, primary: true }] };
    const movedAfter = { ...exercise("moved"), skills: [{ skillSlug: "unit-b-movement", weight: 1, primary: true }] };
    const anchorA = { ...exercise("anchor-a"), skills: [{ skillSlug: "unit-a-movement", weight: 1, primary: true }] };
    const anchorB = { ...exercise("anchor-b"), skills: [{ skillSlug: "unit-b-movement", weight: 1, primary: true }] };
    const base = snapshot([movedBefore, anchorA], 1, "unit-a", [{ slug: "unit-b", exercises: [anchorB], skillSlug: "unit-b-movement" }], "unit-a-movement");
    const next = snapshot([anchorA], 1, "unit-a", [{ slug: "unit-b", exercises: [movedAfter, anchorB], skillSlug: "unit-b-movement" }], "unit-a-movement");

    const plan = buildCatalogReleasePlan(base, next);
    expect(plan.changed[0]).toMatchObject({
      slug: "moved",
      unitChanged: true,
      version: 2,
      versionChanged: true,
      replaceChildren: true,
    });
    const sql = renderCatalogMigration(plan);
    expect(sql).toContain("unit_id = excluded.unit_id");
    expect(sql).toContain("delete from public.exercise_skills");
    expect(sql).toContain("delete from public.unit_skills");
  });
});

describe("escapeSqlString", () => {
  it("escapes apostrophes and wraps the literal", () => {
    expect(escapeSqlString("Bob's target")).toBe("'Bob''s target'");
  });
});
