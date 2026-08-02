import { diffCatalog } from "./catalog-diff";
import {
  exerciseVersionChanged,
  hashCatalog,
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

function sortExercises(exercises: readonly CatalogExercise[]): CatalogExercise[] {
  return [...exercises].sort((a, b) =>
    (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.slug.localeCompare(b.slug));
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
    const exercises = sortExercises(
      [...materializedBySlug.values()]
        .filter((entry) => entry.unitSlug === slug)
        .map((entry) => entry.exercise),
    );
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
  }).sort((a, b) => a.displayOrder - b.displayOrder);

  const draft: CatalogSnapshot = {
    schemaVersion: authoringTarget.schemaVersion,
    catalogRevision: targetRevision,
    catalogHash: `sha256:${"0".repeat(64)}`,
    exportedAt: authoringTarget.exportedAt,
    units: materializedUnits,
  };
  return { ...draft, catalogHash: hashCatalog(draft) };
}
