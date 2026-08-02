import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { parseCatalogSnapshot, type CatalogUnit } from "../src/content/catalog-contract";
import { materializeCatalogReleaseSnapshot } from "../src/content/catalog-release-materializer";
import { pendingFromDryRun, publishProduction, type PublishProductionInput } from "./content-publish-production";

const base = parseCatalogSnapshot(JSON.parse(readFileSync("content/catalog.json", "utf8")) as unknown);
// The authoring target is unchanged from base in this fixture; the true
// post-release hash still differs from base's own hash because the revision
// advances.
const materialized = materializeCatalogReleaseSnapshot(base, base);
const materializedTargetHash = materialized.catalogHash;
const migrationSql = "begin;\ncommit;\n";
const migrationPath = "supabase/migrations/20260717000000_catalog_release.sql";
const targetPath = "content/catalog.json";

interface RunSupabaseOptions {
  /** Rows the mocked full production export query returns; defaults to the correctly materialized rows. */
  exportUnits?: CatalogUnit[];
  /** What the mocked private.catalog_release_state query reports; defaults to the correct target revision/hash. */
  releaseState?: { revision: number; catalog_hash: string };
  onPush?: () => void;
}

/**
 * A mocked Supabase CLI that answers every call `publishProduction` makes:
 * the migration push, the release-state query, and (per P1-2) the full
 * production-row export query used to verify actual catalog data, not just
 * the release-state table. Defaults simulate a correctly applied release;
 * pass `exportUnits`/`releaseState` to simulate a release-state/actual-rows
 * mismatch.
 */
function makeRunSupabase(options: RunSupabaseOptions = {}) {
  const releaseState = options.releaseState ?? { revision: base.catalogRevision + 1, catalog_hash: materializedTargetHash };
  const exportUnits = options.exportUnits ?? materialized.units;
  return vi.fn(async (args: readonly string[]) => {
    if (args.includes("push")) {
      options.onPush?.();
      return "";
    }
    if (args.includes("--help")) {
      return "Usage: supabase db query [flags]\n  --linked\n  --output string";
    }
    // The full production export query selects from unit_payload; the
    // release-state query does not. Distinguish them by that marker rather
    // than by call order, since either may be invoked independently.
    if (args.some((value) => value.includes("unit_payload"))) {
      return JSON.stringify({
        catalog_export: {
          releaseState,
          snapshot: { schemaVersion: 1, units: exportUnits },
        },
      });
    }
    if (args.includes("query")) {
      return JSON.stringify({ release_state: releaseState });
    }
    return "";
  });
}

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
      targetHash: materializedTargetHash,
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
    const run = makeRunSupabase();
    const result = await publishProduction(input(run));
    expect(result.success).toBe(true);
    expect(run.mock.calls.some(([args]) => args.includes("push") && !args.includes("dry-run"))).toBe(true);
    expect(run.mock.calls.some(([args]) => args.some((value) => value.includes("private.catalog_release_state")))).toBe(true);
  });

  it("P1-2 regression: rejects when release_state matches the manifest but actual production rows canonicalize to a different hash", async () => {
    // Simulate the exact historical failure mode: the release-state table
    // reports the correct manifest revision/hash (as it always does — the
    // migration writes it unconditionally), but the actual exercise rows a
    // real export would return differ (here: missing the last exercise of
    // the last unit), so they canonicalize to a different hash.
    const tamperedUnits = materialized.units.map((unit, index) =>
      index === materialized.units.length - 1
        ? { ...unit, exercises: unit.exercises.slice(0, -1) }
        : unit);
    const run = makeRunSupabase({ exportUnits: tamperedUnits });

    await expect(publishProduction(input(run))).rejects.toThrow(
      /already applied|forward.?fix|actual (production )?(catalog )?rows?/i,
    );
  });

  it("P1-2 green path: migration push, correct release state, and correct full production snapshot together yield success", async () => {
    const run = makeRunSupabase();
    const result = await publishProduction(input(run));

    expect(result.success).toBe(true);
    expect(result.revision).toBe(base.catalogRevision + 1);
    expect(result.hash).toBe(materializedTargetHash);
    expect(run.mock.calls.some(([args]) => args.includes("push") && !args.includes("dry-run"))).toBe(true);
    expect(run.mock.calls.some(([args]) => args.some((value) => value.includes("private.catalog_release_state")))).toBe(true);
    expect(run.mock.calls.some(([args]) => args.some((value) => value.includes("unit_payload")))).toBe(true);
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
    const run = makeRunSupabase();
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
    const run = makeRunSupabase();
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
    const baseRun = makeRunSupabase();
    const run = vi.fn(async (args: readonly string[]) => {
      if (args.includes("--dry-run")) return dryRunOutput;
      return (baseRun as (args: readonly string[]) => Promise<string>)(args);
    });

    await expect(publishProduction({ ...input(run), pendingMigrations: undefined })).resolves.toMatchObject({ success: true });
    expect(run.mock.calls[0]?.[0]).toEqual(["db", "push", "--linked", "--dry-run"]);
  });

  it("verifies release state when db query returns a rows envelope", async () => {
    const run = vi.fn(async (args: readonly string[]) => {
      if (args.includes("push")) return "";
      if (args.includes("--help")) return "Usage: supabase db query [flags]\n  --linked\n  --output string";
      if (args.some((value) => value.includes("unit_payload"))) {
        return JSON.stringify({
          rows: [{
            catalog_export: {
              releaseState: { revision: base.catalogRevision + 1, catalog_hash: materializedTargetHash },
              snapshot: { schemaVersion: 1, units: materialized.units },
            },
          }],
        });
      }
      if (args.includes("query")) {
        return JSON.stringify({ rows: [{ release_state: { revision: base.catalogRevision + 1, catalog_hash: materializedTargetHash } }] });
      }
      return "";
    });

    await expect(publishProduction(input(run))).resolves.toMatchObject({ success: true });
  });
});
