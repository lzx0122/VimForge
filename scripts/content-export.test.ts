import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { hashCatalog, type CatalogSnapshot } from "../src/content/catalog-contract";
import {
  runSupabase,
  SUPABASE_CLI_VERSION,
} from "../src/content/supabase-cli-runner";
import { exportProductionCatalog } from "./content-export-production";

describe("production catalog export", () => {
  it("rejects output that does not identify the expected linked project or release state", async () => {
    const run = vi.fn(async () => JSON.stringify({ projectRef: "other-project" }));

    await expect(exportProductionCatalog({
      expectedProjectRef: "expected-project",
      expectedRevision: 1,
      expectedHash: "sha256:" + "0".repeat(64),
      runSupabase: run,
      outputDirectory: "/tmp/vimforge-export-test",
    })).rejects.toThrow(/project|release/i);
    expect(run).toHaveBeenCalled();
  });

  it("requires a releaseState object instead of falling back to snapshot metadata", async () => {
    const run = vi.fn(async () => JSON.stringify({
      projectRef: "expected-project",
      catalogRevision: 1,
      catalogHash: "sha256:" + "0".repeat(64),
      snapshot: { schemaVersion: 1, units: [] },
    }));

    await expect(exportProductionCatalog({
      expectedProjectRef: "expected-project",
      expectedRevision: 1,
      expectedHash: "sha256:" + "0".repeat(64),
      runSupabase: run,
    })).rejects.toThrow(/release state/i);
  });

  it("orders production units numerically before hashing the snapshot", async () => {
    const base = JSON.parse(readFileSync(resolve(process.cwd(), "content/catalog.json"), "utf8")) as CatalogSnapshot;
    const unsortedUnits = [...base.units].sort((left, right) => right.displayOrder - left.displayOrder);
    const run = vi.fn(async () => JSON.stringify({
      projectRef: "expected-project",
      releaseState: {
        revision: base.catalogRevision,
        catalog_hash: base.catalogHash,
      },
      snapshot: { schemaVersion: 1, units: unsortedUnits },
    }));

    const result = await exportProductionCatalog({
      expectedProjectRef: "expected-project",
      expectedRevision: base.catalogRevision,
      expectedHash: base.catalogHash,
      runSupabase: run,
      outputDirectory: mkdtempSync(resolve(tmpdir(), "vimforge-export-")),
    });

    expect(result.snapshot.catalogHash).toBe(hashCatalog(base));
    expect(result.snapshot.units.map((unit) => unit.displayOrder)).toEqual(
      [...base.units].sort((left, right) => left.displayOrder - right.displayOrder).map((unit) => unit.displayOrder),
    );
  });

  it("requires the expected production project ref before querying", async () => {
    const run = vi.fn(async () => "{}");

    await expect(exportProductionCatalog({
      expectedRevision: 1,
      expectedHash: "sha256:" + "0".repeat(64),
      runSupabase: run,
    })).rejects.toThrow(/project ref/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the CLI through the injectable runner without exposing command output", async () => {
    const runner = vi.fn(async (_command: string, args: readonly string[]) => ({
      stdout: args.join(" "),
      stderr: "",
      exitCode: 0,
    }));

    await expect(runSupabase(["status", "--linked"], { runner })).resolves.toContain("status --linked");
    expect(runner).toHaveBeenCalledWith(
      "npx",
      ["--no-install", `supabase@${SUPABASE_CLI_VERSION}`, "status", "--linked"],
      expect.objectContaining({}),
    );
  });
});
