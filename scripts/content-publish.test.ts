import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { hashCatalog, parseCatalogSnapshot } from "../src/content/catalog-contract";
import { pendingFromDryRun, publishProduction, type PublishProductionInput } from "./content-publish-production";

const base = parseCatalogSnapshot(JSON.parse(readFileSync("content/catalog.json", "utf8")) as unknown);
const migrationSql = "begin;\ncommit;\n";
const migrationPath = "supabase/migrations/20260717000000_catalog_release.sql";
const targetPath = "content/catalog.json";

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
      targetPath,
      baseRevision: base.catalogRevision,
      targetRevision: base.catalogRevision + 1,
      targetHash: hashCatalog(base),
      migrationPath,
      migrationHash: `sha256:${createHash("sha256").update(migrationSql).digest("hex")}`,
      counts: { added: 0, changed: 0, unpublished: 0, unchanged: base.units.reduce((count, unit) => count + unit.exercises.length, 0) },
    },
    runSupabase,
    finalConfirmation: "PUBLISH",
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
    expect(run.mock.calls.some(([args]) => args.some((value) => value.includes("private.catalog_release_state")))).toBe(true);
  });

  it("returns a safe error when db push fails without exposing CLI output", async () => {
    const run = vi.fn(async (args: readonly string[]) => {
      if (args.includes("push")) throw new Error("password=secret raw database details");
      return "";
    });
    await expect(publishProduction(input(run))).rejects.toThrow(/safe|publish failed|not applied/i);
    await expect(publishProduction(input(run))).rejects.not.toThrow(/secret|raw database/i);
  });

  it("prints counts and requires a separate final confirmation before db push", async () => {
    const run = vi.fn(async (args: readonly string[]) => args.includes("query")
      ? JSON.stringify({ release_state: { revision: base.catalogRevision + 1, catalog_hash: hashCatalog(base) } })
      : "");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await expect(publishProduction({ ...input(run), finalConfirmation: "NO" })).rejects.toThrow(/PUBLISH/);
      expect(run.mock.calls.some(([args]) => args.includes("db") && args.includes("push") && !args.includes("dry-run"))).toBe(false);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("added 0, changed 0, unpublished 0, unchanged"));
    } finally {
      log.mockRestore();
    }
  });

  it("asks for project-ref confirmation and then a distinct final confirmation", async () => {
    const run = vi.fn(async (args: readonly string[]) => args.includes("query")
      ? JSON.stringify({ release_state: { revision: base.catalogRevision + 1, catalog_hash: hashCatalog(base) } })
      : "");
    const prompt = vi.fn(async (question: string) => question.includes("PUBLISH") ? "PUBLISH" : "prod-ref");
    const result = await publishProduction({
      ...input(run),
      typedProjectRef: undefined,
      finalConfirmation: undefined,
      prompt,
    });

    expect(result.success).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt.mock.calls[1]?.[0]).toMatch(/PUBLISH/);
  });

  it("uses the standard dry-run output when discovering pending migrations", async () => {
    const dryRunOutput = `DRY RUN: migrations will *not* be pushed to the database.\nWould push these migrations:\n • ${migrationPath.split("/").pop()}`;
    expect(pendingFromDryRun(dryRunOutput)).toEqual([migrationPath.split("/").pop()]);
    const run = vi.fn(async (args: readonly string[]) => {
      if (args.includes("--dry-run")) return dryRunOutput;
      if (args.includes("query")) return JSON.stringify({ release_state: { revision: base.catalogRevision + 1, catalog_hash: hashCatalog(base) } });
      return "";
    });

    await expect(publishProduction({ ...input(run), pendingMigrations: undefined })).resolves.toMatchObject({ success: true });
    expect(run.mock.calls[0]?.[0]).toEqual(["db", "push", "--linked", "--dry-run"]);
  });

  it("verifies release state when db query returns a rows envelope", async () => {
    const run = vi.fn(async (args: readonly string[]) => args.includes("query")
      ? JSON.stringify({ rows: [{ release_state: { revision: base.catalogRevision + 1, catalog_hash: hashCatalog(base) } }] })
      : "");

    await expect(publishProduction(input(run))).resolves.toMatchObject({ success: true });
  });
});
