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

function snapshot(exercises: CatalogExercise[], revision = 1): CatalogSnapshot {
  const draft: CatalogSnapshot = {
    schemaVersion: 1,
    catalogRevision: revision,
    catalogHash: "sha256:" + "0".repeat(64),
    exportedAt: "2026-07-17T00:00:00.000Z",
    units: [{
      slug: "unit",
      title: "Unit",
      description: "A unit",
      difficulty: "beginner",
      estimatedMinutes: 5,
      displayOrder: 1,
      isPublished: true,
      skills: [{ slug: "movement", name: "Movement", description: "Move", category: "movement", difficulty: "beginner" }],
      exercises,
    }],
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
    expect(sql).toMatch(/expected.*revision|revision.*expected/i);
    expect(sql.toLowerCase()).not.toContain("truncate");
    expect(sql.toLowerCase()).not.toContain("delete from public.exercises");
    expect(sql).toContain("old");
    expect(sql).toContain("is_published = false");
    expect(sql).toContain("Bob''s target");
  });
});

describe("escapeSqlString", () => {
  it("escapes apostrophes and wraps the literal", () => {
    expect(escapeSqlString("Bob's target")).toBe("'Bob''s target'");
  });
});
