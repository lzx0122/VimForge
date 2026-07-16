import {
  diffCatalog,
  type CatalogDiff,
} from "./catalog-diff";
import {
  exerciseVersionChanged,
  type CatalogExercise,
  type CatalogSnapshot,
} from "./catalog-contract";

export interface CatalogReleaseExercise {
  action: "add" | "change" | "unpublish" | "unchanged";
  slug: string;
  unitSlug: string;
  exercise: CatalogExercise;
  version: number;
  isPublished: boolean;
  replaceChildren: boolean;
}

export interface CatalogReleaseUnit {
  slug: string;
  title: string;
  description: string;
  difficulty: CatalogSnapshot["units"][number]["difficulty"];
  estimatedMinutes: number;
  displayOrder: number;
  isPublished: boolean;
}

export interface CatalogReleaseSkill {
  slug: string;
  name: string;
  description: string;
  category: CatalogSnapshot["units"][number]["skills"][number]["category"];
  difficulty: CatalogSnapshot["units"][number]["skills"][number]["difficulty"];
}

export interface CatalogReleaseUnitSkill {
  unitSlug: string;
  skillSlug: string;
  isPrimary: boolean;
  displayOrder: number;
}

export interface CatalogReleasePlan {
  baseRevision: number;
  baseHash: string;
  targetRevision: number;
  targetHash: string;
  units: readonly CatalogReleaseUnit[];
  skills: readonly CatalogReleaseSkill[];
  unitSkills: readonly CatalogReleaseUnitSkill[];
  added: readonly CatalogReleaseExercise[];
  changed: readonly CatalogReleaseExercise[];
  unpublished: readonly CatalogReleaseExercise[];
  unchanged: readonly CatalogReleaseExercise[];
}

function unitSlugForExercise(snapshot: CatalogSnapshot, slug: string): string {
  const unit = snapshot.units.find((candidate) => candidate.exercises.some((exercise) => exercise.slug === slug));
  if (unit === undefined) {
    throw new Error(`Exercise ${slug} is not owned by a catalog unit.`);
  }
  return unit.slug;
}

function releaseExercise(
  action: CatalogReleaseExercise["action"],
  snapshot: CatalogSnapshot,
  exercise: CatalogExercise,
  version: number,
  replaceChildren: boolean,
): CatalogReleaseExercise {
  return {
    action,
    slug: exercise.slug,
    unitSlug: unitSlugForExercise(snapshot, exercise.slug),
    exercise,
    version,
    isPublished: action === "unpublish" ? false : exercise.isPublished,
    replaceChildren,
  };
}

function releaseExercises(diff: CatalogDiff, base: CatalogSnapshot, next: CatalogSnapshot) {
  const added = diff.added.map((entry) => releaseExercise("add", next, entry.exercise, 1, true));
  const changed = diff.changed.map((entry) => releaseExercise(
    "change",
    next,
    entry.exercise,
    exerciseVersionChanged(entry.before, entry.after) ? entry.before.version + 1 : entry.before.version,
    true,
  ));
  const unpublished = diff.removed.map((entry) => releaseExercise("unpublish", base, entry.exercise, entry.before.version, false));
  const unchanged = diff.unchanged.map((entry) => releaseExercise("unchanged", next, entry.exercise, entry.exercise.version, false));
  return { added, changed, unpublished, unchanged };
}

/** Build a deterministic, non-destructive release description from two snapshots. */
export function buildCatalogReleasePlan(base: CatalogSnapshot, next: CatalogSnapshot): CatalogReleasePlan {
  const diff = diffCatalog(base, next);
  const operations = releaseExercises(diff, base, next);
  const units = next.units.map((unit) => ({
    slug: unit.slug,
    title: unit.title,
    description: unit.description,
    difficulty: unit.difficulty,
    estimatedMinutes: unit.estimatedMinutes,
    displayOrder: unit.displayOrder,
    isPublished: unit.isPublished,
  }));
  const skillBySlug = new Map<string, CatalogReleaseSkill>();
  const unitSkills: CatalogReleaseUnitSkill[] = [];
  for (const unit of next.units) {
    unit.skills.forEach((skill, index) => {
      skillBySlug.set(skill.slug, {
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        difficulty: skill.difficulty,
      });
      unitSkills.push({
        unitSlug: unit.slug,
        skillSlug: skill.slug,
        isPrimary: skill.primary ?? false,
        displayOrder: skill.displayOrder ?? index,
      });
    });
  }
  return {
    baseRevision: base.catalogRevision,
    baseHash: base.catalogHash,
    // Snapshots are edited from the exported base revision. Publishing the
    // next snapshot advances the private release-state revision exactly once.
    targetRevision: base.catalogRevision + 1,
    targetHash: next.catalogHash,
    units,
    skills: [...skillBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    unitSkills,
    ...operations,
  };
}
