import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hashCatalog, parseCatalogSnapshot } from "../src/content/catalog-contract";
import { prepareRelease } from "./content-prepare-release";

const base = parseCatalogSnapshot(JSON.parse(readFileSync("content/catalog.json", "utf8")) as unknown);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("content release preparation", () => {
  it("writes one migration and records the modified target snapshot path in the manifest", () => {
    const directory = mkdtempSync(join(process.cwd(), ".tmp-vimforge-prepare-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "catalog-modified.json");
    const migrationDirectory = join(directory, "migrations");
    const manifestPath = join(directory, "release-manifest.json");
    const target = {
      ...base,
      units: base.units.map((unit, unitIndex) => unitIndex === 0
        ? {
          ...unit,
          exercises: unit.exercises.map((exercise, exerciseIndex) => exerciseIndex === 0
            ? { ...exercise, expectedContent: `${exercise.expectedContent}!` }
            : exercise),
        }
        : unit),
    };
    writeFileSync(targetPath, `${JSON.stringify({ ...target, catalogHash: hashCatalog(target) }, null, 2)}\n`, "utf8");

    const result = prepareRelease({
      targetPath,
      basePath: "content/catalog.json",
      migrationDirectory,
      manifestPath,
      now: () => new Date("2026-07-17T01:02:03.000Z"),
    });
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof result.manifest;

    expect(result.migrationPath).toBe(relative(process.cwd(), resolve(migrationDirectory, "20260717010203_catalog_release.sql")));
    expect(manifest.targetPath).toBe(relative(process.cwd(), resolve(targetPath)));
    expect(manifest.targetPath).not.toBe("content/catalog.json");
    expect(manifest.migrationPath).toBe(result.migrationPath);
    expect(manifest.counts).toEqual(expect.objectContaining({ changed: 1 }));
  });

  it("requires explicit confirmation for a large catalog change", () => {
    const directory = mkdtempSync(join(process.cwd(), ".tmp-vimforge-prepare-large-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "catalog-large.json");
    const migrationDirectory = join(directory, "migrations");
    const manifestPath = join(directory, "release-manifest.json");
    let changedCount = 0;
    const target = {
      ...base,
      units: base.units.map((unit) => ({
        ...unit,
        exercises: unit.exercises.map((exercise) => {
          const shouldChange = changedCount < 30;
          changedCount += 1;
          return shouldChange ? { ...exercise, title: `${exercise.title} (重新設計)` } : exercise;
        }),
      })),
    };
    writeFileSync(targetPath, `${JSON.stringify({ ...target, catalogHash: hashCatalog(target) }, null, 2)}\n`, "utf8");

    expect(() => prepareRelease({ targetPath, migrationDirectory, manifestPath })).toThrow(/25%/i);
    expect(() => prepareRelease({
      targetPath,
      migrationDirectory,
      manifestPath,
      confirmLargeChange: true,
      now: () => new Date("2026-07-17T01:02:04.000Z"),
    })).not.toThrow();
  });
});
