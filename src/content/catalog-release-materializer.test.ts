import { describe, expect, it } from "vitest";

import { materializeCatalogReleaseSnapshot } from "./catalog-release-materializer";
import { hashCatalog, type CatalogExercise, type CatalogSnapshot } from "./catalog-contract";

function exercise(slug: string, expectedContent = "before"): CatalogExercise {
  return {
    slug,
    title: slug,
    instruction: "Edit the target",
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
    displayOrder: 1,
    skills: [{ skillSlug: "movement", weight: 1, primary: true }],
    solutions: [{
      sequence: "i",
      normalizedActions: [{ type: "vim_command", command: "i" }],
      keystrokeCount: 1,
      recommended: true,
      explanation: "Type the target.",
    }],
    hints: [1, 2, 3, 4].map((level) => ({ level: level as 1 | 2 | 3 | 4, content: `Hint ${level}`, commandPreview: null })),
  };
}

function snapshot(
  exercises: CatalogExercise[],
  revision = 1,
  unitSlug = "unit",
  additionalUnits: Array<{ slug: string; exercises: CatalogExercise[]; skillSlug?: string; displayOrder?: number }> = [],
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
        skills: [{ slug: "movement", name: "Movement", description: "Move", category: "movement", difficulty: "beginner" }],
        exercises,
      },
      ...additionalUnits.map((unit) => ({
        slug: unit.slug,
        title: unit.slug,
        description: "A unit",
        difficulty: "beginner" as const,
        estimatedMinutes: 5,
        displayOrder: unit.displayOrder ?? 2,
        isPublished: true,
        skills: [{ slug: unit.skillSlug ?? `${unit.slug}-movement`, name: "Movement", description: "Move", category: "movement" as const, difficulty: "beginner" as const }],
        exercises: unit.exercises,
      })),
    ],
  };
  return { ...draft, catalogHash: hashCatalog(draft) };
}

function exercisesIn(result: CatalogSnapshot, unitSlug: string): CatalogExercise[] {
  const unit = result.units.find((candidate) => candidate.slug === unitSlug);
  if (!unit) throw new Error(`expected unit ${unitSlug}`);
  return unit.exercises;
}

describe("materializeCatalogReleaseSnapshot", () => {
  it("advances catalogRevision to base + 1", () => {
    const base = snapshot([exercise("keep")], 5);
    const authoringTarget = snapshot([exercise("keep")], 5);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    expect(result.catalogRevision).toBe(6);
  });

  it("recomputes catalogHash from the materialized snapshot, independent of exportedAt", () => {
    const base = snapshot([exercise("keep")]);
    const authoringTarget = snapshot([exercise("keep")]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);
    const resultWithDifferentExportedAt = { ...result, exportedAt: "2099-01-01T00:00:00.000Z" };

    expect(result.catalogHash).toBe(hashCatalog(result));
    expect(hashCatalog(resultWithDifferentExportedAt)).toBe(result.catalogHash);
  });

  it("uses target content and bumps version once for a content-owned change", () => {
    const base = snapshot([exercise("changed", "before")]);
    // Tamper the target's own version field; it must be ignored.
    const authoringTarget = snapshot([{ ...exercise("changed", "after"), version: 99 }]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    const materialized = exercisesIn(result, "unit").find((item) => item.slug === "changed");
    expect(materialized).toMatchObject({ expectedContent: "after", version: 2 });
  });

  it("keeps the base version for a metadata-only publication/displayOrder change", () => {
    const base = snapshot([exercise("meta")]);
    const authoringTarget = snapshot([{ ...exercise("meta"), isPublished: false, displayOrder: 9 }]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    const materialized = exercisesIn(result, "unit").find((item) => item.slug === "meta");
    expect(materialized).toMatchObject({ isPublished: false, displayOrder: 9, version: 1 });
  });

  it("keeps the base version for an unchanged exercise even if the target's own version field is tampered", () => {
    const base = snapshot([exercise("same")]);
    const authoringTarget = snapshot([{ ...exercise("same"), version: 42 }]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    const materialized = exercisesIn(result, "unit").find((item) => item.slug === "same");
    expect(materialized?.version).toBe(1);
  });

  it("assigns version 1 to a newly added exercise", () => {
    const base = snapshot([exercise("keep")]);
    const authoringTarget = snapshot([exercise("keep"), exercise("new")]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    const materialized = exercisesIn(result, "unit").find((item) => item.slug === "new");
    expect(materialized?.version).toBe(1);
  });

  it("retains a removed exercise in production as unpublished with its historical content and version", () => {
    const removedFromBase = { ...exercise("gone", "original"), version: 3 };
    const base = snapshot([exercise("keep"), removedFromBase]);
    const authoringTarget = snapshot([exercise("keep")]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    const materialized = exercisesIn(result, "unit").find((item) => item.slug === "gone");
    expect(materialized).toMatchObject({
      expectedContent: "original",
      version: 3,
      isPublished: false,
    });
  });

  it("keeps a retained-but-removed exercise in its original unit", () => {
    const withUnitBSkill = (item: CatalogExercise) => ({ ...item, skills: [{ skillSlug: "unit-b-movement", weight: 1, primary: true }] });
    const removed = withUnitBSkill(exercise("gone-from-a"));
    const anchorB = withUnitBSkill(exercise("anchor-b"));
    const base = snapshot([exercise("anchor")], 1, "unit-a", [{ slug: "unit-b", exercises: [removed, anchorB] }]);
    const authoringTarget = snapshot([exercise("anchor")], 1, "unit-a", [{ slug: "unit-b", exercises: [anchorB] }]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    expect(exercisesIn(result, "unit-b").map((item) => item.slug)).toContain("gone-from-a");
    expect(exercisesIn(result, "unit-a").map((item) => item.slug)).not.toContain("gone-from-a");
  });

  it("orders units by displayOrder and exercises by displayOrder then slug, regardless of input order", () => {
    // "unit-early" is the primary unit (displayOrder 1 by default); "unit-late"
    // is an additional unit (displayOrder 2 by default) whose exercises are
    // deliberately listed out of displayOrder order.
    const withUnitLateSkill = (item: CatalogExercise) => ({ ...item, skills: [{ skillSlug: "unit-late-movement", weight: 1, primary: true }] });
    const unitLateExercises = [
      { ...withUnitLateSkill(exercise("b")), displayOrder: 2 },
      { ...withUnitLateSkill(exercise("a")), displayOrder: 1 },
    ];
    const base = snapshot([exercise("only")], 1, "unit-early", [{ slug: "unit-late", exercises: unitLateExercises }]);
    const authoringTarget = snapshot([exercise("only")], 1, "unit-early", [{ slug: "unit-late", exercises: unitLateExercises }]);

    const result = materializeCatalogReleaseSnapshot(base, authoringTarget);

    expect(result.units.map((unit) => unit.slug)).toEqual(["unit-early", "unit-late"]);
    expect(exercisesIn(result, "unit-late").map((item) => item.slug)).toEqual(["a", "b"]);
  });
});
