import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

import {
  hashCatalog,
  parseCatalogSnapshot,
  validateCatalogSnapshot,
  type CatalogSnapshot,
} from "../src/content/catalog-contract";
import { diffCatalog } from "../src/content/catalog-diff";
import { buildCatalogReleasePlan } from "../src/content/catalog-release-plan";
import { materializeCatalogReleaseSnapshot } from "../src/content/catalog-release-materializer";
import { renderCatalogMigration } from "../src/content/catalog-sql";
import { hashMigration } from "../src/content/publish-preflight";

export interface PrepareReleaseOptions {
  targetPath: string;
  basePath?: string;
  migrationDirectory?: string;
  manifestPath?: string;
  /** Where to write the finalized (materialized) post-release snapshot. */
  materializedSnapshotPath?: string;
  now?: () => Date;
  confirmLargeChange?: boolean;
}

export interface ReleaseManifest {
  schemaVersion: 1;
  /** Repository-relative path to the modified target snapshot used for this release. */
  targetPath: string;
  baseRevision: number;
  targetRevision: number;
  targetHash: string;
  migrationPath: string;
  migrationHash: string;
  /**
   * Repository-relative path to the finalized post-release snapshot
   * (materializeCatalogReleaseSnapshot's output): revision N+1, computed
   * exercise versions, production-shape-normalized. Optional so historical
   * manifests written before this field existed remain valid. This file is
   * not an authoring diff input; after a verified publish it can become the
   * next content/catalog.json baseline.
   */
  materializedSnapshotPath?: string;
  counts: {
    added: number;
    changed: number;
    unpublished: number;
    unchanged: number;
  };
}

export interface PrepareReleaseResult {
  migrationPath: string;
  manifestPath: string;
  materializedSnapshotPath: string;
  manifest: ReleaseManifest;
}

function readSnapshot(path: string, label: string): CatalogSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error(`${label} catalog could not be read as JSON.`);
  }
  const snapshot = parseCatalogSnapshot(value);
  const errors = validateCatalogSnapshot(snapshot);
  if (errors.length > 0 || hashCatalog(snapshot) !== snapshot.catalogHash) {
    throw new Error(`${label} catalog is invalid or has a stale hash.`);
  }
  return snapshot;
}

function timestamp(now: Date): string {
  const iso = now.toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14);
  return iso;
}

/** Validate a modified snapshot and write one reviewed, timestamped migration plus manifest. */
export function prepareRelease(options: PrepareReleaseOptions): PrepareReleaseResult {
  const targetPath = resolve(options.targetPath);
  const basePath = resolve(options.basePath ?? "content/catalog.json");
  const base = readSnapshot(basePath, "Base");
  const target = readSnapshot(targetPath, "Target");
  const diff = diffCatalog(base, target);
  if (diff.largeChange && options.confirmLargeChange !== true) {
    throw new Error("Catalog change exceeds the 25% threshold; explicit confirmation is required.");
  }
  const plan = buildCatalogReleasePlan(base, target);
  const migrationSql = renderCatalogMigration(plan);
  const migrationDirectory = resolve(options.migrationDirectory ?? "supabase/migrations");
  mkdirSync(migrationDirectory, { recursive: true });
  const migrationName = `${timestamp((options.now ?? (() => new Date()))())}_catalog_release.sql`;
  const migrationPath = resolve(migrationDirectory, migrationName);
  if (existsSync(migrationPath)) {
    throw new Error("A catalog migration already exists for this timestamp; retry with a new timestamp.");
  }
  writeFileSync(migrationPath, migrationSql, "utf8");
  const migrationRelativePath = relative(process.cwd(), migrationPath);
  const targetRelativePath = relative(process.cwd(), targetPath);

  // The finalized post-release snapshot production will actually contain —
  // not the pre-release authoring file, which is never used as a baseline
  // or diff input on its own.
  const materializedSnapshot = materializeCatalogReleaseSnapshot(base, target);
  const materializedSnapshotPath = resolve(options.materializedSnapshotPath ?? "content/release-target.json");
  mkdirSync(resolve(materializedSnapshotPath, ".."), { recursive: true });
  writeFileSync(materializedSnapshotPath, `${JSON.stringify(materializedSnapshot, null, 2)}\n`, "utf8");
  const materializedSnapshotRelativePath = relative(process.cwd(), materializedSnapshotPath);

  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    targetPath: targetRelativePath,
    baseRevision: base.catalogRevision,
    targetRevision: plan.targetRevision,
    // The plan's hash describes the materialized post-release snapshot, not
    // the pre-release authoring file's own hash — those differ once the
    // revision advances, so the manifest must record the former.
    targetHash: plan.targetHash,
    migrationPath: migrationRelativePath,
    migrationHash: hashMigration(migrationSql),
    materializedSnapshotPath: materializedSnapshotRelativePath,
    counts: {
      added: diff.added.length,
      changed: diff.changed.length,
      unpublished: diff.removed.length,
      unchanged: diff.unchanged.length,
    },
  };
  const manifestPath = resolve(options.manifestPath ?? "content/release-manifest.json");
  mkdirSync(resolve(manifestPath, ".."), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    migrationPath: migrationRelativePath,
    manifestPath,
    materializedSnapshotPath: materializedSnapshotRelativePath,
    manifest,
  };
}

function runCli(): void {
  const argumentsValue = process.argv.slice(2);
  const targetPath = argumentsValue.find((argument) => !argument.startsWith("-"));
  const confirmLargeChange = argumentsValue.includes("--confirm-large-change");
  if (targetPath === undefined) {
    console.error("Usage: npm run content:prepare-release -- [--confirm-large-change] <modified-catalog.json>");
    process.exitCode = 1;
    return;
  }
  try {
    const result = prepareRelease({ targetPath, confirmLargeChange });
    console.log(`Prepared ${basename(result.migrationPath)} with target ${result.manifest.targetHash}`);
    console.log(`Finalized post-release snapshot written to ${result.materializedSnapshotPath}`);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "Release preparation failed.");
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && resolve(entryPath) === resolve(process.cwd(), "scripts/content-prepare-release.ts")) {
  runCli();
}
