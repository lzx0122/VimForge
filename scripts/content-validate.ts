import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  hashCatalog,
  parseCatalogSnapshot,
  validateCatalogSnapshot,
  type CatalogExercise,
  type CatalogHint,
  type CatalogSkill,
  type CatalogSnapshot,
  type CatalogSolution,
  type CatalogUnit,
  type CatalogValidationError,
} from "../src/content/catalog-contract";
import type { NormalizedAction } from "../src/types/attempt";
import type {
  CompletionRule,
  Difficulty,
  ExerciseType,
  SupportedLanguage,
} from "../src/types/exercise";
import type { CursorPosition, LearningMode } from "../src/types/learning";

const CATALOG_PATTERN = /\$catalog\$([\s\S]*?)\$catalog\$/u;
const DEFAULT_EXPORTED_AT = "2026-07-17T00:00:00.000Z";
const EMPTY_HASH = `sha256:${"0".repeat(64)}`;

export interface SeedSkill {
  slug: string;
  name: string;
  description: string;
  category: CatalogSkill["category"];
  difficulty: Difficulty;
  weight: number;
  primary: boolean;
}

export interface SeedSolution {
  sequence: string;
  normalizedActions: NormalizedAction[];
  keystrokeCount: number;
  recommended: boolean;
  explanation: string;
}

export interface SeedHint {
  level: CatalogHint["level"];
  content: string;
  commandPreview: string | null;
}

export interface SeedVariant {
  language: SupportedLanguage;
  count: number;
  title: string;
  instruction: string;
  initialContent: string;
  expectedContent: string;
  initialCursor: CursorPosition;
  completionRule: CompletionRule;
  targetDurationMs: number;
}

export interface SeedCatalogUnit {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  displayOrder: number;
  published: boolean;
  exerciseType: ExerciseType;
  supportedModes: LearningMode[];
  skills: SeedSkill[];
  solutions: SeedSolution[];
  hints: SeedHint[];
  variants: SeedVariant[];
}

export interface CatalogValidationSummary {
  unitCount: number;
  exerciseCount: number;
  languageCounts: Record<SupportedLanguage, number>;
}

export interface CatalogValidationReport {
  path: string;
  valid: boolean;
  errors: readonly CatalogValidationError[];
  unitCount: number;
  exerciseCount: number;
  summary: CatalogValidationSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSeedCatalog(seedSql: string): unknown {
  const catalogJson = seedSql.match(CATALOG_PATTERN)?.[1];
  if (catalogJson === undefined) {
    throw new Error("seed.sql must contain a $catalog$ JSON block.");
  }
  return JSON.parse(catalogJson) as unknown;
}

/** Extract the legacy JSON block without contacting a database. */
export function extractSeedCatalog(seedSql: string): unknown {
  return parseSeedCatalog(seedSql);
}

function replaceOrdinal(value: string, ordinal: number): string {
  return value.replaceAll("{{n}}", String(ordinal));
}

function replaceOrdinalDeep(value: unknown, ordinal: number): unknown {
  if (typeof value === "string") {
    return replaceOrdinal(value, ordinal);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceOrdinalDeep(item, ordinal));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceOrdinalDeep(item, ordinal),
      ]),
    );
  }
  return value;
}

function expandSolution(solution: SeedSolution, ordinal: number, displayOrder: number): CatalogSolution {
  const sequence = replaceOrdinal(solution.sequence, ordinal);
  const expandedActions = replaceOrdinalDeep(
    solution.normalizedActions,
    ordinal,
  );
  const normalizedActions = Array.isArray(expandedActions)
    ? expandedActions.map((action) => {
        if (
          isRecord(action) &&
          action.type === "insert_text" &&
          typeof action.text === "string"
        ) {
          return { ...action, textLength: action.text.length };
        }
        return action;
      }) as NormalizedAction[]
    : [];
  return {
    sequence,
    normalizedActions,
    keystrokeCount: solution.keystrokeCount,
    recommended: solution.recommended,
    explanation: replaceOrdinal(solution.explanation, ordinal),
    displayOrder,
  };
}

function expandHint(hint: SeedHint, ordinal: number): CatalogHint {
  return {
    level: hint.level,
    content: replaceOrdinal(hint.content, ordinal),
    commandPreview:
      hint.commandPreview === null
        ? null
        : replaceOrdinal(hint.commandPreview, ordinal),
  };
}

function expandUnit(unit: SeedCatalogUnit): CatalogUnit {
  const skills: CatalogSkill[] = unit.skills.map((skill, index) => ({
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    difficulty: skill.difficulty,
    primary: skill.primary,
    displayOrder: index + 1,
  }));
  const exercises: CatalogExercise[] = [];
  let exerciseNumber = 0;

  for (const variant of unit.variants) {
    for (let ordinal = 1; ordinal <= variant.count; ordinal += 1) {
      exerciseNumber += 1;
      exercises.push({
        slug: `${unit.slug}-${String(exerciseNumber).padStart(2, "0")}`,
        title: replaceOrdinal(variant.title, ordinal),
        instruction: replaceOrdinal(variant.instruction, ordinal),
        language: variant.language,
        exerciseType: unit.exerciseType,
        difficulty: unit.difficulty,
        initialContent: replaceOrdinal(variant.initialContent, ordinal),
        expectedContent: replaceOrdinal(variant.expectedContent, ordinal),
        initialCursor: structuredClone(variant.initialCursor),
        completionRule: structuredClone(variant.completionRule),
        supportedModes: [...unit.supportedModes],
        targetDurationMs: variant.targetDurationMs,
        version: 1,
        isPublished: unit.published,
        displayOrder: exerciseNumber,
        skills: unit.skills.map((skill) => ({
          skillSlug: skill.slug,
          weight: skill.weight,
          primary: skill.primary,
        })),
        solutions: unit.solutions.map((solution, index) =>
          expandSolution(solution, ordinal, index + 1),
        ),
        hints: unit.hints.map((hint) => expandHint(hint, ordinal)),
      });
    }
  }

  return {
    slug: unit.slug,
    title: unit.title,
    description: unit.description,
    difficulty: unit.difficulty,
    estimatedMinutes: unit.estimatedMinutes,
    displayOrder: unit.displayOrder,
    isPublished: unit.published,
    skills,
    exercises,
  };
}

/** Expand the legacy variants into explicit, stable exercise records. */
export function expandSeedCatalog(
  units: readonly SeedCatalogUnit[],
  exportedAt = DEFAULT_EXPORTED_AT,
): CatalogSnapshot {
  const draft: CatalogSnapshot = {
    schemaVersion: 1,
    catalogRevision: 1,
    catalogHash: EMPTY_HASH,
    exportedAt,
    units: units.map(expandUnit),
  };
  return { ...draft, catalogHash: hashCatalog(draft) };
}

/** Convert the current seed JSON block into the canonical snapshot shape. */
export function convertSeedCatalog(
  catalog: readonly SeedCatalogUnit[],
  exportedAt = DEFAULT_EXPORTED_AT,
): CatalogSnapshot {
  return expandSeedCatalog(catalog, exportedAt);
}

/** Convert a complete seed.sql file into the canonical snapshot shape. */
export function convertSeedSqlToCatalog(
  seedSql: string,
  exportedAt = DEFAULT_EXPORTED_AT,
): CatalogSnapshot {
  const catalog = parseSeedCatalog(seedSql);
  if (!Array.isArray(catalog)) {
    throw new Error("Seed catalog must be an array.");
  }
  return expandSeedCatalog(catalog as SeedCatalogUnit[], exportedAt);
}

function emptyLanguageCounts(): Record<SupportedLanguage, number> {
  return {
    csharp: 0,
    typescript: 0,
    javascript: 0,
    json: 0,
    html: 0,
    css: 0,
    sql: 0,
    markdown: 0,
    plaintext: 0,
  };
}

function makeReport(
  path: string,
  errors: readonly CatalogValidationError[],
  snapshot?: CatalogSnapshot,
): CatalogValidationReport {
  const units = snapshot?.units ?? [];
  const exercises = units.flatMap((unit) => unit.exercises);
  const languageCounts = emptyLanguageCounts();
  for (const exercise of exercises) {
    languageCounts[exercise.language] += 1;
  }
  const summary = {
    unitCount: units.length,
    exerciseCount: exercises.length,
    languageCounts,
  } satisfies CatalogValidationSummary;
  return {
    path,
    valid: errors.length === 0,
    errors,
    unitCount: summary.unitCount,
    exerciseCount: summary.exerciseCount,
    summary,
  };
}

function parseError(path: string, error: unknown): readonly CatalogValidationError[] {
  const message = error instanceof Error ? error.message : "Invalid catalog.";
  return message.split("\n").map((line) => {
    const separator = line.indexOf(": ");
    if (separator > 0) {
      return { path: line.slice(0, separator), message: line.slice(separator + 2) };
    }
    return { path, message: line };
  });
}

/** Validate a JSON snapshot without writing it or contacting Supabase. */
export function validateCatalogFile(path: string): CatalogValidationReport {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error: unknown) {
    return makeReport(path, parseError(path, error));
  }

  let snapshot: CatalogSnapshot;
  try {
    snapshot = parseCatalogSnapshot(JSON.parse(raw) as unknown);
  } catch (error: unknown) {
    return makeReport(path, parseError(path, error));
  }

  const validationErrors = [...validateCatalogSnapshot(snapshot)];
  if (hashCatalog(snapshot) !== snapshot.catalogHash) {
    validationErrors.push({
      path: "catalogHash",
      message: "does not match the canonical catalog content.",
    });
  }
  return makeReport(path, validationErrors, snapshot);
}

function runCli(): void {
  const inputPath = process.argv[2];
  if (inputPath === undefined) {
    console.error("Usage: npm run content:validate -- <catalog.json>");
    process.exitCode = 1;
    return;
  }

  const report = validateCatalogFile(resolve(process.cwd(), inputPath));
  if (report.errors.length > 0) {
    for (const error of report.errors) {
      console.error(`${error.path}: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Validated ${report.unitCount} units and ${report.exerciseCount} exercises.`,
  );
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  resolve(entryPath) === resolve(process.cwd(), "scripts/content-validate.ts")
) {
  runCli();
}
