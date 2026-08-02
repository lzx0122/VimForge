import { diffCatalog } from "./catalog-diff";
import { normalizeCatalogForProductionExportShape } from "./catalog-production-shape";
import {
  exerciseVersionChanged,
  hashCatalog,
  validateCatalogSnapshot,
  type CatalogExercise,
  type CatalogSnapshot,
  type CatalogUnit,
} from "./catalog-contract";

function unitSlugForExercise(snapshot: CatalogSnapshot, slug: string): string {
  const unit = snapshot.units.find((candidate) => candidate.exercises.some((exercise) => exercise.slug === slug));
  if (unit === undefined) {
    throw new Error(`Exercise ${slug} is not owned by a catalog unit.`);
  }
  return unit.slug;
}

/**
 * Build the exact catalog snapshot that production will contain after the
 * release migration runs. `authoringTarget` carries the same catalogRevision
 * as `base` (the conventional export-edit-diff workflow); this function is
 * the single source of truth for the resulting revision, exercise versions,
 * retained (unpublished) rows, and the canonical hash of that final state.
 */
export function materializeCatalogReleaseSnapshot(
  base: CatalogSnapshot,
  authoringTarget: CatalogSnapshot,
): CatalogSnapshot {
  const diff = diffCatalog(base, authoringTarget);
  const targetRevision = base.catalogRevision + 1;

  const materializedBySlug = new Map<string, { unitSlug: string; exercise: CatalogExercise }>();

  for (const entry of diff.added) {
    materializedBySlug.set(entry.slug, {
      unitSlug: unitSlugForExercise(authoringTarget, entry.slug),
      exercise: { ...entry.after, version: 1 },
    });
  }
  for (const entry of diff.changed) {
    const versionChanged = exerciseVersionChanged(entry.before, entry.after);
    materializedBySlug.set(entry.slug, {
      unitSlug: unitSlugForExercise(authoringTarget, entry.slug),
      exercise: { ...entry.after, version: versionChanged ? entry.before.version + 1 : entry.before.version },
    });
  }
  for (const entry of diff.unchanged) {
    materializedBySlug.set(entry.slug, {
      unitSlug: unitSlugForExercise(authoringTarget, entry.slug),
      // Do not trust the authoring file's own version field: nothing
      // content- or metadata-owned changed, so the base version carries over.
      exercise: { ...entry.exercise, version: base.units.flatMap((unit) => unit.exercises).find((item) => item.slug === entry.slug)?.version ?? entry.exercise.version },
    });
  }
  for (const entry of diff.removed) {
    // Production never deletes the row; it retains the exercise's historical
    // content and version in its original unit, marked unpublished.
    materializedBySlug.set(entry.slug, {
      unitSlug: unitSlugForExercise(base, entry.slug),
      exercise: { ...entry.before, isPublished: false },
    });
  }

  const unitSlugs = [...new Set(authoringTarget.units.map((unit) => unit.slug))];
  const materializedUnits: CatalogUnit[] = unitSlugs.map((slug) => {
    const authoredUnit = authoringTarget.units.find((unit) => unit.slug === slug);
    if (authoredUnit === undefined) {
      throw new Error(`Unit ${slug} is missing from the authoring snapshot.`);
    }
    const exercises = [...materializedBySlug.values()]
      .filter((entry) => entry.unitSlug === slug)
      .map((entry) => entry.exercise);
    return {
      slug: authoredUnit.slug,
      title: authoredUnit.title,
      description: authoredUnit.description,
      difficulty: authoredUnit.difficulty,
      estimatedMinutes: authoredUnit.estimatedMinutes,
      displayOrder: authoredUnit.displayOrder,
      isPublished: authoredUnit.isPublished,
      skills: authoredUnit.skills,
      exercises,
    };
  });

  const draft: CatalogSnapshot = {
    schemaVersion: authoringTarget.schemaVersion,
    catalogRevision: targetRevision,
    catalogHash: `sha256:${"0".repeat(64)}`,
    exportedAt: authoringTarget.exportedAt,
    units: materializedUnits,
  };
  // Production persists and re-exports this data through catalog-sql.ts and
  // PRODUCTION_EXPORT_QUERY; the materialized snapshot's canonical shape
  // (defaulted fields, nested ordering) must match that round trip exactly,
  // or its hash will never agree with a real post-publish export.
  const normalized = normalizeCatalogForProductionExportShape(draft);
  const withHash = { ...normalized, catalogHash: hashCatalog(normalized) };

  // The base and authoring target can each be individually valid while the
  // materialized result is not: a retained (unpublished) historical exercise
  // can reference a unit skill the authoring target no longer declares,
  // because nothing currently authored uses it. Production would end up
  // with a relationship graph the catalog contract forbids. Catch this
  // before any migration file, manifest, or db push exists — the
  // post-publish full-row check exists as defense in depth, not as the
  // primary safeguard.
  const errors = validateCatalogSnapshot(withHash);
  if (errors.length > 0) {
    throw new Error(
      `Materialized post-release catalog is invalid: ${errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`,
    );
  }

  return withHash;
}
