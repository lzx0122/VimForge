import { createHash } from "node:crypto";
import { basename } from "node:path";

import { diffCatalog, type CatalogDiff } from "./catalog-diff";
import { buildCatalogReleasePlan, type CatalogReleasePlan } from "./catalog-release-plan";
import { hashCatalog, validateCatalogSnapshot, type CatalogSnapshot } from "./catalog-contract";

export interface PublishManifestCounts {
  added: number;
  changed: number;
  unpublished: number;
  unchanged: number;
}

export interface PublishManifest {
  schemaVersion?: 1;
  targetPath: string;
  baseRevision: number;
  targetRevision: number;
  targetHash: string;
  migrationPath: string;
  migrationHash: string;
  counts: PublishManifestCounts;
}

export interface PublishInput {
  expectedProjectRef: string;
  linkedProjectRef: string;
  /** Exact text entered by the operator; aliases support embedding callers. */
  typedProjectRef?: string;
  confirmProjectRef?: string;
  projectRefConfirmation?: string;
  confirmation?: string;
  baseSnapshot: CatalogSnapshot;
  targetSnapshot: CatalogSnapshot;
  migrationPath: string;
  migrationSql: string;
  pendingMigrations: readonly string[];
  manifest: PublishManifest;
  confirmLargeChange?: boolean;
  largeChangeConfirmed?: boolean;
}

export interface PublishPreflightResult {
  diff: CatalogDiff;
  plan: CatalogReleasePlan;
  migrationHash: string;
  summary: PublishManifestCounts;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function assertProject(input: PublishInput): void {
  if (input.expectedProjectRef.trim().length === 0) {
    throw new Error("Expected production project ref is required.");
  }
  if (input.linkedProjectRef !== input.expectedProjectRef) {
    throw new Error("Linked Supabase project does not match the expected production project ref.");
  }
  const typedProjectRef = input.typedProjectRef
    ?? input.confirmProjectRef
    ?? input.projectRefConfirmation
    ?? input.confirmation;
  if (typedProjectRef !== input.expectedProjectRef) {
    throw new Error("Production project confirmation did not match the expected project ref.");
  }
}

function assertManifest(input: PublishInput, diff: CatalogDiff, migrationHash: string): void {
  const manifest = input.manifest;
  if (typeof manifest.targetPath !== "string" || manifest.targetPath.trim().length === 0) {
    throw new Error("Release manifest target snapshot path is missing.");
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(manifest.targetHash)) {
    throw new Error("Release manifest target hash is missing or invalid.");
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(manifest.migrationHash)) {
    throw new Error("Release manifest migration hash is missing or invalid.");
  }
  if (manifest.migrationHash !== migrationHash) {
    throw new Error("Release manifest migration hash does not match the migration file.");
  }
  if (manifest.migrationPath !== input.migrationPath) {
    throw new Error("Release manifest migration path does not match the selected migration.");
  }
  if (manifest.baseRevision !== input.baseSnapshot.catalogRevision) {
    throw new Error("Release manifest base revision is stale.");
  }
  if (manifest.targetRevision !== input.baseSnapshot.catalogRevision + 1) {
    throw new Error("Release manifest target revision is invalid.");
  }
  if (manifest.targetHash !== input.targetSnapshot.catalogHash) {
    throw new Error("Release manifest target hash does not match the target catalog.");
  }
  const expectedCounts: PublishManifestCounts = {
    added: diff.added.length,
    changed: diff.changed.length,
    unpublished: diff.removed.length,
    unchanged: diff.unchanged.length,
  };
  if (JSON.stringify(manifest.counts) !== JSON.stringify(expectedCounts)) {
    throw new Error("Release manifest counts do not match the catalog diff.");
  }
}

function assertPendingMigrations(input: PublishInput): void {
  const expected = basename(input.migrationPath);
  const pending = input.pendingMigrations.map((migration) => basename(migration));
  if (pending.length !== 1 || pending[0] !== expected) {
    throw new Error("Unexpected pending migration detected; resolve pending migrations before publishing.");
  }
}

/** Validate every release invariant without contacting Supabase or a local database. */
export function preflightProductionPublish(input: PublishInput): PublishPreflightResult {
  assertProject(input);
  if (input.migrationSql.trim().length === 0) {
    throw new Error("Release migration is empty.");
  }
  const migrationHash = sha256(input.migrationSql);
  const baseErrors = validateCatalogSnapshot(input.baseSnapshot);
  if (baseErrors.length > 0 || hashCatalog(input.baseSnapshot) !== input.baseSnapshot.catalogHash) {
    throw new Error("Base catalog is invalid or has a stale hash.");
  }
  const targetErrors = validateCatalogSnapshot(input.targetSnapshot);
  if (targetErrors.length > 0 || hashCatalog(input.targetSnapshot) !== input.targetSnapshot.catalogHash) {
    throw new Error("Target catalog is invalid or has a stale hash.");
  }
  const diff = diffCatalog(input.baseSnapshot, input.targetSnapshot);
  if (diff.largeChange && !(input.confirmLargeChange ?? input.largeChangeConfirmed)) {
    throw new Error("Catalog change exceeds the 25% threshold; explicit confirmation is required.");
  }
  assertManifest(input, diff, migrationHash);
  assertPendingMigrations(input);
  const plan = buildCatalogReleasePlan(input.baseSnapshot, input.targetSnapshot);
  return {
    diff,
    plan,
    migrationHash,
    summary: {
      added: diff.added.length,
      changed: diff.changed.length,
      unpublished: diff.removed.length,
      unchanged: diff.unchanged.length,
    },
  };
}

export { sha256 as hashMigration };
