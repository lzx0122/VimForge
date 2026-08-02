import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { hashCatalog, type CatalogExercise, type CatalogSnapshot, parseCatalogSnapshot } from "./catalog-contract";
import { materializeCatalogReleaseSnapshot } from "./catalog-release-materializer";
import { preflightProductionPublish, type PublishInput } from "./publish-preflight";

const base = parseCatalogSnapshot(JSON.parse(readFileSync("content/catalog.json", "utf8")) as unknown);

function input(overrides: Partial<PublishInput> = {}): PublishInput {
  const target: CatalogSnapshot = {
    ...base,
    exportedAt: "2026-07-17T00:00:00.000Z",
  };
  const migrationSql = "begin; -- catalog release\ncommit;\n";
  return {
    expectedProjectRef: "prod-ref",
    linkedProjectRef: "prod-ref",
    typedProjectRef: "prod-ref",
    baseSnapshot: base,
    targetSnapshot: target,
    migrationPath: "supabase/migrations/20260717000000_catalog_release.sql",
    migrationSql,
    pendingMigrations: ["20260717000000_catalog_release.sql"],
    manifest: {
      targetPath: "content/catalog.json",
      baseRevision: base.catalogRevision,
      targetRevision: base.catalogRevision + 1,
      targetHash: hashCatalog(materializeCatalogReleaseSnapshot(base, target)),
      migrationPath: "supabase/migrations/20260717000000_catalog_release.sql",
      migrationHash: `sha256:${createHash("sha256").update(migrationSql).digest("hex")}`,
      counts: { added: 0, changed: 0, unpublished: 0, unchanged: base.units.reduce((count, unit) => count + unit.exercises.length, 0) },
    },
    confirmLargeChange: true,
    ...overrides,
  };
}

describe("production publish preflight", () => {
  it("accepts a manifest hash that matches the materialized post-release snapshot", () => {
    expect(() => preflightProductionPublish(input())).not.toThrow();
  });

  it("rejects a manifest that reuses the pre-release authoring snapshot's own hash", () => {
    const target: CatalogSnapshot = { ...base, exportedAt: "2026-07-17T00:00:00.000Z" };
    const staleManifestInput = input({
      manifest: { ...input().manifest, targetHash: hashCatalog(target) },
    });
    expect(() => preflightProductionPublish(staleManifestInput)).toThrow(/target hash/i);
  });

  it("rejects a linked project mismatch", () => {
    expect(() => preflightProductionPublish(input({ linkedProjectRef: "other-ref" }))).toThrow(/project/i);
  });

  it("rejects stale base revision", () => {
    expect(() => preflightProductionPublish(input({ manifest: { ...input().manifest, baseRevision: base.catalogRevision + 1 } }))).toThrow(/revision/i);
  });

  it("rejects an unrelated pending migration", () => {
    expect(() => preflightProductionPublish(input({ pendingMigrations: ["20260717000000_catalog_release.sql", "20260716000000_unrelated.sql"] }))).toThrow(/pending|unrelated/i);
  });

  it("rejects a missing migration hash", () => {
    expect(() => preflightProductionPublish(input({ manifest: { ...input().manifest, migrationHash: "" } }))).toThrow(/migration hash/i);
  });

  it("P1 defense in depth: rejects a hand-crafted manifest for a release whose materialized catalog is invalid, regardless of the claimed hash", () => {
    function minimalExercise(slug: string, skillSlug: string): CatalogExercise {
      return {
        slug,
        title: slug,
        instruction: "Edit the target",
        language: "plaintext",
        exerciseType: "challenge",
        difficulty: "beginner",
        initialContent: "before",
        expectedContent: "after",
        initialCursor: { line: 0, column: 0 },
        completionRule: { contentMatch: "exact", cursorMatch: { type: "ignore" } },
        supportedModes: ["beginner"],
        targetDurationMs: 1_000,
        version: 1,
        isPublished: true,
        displayOrder: 1,
        skills: [{ skillSlug, weight: 1, primary: true }],
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
    function minimalSnapshot(exercises: CatalogExercise[], skills: CatalogSnapshot["units"][number]["skills"]): CatalogSnapshot {
      const draft: CatalogSnapshot = {
        schemaVersion: 1,
        catalogRevision: 1,
        catalogHash: "sha256:" + "0".repeat(64),
        exportedAt: "2026-07-17T00:00:00.000Z",
        units: [{
          slug: "unit-a",
          title: "Unit A",
          description: "A unit",
          difficulty: "beginner",
          estimatedMinutes: 5,
          displayOrder: 1,
          isPublished: true,
          skills,
          exercises,
        }],
      };
      return { ...draft, catalogHash: hashCatalog(draft) };
    }
    const movementSkill = { slug: "movement", name: "Movement", description: "Move", category: "movement" as const, difficulty: "beginner" as const };
    const searchSkill = { slug: "search", name: "Search", description: "Search", category: "search" as const, difficulty: "beginner" as const };
    const invalidBase = minimalSnapshot(
      [minimalExercise("kept", "movement"), minimalExercise("exercise-old", "search")],
      [movementSkill, searchSkill],
    );
    const invalidTarget = minimalSnapshot([minimalExercise("kept", "movement")], [movementSkill]);
    const migrationSql = "begin; -- catalog release\ncommit;\n";
    // An attacker (or a bug) could claim any hash here — the fabricated
    // "0".repeat(64) below stands in for "some hash the operator can't
    // actually produce, because materialization itself fails first".
    const claimedHash = `sha256:${"0".repeat(64)}`;

    expect(() => preflightProductionPublish({
      expectedProjectRef: "prod-ref",
      linkedProjectRef: "prod-ref",
      typedProjectRef: "prod-ref",
      baseSnapshot: invalidBase,
      targetSnapshot: invalidTarget,
      migrationPath: "supabase/migrations/20260717000000_catalog_release.sql",
      migrationSql,
      pendingMigrations: ["20260717000000_catalog_release.sql"],
      manifest: {
        targetPath: "catalog-target-invalid.json",
        baseRevision: invalidBase.catalogRevision,
        targetRevision: invalidBase.catalogRevision + 1,
        targetHash: claimedHash,
        migrationPath: "supabase/migrations/20260717000000_catalog_release.sql",
        migrationHash: `sha256:${createHash("sha256").update(migrationSql).digest("hex")}`,
        counts: { added: 0, changed: 0, unpublished: 1, unchanged: 1 },
      },
      confirmLargeChange: true,
    })).toThrow(/materialized post-release catalog is invalid/i);
  });

  it("requires confirmation for a large change", () => {
    const exerciseCount = base.units.reduce((count, unit) => count + unit.exercises.length, 0);
    if (exerciseCount < 4) throw new Error("catalog fixture is too small");
    let changedCount = 0;
    const target = {
      ...base,
      units: base.units.map((unit) => ({ ...unit, exercises: unit.exercises.map((exercise) => {
        if (changedCount++ < Math.ceil(exerciseCount * 0.3)) return { ...exercise, expectedContent: `${exercise.expectedContent}!` };
        return exercise;
      }) })),
    };
    const modified = input({ targetSnapshot: { ...target, catalogHash: hashCatalog(target) }, confirmLargeChange: false });
    expect(() => preflightProductionPublish(modified)).toThrow(/25|large|confirm/i);
  });
});
