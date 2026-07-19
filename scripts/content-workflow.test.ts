import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hashCatalog,
  parseCatalogSnapshot,
  type CatalogSnapshot,
} from "../src/content/catalog-contract";
import { diffCatalogFiles } from "./content-diff";
import { prepareRelease } from "./content-prepare-release";
import { publishProduction } from "./content-publish-production";
import { validateCatalogFile } from "./content-validate";

const base = parseCatalogSnapshot(
  JSON.parse(readFileSync("content/catalog.json", "utf8")) as unknown,
);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function writeSnapshot(path: string, snapshot: CatalogSnapshot): void {
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function modifiedSnapshot(): CatalogSnapshot {
  const target = structuredClone(base);
  const firstUnit = target.units[0];
  const firstExercise = firstUnit?.exercises[0];
  const lastUnit = target.units.at(-1);
  if (firstUnit === undefined || firstExercise === undefined || lastUnit === undefined) {
    throw new Error("The catalog fixture must contain exercises in at least two units.");
  }

  firstUnit.exercises[0] = {
    ...firstExercise,
    expectedContent: `${firstExercise.expectedContent} // approved`,
  };
  firstUnit.exercises.push({
    ...firstExercise,
    slug: "mode-switching-chatgpt-added",
    title: "ChatGPT-added exercise",
    instruction: "Apply the requested edit using a mode switch.",
    displayOrder: firstUnit.exercises.length + 1,
  });
  lastUnit.exercises.pop();
  target.catalogHash = hashCatalog(target);
  return target;
}

describe("mocked catalog file workflow", () => {
  it("validates, diffs, and prepares a release without publishing before confirmation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "vimforge-content-workflow-"));
    temporaryDirectories.push(directory);
    const basePath = join(directory, "catalog-base.json");
    const modifiedPath = join(directory, "catalog-modified.json");
    const migrationDirectory = join(directory, "migrations");
    const manifestPath = join(directory, "release-manifest.json");
    writeSnapshot(basePath, base);
    writeSnapshot(modifiedPath, modifiedSnapshot());

    expect(validateCatalogFile(basePath).valid).toBe(true);
    expect(validateCatalogFile(modifiedPath).valid).toBe(true);

    const fileDiff = diffCatalogFiles(basePath, modifiedPath);
    expect(fileDiff.diff).toEqual(expect.objectContaining({
      added: expect.arrayContaining([
        expect.objectContaining({ slug: "mode-switching-chatgpt-added" }),
      ]),
      changed: expect.arrayContaining([
        expect.objectContaining({ slug: base.units[0]?.exercises[0]?.slug }),
      ]),
      removed: expect.arrayContaining([
        expect.objectContaining({ slug: base.units.at(-1)?.exercises.at(-1)?.slug }),
      ]),
    }));
    expect(fileDiff.diff.added).toHaveLength(1);
    expect(fileDiff.diff.changed).toHaveLength(1);
    expect(fileDiff.diff.removed).toHaveLength(1);

    const prepared = prepareRelease({
      targetPath: modifiedPath,
      basePath,
      migrationDirectory,
      manifestPath,
      now: () => new Date("2026-07-17T01:02:03.000Z"),
    });
    expect(prepared.manifest.counts).toEqual({
      added: 1,
      changed: 1,
      unpublished: 1,
      unchanged: 98,
    });
    expect(prepared.migrationPath).toMatch(/20260717010203_catalog_release\.sql$/u);
    expect(readFileSync(resolve(process.cwd(), prepared.migrationPath), "utf8")).toContain(
      "catalog_release",
    );

    const runSupabase = vi.fn(async (args: readonly string[]) => {
      if (args.includes("query")) {
        return JSON.stringify({
          release_state: {
            revision: prepared.manifest.targetRevision,
            catalog_hash: prepared.manifest.targetHash,
          },
        });
      }
      return "";
    });
    const publishInput = {
      expectedProjectRef: "production-ref",
      linkedProjectRef: "production-ref",
      typedProjectRef: "production-ref",
      pendingMigrations: [prepared.manifest.migrationPath],
      baseSnapshot: base,
      targetSnapshot: fileDiff.next,
      manifest: prepared.manifest,
      migrationPath: prepared.manifest.migrationPath,
      migrationSql: readFileSync(resolve(process.cwd(), prepared.migrationPath), "utf8"),
      runSupabase,
    };

    await expect(publishProduction({ ...publishInput, finalConfirmation: "NO" })).rejects.toThrow(
      /PUBLISH/u,
    );
    expect(runSupabase).not.toHaveBeenCalled();

    const result = await publishProduction({ ...publishInput, finalConfirmation: "PUBLISH" });
    expect(result).toEqual(expect.objectContaining({
      success: true,
      projectRef: "production-ref",
      revision: prepared.manifest.targetRevision,
      hash: prepared.manifest.targetHash,
    }));
    expect(runSupabase).toHaveBeenCalledWith(["db", "push", "--linked"], undefined);
  });
});
