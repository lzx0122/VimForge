import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hashCatalog, parseCatalogSnapshot, type CatalogExercise, type CatalogSnapshot } from "../src/content/catalog-contract";
import { materializeCatalogReleaseSnapshot } from "../src/content/catalog-release-materializer";
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
    const materializedSnapshotPath = join(directory, "release-target.json");
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
      materializedSnapshotPath,
      now: () => new Date("2026-07-17T01:02:03.000Z"),
    });
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof result.manifest;

    expect(result.migrationPath).toBe(relative(process.cwd(), resolve(migrationDirectory, "20260717010203_catalog_release.sql")));
    expect(manifest.targetPath).toBe(relative(process.cwd(), resolve(targetPath)));
    expect(manifest.targetPath).not.toBe("content/catalog.json");
    expect(manifest.migrationPath).toBe(result.migrationPath);
    expect(manifest.counts).toEqual(expect.objectContaining({ changed: 1 }));
    // The manifest hash must describe the materialized post-release snapshot,
    // not the pre-release authoring file's own hash.
    const hashedTarget = { ...target, catalogHash: hashCatalog(target) };
    const materialized = materializeCatalogReleaseSnapshot(base, hashedTarget);
    expect(manifest.targetHash).toBe(hashCatalog(materialized));
    expect(manifest.targetHash).not.toBe(hashedTarget.catalogHash);

    // The finalized post-release snapshot must be written as its own
    // reviewed artifact — not overwriting content/catalog.json before a
    // verified publish, and not the same file as the authoring input.
    expect(result.materializedSnapshotPath).toBeDefined();
    expect(manifest.materializedSnapshotPath).toBe(result.materializedSnapshotPath);
    expect(manifest.materializedSnapshotPath).not.toBe(manifest.targetPath);
    const writtenSnapshot = JSON.parse(
      readFileSync(resolve(process.cwd(), result.materializedSnapshotPath ?? ""), "utf8"),
    ) as typeof materialized;
    expect(writtenSnapshot).toEqual(materialized);
    expect(writtenSnapshot.catalogRevision).toBe(base.catalogRevision + 1);
    expect(writtenSnapshot.catalogHash).toBe(manifest.targetHash);
  });

  it("requires explicit confirmation for a large catalog change", () => {
    const directory = mkdtempSync(join(process.cwd(), ".tmp-vimforge-prepare-large-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "catalog-large.json");
    const migrationDirectory = join(directory, "migrations");
    const manifestPath = join(directory, "release-manifest.json");
    const materializedSnapshotPath = join(directory, "release-target.json");
    const totalExerciseCount = base.units.reduce((count, unit) => count + unit.exercises.length, 0);
    // Comfortably exceed the diff tool's >25%-affected large-change threshold
    // regardless of the base catalog's actual size.
    const largeChangeCount = Math.floor(totalExerciseCount * 0.25) + 1;
    let changedCount = 0;
    const target = {
      ...base,
      units: base.units.map((unit) => ({
        ...unit,
        exercises: unit.exercises.map((exercise) => {
          const shouldChange = changedCount < largeChangeCount;
          changedCount += 1;
          return shouldChange ? { ...exercise, title: `${exercise.title} (重新設計)` } : exercise;
        }),
      })),
    };
    writeFileSync(targetPath, `${JSON.stringify({ ...target, catalogHash: hashCatalog(target) }, null, 2)}\n`, "utf8");

    expect(() => prepareRelease({ targetPath, migrationDirectory, manifestPath, materializedSnapshotPath })).toThrow(/25%/i);
    expect(() => prepareRelease({
      targetPath,
      migrationDirectory,
      manifestPath,
      materializedSnapshotPath,
      confirmLargeChange: true,
      now: () => new Date("2026-07-17T01:02:04.000Z"),
    })).not.toThrow();
  });

  it("P1 regression: leaves no partial migration, manifest, or materialized-snapshot artifact when the materialized catalog is invalid", () => {
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
    // exercise-old is removed and "search" is dropped from Unit A because
    // nothing currently authored uses it — but exercise-old is retained as
    // an unpublished historical row that still references "search".
    const invalidTarget = minimalSnapshot([minimalExercise("kept", "movement")], [movementSkill]);

    const directory = mkdtempSync(join(process.cwd(), ".tmp-vimforge-prepare-invalid-"));
    temporaryDirectories.push(directory);
    const invalidBasePath = join(directory, "catalog-base-invalid.json");
    const targetPath = join(directory, "catalog-target-invalid.json");
    const migrationDirectory = join(directory, "migrations");
    const manifestPath = join(directory, "release-manifest.json");
    const materializedSnapshotPath = join(directory, "release-target.json");
    writeFileSync(invalidBasePath, `${JSON.stringify(invalidBase, null, 2)}\n`, "utf8");
    writeFileSync(targetPath, `${JSON.stringify(invalidTarget, null, 2)}\n`, "utf8");

    expect(() => prepareRelease({
      targetPath,
      basePath: invalidBasePath,
      migrationDirectory,
      manifestPath,
      materializedSnapshotPath,
      confirmLargeChange: true,
    })).toThrow(/materialized post-release catalog is invalid/i);

    expect(existsSync(manifestPath)).toBe(false);
    expect(existsSync(materializedSnapshotPath)).toBe(false);
    expect(existsSync(migrationDirectory) ? readdirSync(migrationDirectory) : []).toHaveLength(0);
  });
});
