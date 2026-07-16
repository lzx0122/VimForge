import {
  hashCatalog,
  validateCatalogSnapshot,
  type CatalogExercise,
  type CatalogSnapshot,
} from "./catalog-contract";
import { canonicalizeValue } from "./catalog-canonicalizer";

/** A single exercise-owned value that differs between two snapshots. */
export interface CatalogFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface CatalogAddedExercise {
  action: "add";
  slug: string;
  exercise: CatalogExercise;
  after: CatalogExercise;
}

export interface CatalogChangedExercise {
  action: "change";
  slug: string;
  before: CatalogExercise;
  exercise: CatalogExercise;
  after: CatalogExercise;
  fields: readonly CatalogFieldChange[];
  /** Alias retained for callers that refer to field-level changes as changes. */
  changes: readonly CatalogFieldChange[];
}

export interface CatalogRemovedExercise {
  action: "unpublish";
  slug: string;
  before: CatalogExercise;
  exercise: CatalogExercise;
}

export interface CatalogUnchangedExercise {
  action: "unchanged";
  slug: string;
  exercise: CatalogExercise;
}

export interface CatalogDiff {
  added: readonly CatalogAddedExercise[];
  changed: readonly CatalogChangedExercise[];
  removed: readonly CatalogRemovedExercise[];
  unchanged: readonly CatalogUnchangedExercise[];
  largeChange: boolean;
  affectedCount: number;
  baseExerciseCount: number;
  affectedPercentage: number;
}

const EXERCISE_OWNED_FIELDS = [
  "title",
  "instruction",
  "language",
  "exerciseType",
  "difficulty",
  "initialContent",
  "expectedContent",
  "initialCursor",
  "completionRule",
  "supportedModes",
  "targetDurationMs",
  "skills",
  "solutions",
  "hints",
] as const satisfies readonly (keyof CatalogExercise)[];

function allExercises(snapshot: CatalogSnapshot): CatalogExercise[] {
  return snapshot.units.flatMap((unit) => unit.exercises);
}

function exerciseMap(snapshot: CatalogSnapshot): Map<string, CatalogExercise> {
  return new Map(allExercises(snapshot).map((exercise) => [exercise.slug, exercise]));
}

function assertSnapshotMetadata(snapshot: CatalogSnapshot, label: "base" | "next"): void {
  if (hashCatalog(snapshot) !== snapshot.catalogHash) {
    throw new Error(`${label} catalog hash is stale or does not match its content.`);
  }
}

function assertValidSnapshot(snapshot: CatalogSnapshot, label: "base" | "next"): void {
  const errors = validateCatalogSnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`${label} catalog is invalid: ${errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  }
}

function fieldChanges(before: CatalogExercise, after: CatalogExercise): CatalogFieldChange[] {
  return EXERCISE_OWNED_FIELDS.flatMap((field) => {
    const previous = before[field];
    const current = after[field];
    if (canonicalizeValue(previous) === canonicalizeValue(current)) {
      return [];
    }
    return [{ field, before: previous, after: current }];
  });
}

/**
 * Compare explicit exercises by stable slug. Missing exercises are retained as
 * unpublish operations so historical attempts continue to reference their IDs.
 */
export function diffCatalog(base: CatalogSnapshot, next: CatalogSnapshot): CatalogDiff {
  assertSnapshotMetadata(base, "base");
  assertSnapshotMetadata(next, "next");
  if (base.catalogRevision !== next.catalogRevision) {
    throw new Error(
      `Catalog revision mismatch: base is ${base.catalogRevision}, next is ${next.catalogRevision}. Export a fresh base snapshot before editing.`,
    );
  }
  assertValidSnapshot(base, "base");
  assertValidSnapshot(next, "next");
  const renameErrors = validateCatalogSnapshot(next, base).filter((error) =>
    error.message.includes("renamed"),
  );
  if (renameErrors.length > 0) {
    throw new Error(renameErrors.map((error) => `${error.path}: ${error.message}`).join("; "));
  }

  const beforeBySlug = exerciseMap(base);
  const afterBySlug = exerciseMap(next);
  const added: CatalogAddedExercise[] = [];
  const changed: CatalogChangedExercise[] = [];
  const removed: CatalogRemovedExercise[] = [];
  const unchanged: CatalogUnchangedExercise[] = [];

  for (const slug of [...new Set([...beforeBySlug.keys(), ...afterBySlug.keys()])].sort()) {
    const before = beforeBySlug.get(slug);
    const after = afterBySlug.get(slug);
    if (before === undefined && after !== undefined) {
      added.push({ action: "add", slug, exercise: after, after });
      continue;
    }
    if (before !== undefined && after === undefined) {
      removed.push({ action: "unpublish", slug, before, exercise: before });
      continue;
    }
    if (before === undefined || after === undefined) {
      continue;
    }
    const fields = fieldChanges(before, after);
    if (fields.length > 0) {
      changed.push({ action: "change", slug, before, exercise: after, after, fields, changes: fields });
    } else {
      unchanged.push({ action: "unchanged", slug, exercise: after });
    }
  }

  const affectedCount = added.length + changed.length + removed.length;
  const baseExerciseCount = beforeBySlug.size;
  const affectedPercentage = baseExerciseCount === 0
    ? (affectedCount === 0 ? 0 : 100)
    : Math.ceil((affectedCount / baseExerciseCount) * 100);
  return {
    added,
    changed,
    removed,
    unchanged,
    largeChange: affectedPercentage > 25,
    affectedCount,
    baseExerciseCount,
    affectedPercentage,
  };
}
