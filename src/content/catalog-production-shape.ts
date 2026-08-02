import type {
  CatalogExercise,
  CatalogExerciseSkill,
  CatalogHint,
  CatalogSkill,
  CatalogSnapshot,
  CatalogSolution,
  CatalogUnit,
} from "./catalog-types";

function normalizeUnitSkills(skills: readonly CatalogSkill[]): CatalogSkill[] {
  return skills
    .map((skill, index) => ({
      ...skill,
      primary: skill.primary ?? false,
      displayOrder: skill.displayOrder ?? index,
    }))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.slug.localeCompare(b.slug));
}

function normalizeExerciseSkills(skills: readonly CatalogExerciseSkill[]): CatalogExerciseSkill[] {
  return [...skills].sort((a, b) => a.skillSlug.localeCompare(b.skillSlug));
}

function normalizeSolutions(solutions: readonly CatalogSolution[]): CatalogSolution[] {
  return solutions
    .map((solution, sourceIndex) => ({
      solution: { ...solution, displayOrder: solution.displayOrder ?? sourceIndex },
      sourceIndex,
    }))
    .sort((a, b) =>
      (a.solution.displayOrder ?? 0) - (b.solution.displayOrder ?? 0) || a.sourceIndex - b.sourceIndex)
    .map((entry) => entry.solution);
}

function normalizeHints(hints: readonly CatalogHint[]): CatalogHint[] {
  return [...hints].sort((a, b) => a.level - b.level);
}

function normalizeExercise(exercise: CatalogExercise): CatalogExercise {
  return {
    ...exercise,
    displayOrder: exercise.displayOrder ?? 0,
    skills: normalizeExerciseSkills(exercise.skills),
    solutions: normalizeSolutions(exercise.solutions),
    hints: normalizeHints(exercise.hints),
  };
}

function normalizeUnit(unit: CatalogUnit): CatalogUnit {
  return {
    ...unit,
    skills: normalizeUnitSkills(unit.skills),
    exercises: unit.exercises
      .map(normalizeExercise)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.slug.localeCompare(b.slug)),
  };
}

/**
 * Normalize a catalog snapshot to the exact shape PRODUCTION_EXPORT_QUERY
 * reconstructs after catalog-sql.ts persists it: defaulted values that
 * catalog-sql.ts writes explicitly (exercise displayOrder, unit skill
 * primary/displayOrder, solution displayOrder) are always present, never
 * omitted, and every nested array is in production's export ordering —
 * unit skills by (displayOrder, slug), exercise skills by skillSlug,
 * solutions by (displayOrder, insertion order), hints by level, exercises
 * by (displayOrder, slug), units by displayOrder.
 */
export function normalizeCatalogForProductionExportShape(snapshot: CatalogSnapshot): CatalogSnapshot {
  return {
    ...snapshot,
    units: snapshot.units.map(normalizeUnit).sort((a, b) => a.displayOrder - b.displayOrder),
  };
}
