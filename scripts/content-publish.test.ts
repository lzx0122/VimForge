import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { hashCatalog, parseCatalogSnapshot } from "../src/content/catalog-contract";
import { publishProduction, type PublishProductionInput } from "./content-publish-production";

const base = parseCatalogSnapshot(JSON.parse(readFileSync("content/catalog.json", "utf8")) as unknown);
const migrationSql = "begin;\ncommit;\n";
const migrationPath = "supabase/migrations/20260717000000_catalog_release.sql";

function input(runSupabase: PublishProductionInput["runSupabase"]): PublishProductionInput {
  return {
    expectedProjectRef: "prod-ref",
    linkedProjectRef: "prod-ref",
    typedProjectRef: "prod-ref",
    pendingMigrations: [migrationPath],
    baseSnapshot: base,
    targetSnapshot: base,
    migrationSql,
    migrationPath,
    manifest: {
      baseRevision: base.catalogRevision,
      targetRevision: base.catalogRevision + 1,
      targetHash: hashCatalog(base),
      migrationPath,
      migrationHash: `sha256:${createHash("sha256").update(migrationSql).digest("hex")}`,
      counts: { added: 0, changed: 0, unpublished: 0, unchanged: base.units.reduce((count, unit) => count + unit.exercises.length, 0) },
    },
    runSupabase,
  };
}

describe("production publisher", () => {
  it("pushes only after preflight and verifies the resulting release state", async () => {
    const run = vi.fn(async (args: readonly string[]) => args.includes("db") && args.includes("query")
      ? JSON.stringify({ release_state: { revision: base.catalogRevision + 1, catalog_hash: hashCatalog(base) } })
      : "");
    const result = await publishProduction(input(run));
    expect(result.success).toBe(true);
    expect(run.mock.calls.some(([args]) => args.includes("push") && !args.includes("dry-run"))).toBe(true);
  });

  it("returns a safe error when db push fails without exposing CLI output", async () => {
    const run = vi.fn(async (args: readonly string[]) => {
      if (args.includes("push")) throw new Error("password=secret raw database details");
      return "";
    });
    await expect(publishProduction(input(run))).rejects.toThrow(/safe|publish failed|not applied/i);
    await expect(publishProduction(input(run))).rejects.not.toThrow(/secret|raw database/i);
  });
});
