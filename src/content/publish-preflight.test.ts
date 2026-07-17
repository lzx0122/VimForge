import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { hashCatalog, parseCatalogSnapshot, type CatalogSnapshot } from "./catalog-contract";
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
      baseRevision: base.catalogRevision,
      targetRevision: base.catalogRevision + 1,
      targetHash: hashCatalog(target),
      migrationPath: "supabase/migrations/20260717000000_catalog_release.sql",
      migrationHash: `sha256:${createHash("sha256").update(migrationSql).digest("hex")}`,
      counts: { added: 0, changed: 0, unpublished: 0, unchanged: base.units.reduce((count, unit) => count + unit.exercises.length, 0) },
    },
    confirmLargeChange: true,
    ...overrides,
  };
}

describe("production publish preflight", () => {
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
