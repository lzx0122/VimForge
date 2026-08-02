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
  type CatalogExercise,
  type CatalogSkill,
  type CatalogSnapshot,
  type CatalogUnit,
} from "../src/content/catalog-contract";
import { buildCatalogReleasePlan, type CatalogReleasePlan } from "../src/content/catalog-release-plan";
import { materializeCatalogReleaseSnapshot } from "../src/content/catalog-release-materializer";
import { normalizeCatalogForProductionExportShape } from "../src/content/catalog-production-shape";
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

/**
 * Independently reconstruct the snapshot a real production export would
 * return after the migration runs, using only what the migration SQL
 * actually writes: exercise rows from plan.added/changed/unpublished (and,
 * for every exercise the migration leaves untouched, its unchanged row in
 * `base`), and unit-skill rows from plan.unitSkills/plan.skills — never
 * base's or the authoring target's raw unit.skills array, since those are
 * not what gets persisted or read back. This is deliberately built without
 * calling materializeCatalogReleaseSnapshot again, so it is an independent
 * cross-check rather than the same computation repeated. It applies the
 * same production-shape normalization catalog-sql.ts's persisted defaults
 * and PRODUCTION_EXPORT_QUERY's ordering rules require — not the
 * unnormalized authoring array order.
 */
function simulateProductionExport(base: CatalogSnapshot, plan: CatalogReleasePlan): CatalogSnapshot {
  const touchedSlugs = new Set([
    ...plan.added.map((entry) => entry.slug),
    ...plan.changed.map((entry) => entry.slug),
    ...plan.unpublished.map((entry) => entry.slug),
  ]);
  const exercisesByUnitSlug = new Map<string, CatalogExercise[]>();
  const place = (unitSlug: string, exercise: CatalogExercise) => {
    const list = exercisesByUnitSlug.get(unitSlug) ?? [];
    list.push(exercise);
    exercisesByUnitSlug.set(unitSlug, list);
  };
  for (const entry of [...plan.added, ...plan.changed, ...plan.unpublished]) {
    place(entry.unitSlug, { ...entry.exercise, version: entry.version, isPublished: entry.isPublished });
  }
  for (const unit of base.units) {
    for (const exercise of unit.exercises) {
      if (!touchedSlugs.has(exercise.slug)) {
        place(unit.slug, exercise);
      }
    }
  }
  const skillsByUnitSlug = (unitSlug: string): CatalogSkill[] =>
    plan.unitSkills
      .filter((relation) => relation.unitSlug === unitSlug)
      .map((relation) => {
        const skill = plan.skills.find((candidate) => candidate.slug === relation.skillSlug);
        if (skill === undefined) {
          throw new Error(`Skill ${relation.skillSlug} referenced by unit_skills but missing from plan.skills.`);
        }
        return { ...skill, primary: relation.isPrimary, displayOrder: relation.displayOrder };
      });
  const units: CatalogUnit[] = plan.units.map((unit) => ({
    ...unit,
    skills: skillsByUnitSlug(unit.slug),
    exercises: exercisesByUnitSlug.get(unit.slug) ?? [],
  }));
  const draft: CatalogSnapshot = {
    schemaVersion: 1,
    catalogRevision: plan.targetRevision,
    catalogHash: `sha256:${"0".repeat(64)}`,
    exportedAt: "2026-07-17T01:02:03.000Z",
    units,
  };
  const normalized = normalizeCatalogForProductionExportShape(draft);
  return { ...normalized, catalogHash: hashCatalog(normalized) };
}

describe("mocked catalog file workflow", () => {
  it("regression: manifest and migration release-state hash match a mocked post-publish canonical production export", async () => {
    const directory = mkdtempSync(join(tmpdir(), "vimforge-content-workflow-e2e-"));
    temporaryDirectories.push(directory);
    const basePath = join(directory, "catalog-base.json");
    const modifiedPath = join(directory, "catalog-modified.json");
    const migrationDirectory = join(directory, "migrations");
    const manifestPath = join(directory, "release-manifest.json");
    const materializedSnapshotPath = join(directory, "release-target.json");
    const authoringTarget = modifiedSnapshot();
    writeSnapshot(basePath, base);
    writeSnapshot(modifiedPath, authoringTarget);

    // 1 & 2: base and authoring snapshot share the same pre-release revision.
    expect(authoringTarget.catalogRevision).toBe(base.catalogRevision);
    // 3 & 4: at least one content-owned change and one removed exercise.
    const changedSlug = base.units[0]?.exercises[0]?.slug;
    const removedExercise = base.units.at(-1)?.exercises.at(-1);
    if (changedSlug === undefined || removedExercise === undefined) {
      throw new Error("fixture must contain a changed and a removed exercise");
    }

    const prepared = prepareRelease({
      targetPath: modifiedPath,
      basePath,
      migrationDirectory,
      manifestPath,
      materializedSnapshotPath,
      now: () => new Date("2026-07-17T01:02:03.000Z"),
    });

    // 5: release plan produces revision N+1.
    expect(prepared.manifest.targetRevision).toBe(base.catalogRevision + 1);

    const plan = buildCatalogReleasePlan(base, authoringTarget);
    const materialized = materializeCatalogReleaseSnapshot(base, authoringTarget);

    // 6: the changed exercise's version increments exactly once.
    const baseVersion = base.units.flatMap((unit) => unit.exercises).find((item) => item.slug === changedSlug)?.version;
    const materializedChanged = materialized.units.flatMap((unit) => unit.exercises).find((item) => item.slug === changedSlug);
    expect(materializedChanged?.version).toBe((baseVersion ?? 0) + 1);

    // 7: the removed exercise remains in materialized production, unpublished,
    // with its historical content and version intact.
    const materializedRemoved = materialized.units.flatMap((unit) => unit.exercises).find((item) => item.slug === removedExercise.slug);
    expect(materializedRemoved).toMatchObject({
      isPublished: false,
      version: removedExercise.version,
      expectedContent: removedExercise.expectedContent,
    });

    // 8: plan.targetHash equals hashCatalog(the materialized post-release snapshot).
    expect(plan.targetHash).toBe(hashCatalog(materialized));
    expect(prepared.manifest.targetHash).toBe(plan.targetHash);
    // 9: it must not merely equal the pre-release authoring snapshot's hash.
    expect(plan.targetHash).not.toBe(authoringTarget.catalogHash);

    // 10: a mocked post-publish production export, built independently from
    // what the migration actually writes (not by re-calling the
    // materializer), matches the manifest's target revision and hash
    // exactly. This is the check the old implementation could not pass: it
    // would compare the export against the pre-release authoring hash.
    // Computed before publishing so the mocked CLI's full production-row
    // export query (P1-2) can return it, not just the release-state table.
    const simulatedExport = simulateProductionExport(base, plan);
    expect(simulatedExport.catalogRevision).toBe(prepared.manifest.targetRevision);
    expect(hashCatalog(simulatedExport)).toBe(prepared.manifest.targetHash);

    const runSupabase = vi.fn(async (args: readonly string[]) => {
      if (args.includes("--help")) {
        return "Usage: supabase db query [flags]\n  --linked\n  --output string";
      }
      if (args.some((value) => value.includes("unit_payload"))) {
        return JSON.stringify({
          catalog_export: {
            releaseState: { revision: prepared.manifest.targetRevision, catalog_hash: prepared.manifest.targetHash },
            snapshot: { schemaVersion: 1, units: simulatedExport.units },
          },
        });
      }
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
    const result = await publishProduction({
      expectedProjectRef: "production-ref",
      linkedProjectRef: "production-ref",
      typedProjectRef: "production-ref",
      pendingMigrations: [prepared.manifest.migrationPath],
      baseSnapshot: base,
      targetSnapshot: authoringTarget,
      manifest: prepared.manifest,
      migrationPath: prepared.manifest.migrationPath,
      migrationSql: readFileSync(resolve(process.cwd(), prepared.migrationPath), "utf8"),
      runSupabase,
      finalConfirmation: "PUBLISH",
    });
    expect(result.success).toBe(true);
    expect(hashCatalog(simulatedExport)).toBe(result.hash);
  });


  it("validates, diffs, and prepares a release without publishing before confirmation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "vimforge-content-workflow-"));
    temporaryDirectories.push(directory);
    const basePath = join(directory, "catalog-base.json");
    const modifiedPath = join(directory, "catalog-modified.json");
    const migrationDirectory = join(directory, "migrations");
    const manifestPath = join(directory, "release-manifest.json");
    const materializedSnapshotPath = join(directory, "release-target.json");
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
      materializedSnapshotPath,
      now: () => new Date("2026-07-17T01:02:03.000Z"),
    });
    const totalBaseExerciseCount = base.units.reduce((count, unit) => count + unit.exercises.length, 0);
    expect(prepared.manifest.counts).toEqual({
      added: 1,
      changed: 1,
      unpublished: 1,
      // One exercise changed and one was removed; the rest of the base
      // catalog carries over unchanged, whatever its actual size is.
      unchanged: totalBaseExerciseCount - 2,
    });
    expect(prepared.migrationPath).toMatch(/20260717010203_catalog_release\.sql$/u);
    expect(readFileSync(resolve(process.cwd(), prepared.migrationPath), "utf8")).toContain(
      "catalog_release",
    );

    const plan = buildCatalogReleasePlan(base, fileDiff.next);
    const simulatedExport = simulateProductionExport(base, plan);
    const runSupabase = vi.fn(async (args: readonly string[]) => {
      if (args.includes("--help")) {
        return "Usage: supabase db query [flags]\n  --linked\n  --output string";
      }
      if (args.some((value) => value.includes("unit_payload"))) {
        return JSON.stringify({
          catalog_export: {
            releaseState: { revision: prepared.manifest.targetRevision, catalog_hash: prepared.manifest.targetHash },
            snapshot: { schemaVersion: 1, units: simulatedExport.units },
          },
        });
      }
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
