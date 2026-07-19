import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DIFFICULTIES,
  EXERCISE_TYPES,
  SUPPORTED_LANGUAGES,
  isExerciseDefinition,
  type CompletionRule,
  type Difficulty,
  type ExerciseType,
  type SupportedLanguage,
} from "../src/types/exercise";
import {
  LEARNING_MODES,
  VIM_MODES,
  type CursorPosition,
  type LearningMode,
  type VimMode,
} from "../src/types/learning";
import {
  convertSeedCatalog,
  type SeedCatalogUnit,
} from "./content-validate";
import { validateCatalogSnapshot } from "../src/content/catalog-contract";

interface SeedSkill {
  slug: string;
  name: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  weight: number;
  primary: boolean;
}

interface SeedSolution {
  sequence: string;
  normalizedActions: unknown[];
  keystrokeCount: number;
  recommended: boolean;
  explanation: string;
}

interface SeedHint {
  level: number;
  content: string;
  commandPreview: string | null;
}

interface SeedVariant {
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

interface SeedUnit {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  displayOrder: number;
  published: boolean;
  exerciseType: ExerciseType;
  supportedModes: string[];
  skills: SeedSkill[];
  solutions: SeedSolution[];
  hints: SeedHint[];
  variants: SeedVariant[];
}

export interface SeedValidationSummary {
  publishedUnitCount: number;
  publishedExerciseCount: number;
  languageCounts: {
    csharp: number;
    javascript: number;
    typescript: number;
    other: number;
  };
}

export interface SeedValidationResult {
  errors: string[];
  summary: SeedValidationSummary;
}

const CATALOG_PATTERN = /\$catalog\$([\s\S]*?)\$catalog\$/u;
const REQUIRED_HINT_LEVELS = [1, 2, 3, 4] as const;
const SKILL_CATEGORIES = [
  "mode",
  "movement",
  "editing",
  "copy_paste",
  "find",
  "search",
  "text_object",
  "visual",
  "composition",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isCursorPosition(value: unknown): value is CursorPosition {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.line) &&
    isNonNegativeInteger(value.column)
  );
}

function isCursorMatchRule(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "ignore") {
    return true;
  }
  if (value.type === "exact") {
    return (
      isNonNegativeInteger(value.line) &&
      isNonNegativeInteger(value.column)
    );
  }
  return (
    value.type === "range" &&
    isCursorPosition(value.start) &&
    isCursorPosition(value.end)
  );
}

function isCompletionRule(value: unknown): value is CompletionRule {
  return (
    isRecord(value) &&
    isOneOf(value.contentMatch, ["exact", "unchanged"]) &&
    isCursorMatchRule(value.cursorMatch) &&
    (!("requiredMode" in value) || isOneOf<VimMode>(value.requiredMode, VIM_MODES))
  );
}

function isSeedSkill(value: unknown): value is SeedSkill {
  return (
    isRecord(value) &&
    isNonEmptyString(value.slug) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.description) &&
    isOneOf(value.category, SKILL_CATEGORIES) &&
    isOneOf(value.difficulty, DIFFICULTIES) &&
    typeof value.weight === "number" &&
    value.weight > 0 &&
    value.weight <= 1 &&
    typeof value.primary === "boolean"
  );
}

function isSeedSolution(value: unknown): value is SeedSolution {
  return (
    isRecord(value) &&
    isNonEmptyString(value.sequence) &&
    Array.isArray(value.normalizedActions) &&
    isPositiveInteger(value.keystrokeCount) &&
    typeof value.recommended === "boolean" &&
    isNonEmptyString(value.explanation)
  );
}

function isSeedHint(value: unknown): value is SeedHint {
  return (
    isRecord(value) &&
    Number.isInteger(value.level) &&
    isNonEmptyString(value.content) &&
    (value.commandPreview === null || typeof value.commandPreview === "string")
  );
}

function isSeedVariant(value: unknown): value is SeedVariant {
  return (
    isRecord(value) &&
    isOneOf(value.language, SUPPORTED_LANGUAGES) &&
    isPositiveInteger(value.count) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.instruction) &&
    typeof value.initialContent === "string" &&
    typeof value.expectedContent === "string" &&
    isCursorPosition(value.initialCursor) &&
    isCompletionRule(value.completionRule) &&
    isPositiveInteger(value.targetDurationMs)
  );
}

function parseCatalog(seedSql: string): unknown {
  const catalogJson = seedSql.match(CATALOG_PATTERN)?.[1];
  if (catalogJson === undefined) {
    throw new Error("seed.sql must contain a $catalog$ JSON block.");
  }

  return JSON.parse(catalogJson);
}

function replaceOrdinal(template: string, ordinal: number): string {
  return template.replaceAll("{{n}}", String(ordinal));
}

function hasValidCursor(content: string, cursor: CursorPosition): boolean {
  const line = content.split("\n")[cursor.line];
  return line !== undefined && cursor.column <= line.length;
}

function languageBucket(
  language: SupportedLanguage,
): keyof SeedValidationSummary["languageCounts"] {
  if (language === "csharp") {
    return "csharp";
  }
  if (language === "typescript") {
    return "typescript";
  }
  if (language === "javascript") {
    return "javascript";
  }
  return "other";
}

function hasSeedUnitShape(value: unknown): value is SeedUnit {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.slug) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.description) &&
    isOneOf(value.difficulty, DIFFICULTIES) &&
    isPositiveInteger(value.estimatedMinutes) &&
    isPositiveInteger(value.displayOrder) &&
    typeof value.published === "boolean" &&
    isOneOf(value.exerciseType, EXERCISE_TYPES) &&
    Array.isArray(value.supportedModes) &&
    value.supportedModes.every((mode) => typeof mode === "string") &&
    Array.isArray(value.skills) &&
    value.skills.every(isSeedSkill) &&
    Array.isArray(value.solutions) &&
    value.solutions.every(isSeedSolution) &&
    Array.isArray(value.hints) &&
    value.hints.every(isSeedHint) &&
    Array.isArray(value.variants) &&
    value.variants.every(isSeedVariant)
  );
}

function emptySummary(): SeedValidationSummary {
  return {
    publishedUnitCount: 0,
    publishedExerciseCount: 0,
    languageCounts: {
      csharp: 0,
      javascript: 0,
      typescript: 0,
      other: 0,
    },
  };
}

export function validateSeedSql(seedSql: string): SeedValidationResult {
  const errors: string[] = [];
  const summary = emptySummary();
  let parsedCatalog: unknown;

  try {
    parsedCatalog = parseCatalog(seedSql);
  } catch (error: unknown) {
    return {
      errors: [error instanceof Error ? error.message : "Invalid seed catalog."],
      summary,
    };
  }

  if (!Array.isArray(parsedCatalog)) {
    return { errors: ["Seed catalog must be an array."], summary };
  }

  // Keep the legacy seed diagnostics below, but run the expanded records
  // through the canonical catalog contract as well. This makes the seed and
  // offline JSON validator enforce the same exercise-level rules.
  if (parsedCatalog.every(hasSeedUnitShape)) {
    const expandedCatalog = convertSeedCatalog(
      parsedCatalog as SeedCatalogUnit[],
    );
    for (const error of validateCatalogSnapshot(expandedCatalog)) {
      errors.push(`Catalog ${error.path}: ${error.message}`);
    }
  }

  const unitSlugs = new Set<string>();
  const displayOrders = new Set<number>();

  for (const value of parsedCatalog) {
    if (!hasSeedUnitShape(value)) {
      errors.push("Seed catalog contains an invalid unit record.");
      continue;
    }

    const unit = value;
    if (unitSlugs.has(unit.slug)) {
      errors.push(`Unit slug ${unit.slug} must be unique.`);
    }
    unitSlugs.add(unit.slug);
    if (displayOrders.has(unit.displayOrder)) {
      errors.push(`Unit display order ${unit.displayOrder} must be unique.`);
    }
    displayOrders.add(unit.displayOrder);

    if (unit.published) {
      summary.publishedUnitCount += 1;
    }

    const totalWeight = unit.skills.reduce(
      (sum, skill) => sum + skill.weight,
      0,
    );
    if (unit.skills.length === 0 || Math.abs(totalWeight - 1) > 0.0001) {
      errors.push(`Unit ${unit.slug} skill weights must sum to 1.`);
    }

    const hasRecommendedSolution = unit.solutions.some(
      (solution) => solution.recommended,
    );
    if (!hasRecommendedSolution) {
      errors.push(`Unit ${unit.slug} requires a recommended solution.`);
    }

    const hintLevels = unit.hints.map((hint) => hint.level);
    if (new Set(hintLevels).size !== hintLevels.length) {
      errors.push(`Unit ${unit.slug} hint levels must be unique.`);
    }
    if (
      hintLevels.length === 0 ||
      hintLevels.some((level) => !Number.isInteger(level) || level < 1 || level > 4)
    ) {
      errors.push(`Unit ${unit.slug} contains an invalid hint level.`);
    }
    if (
      hintLevels.length !== REQUIRED_HINT_LEVELS.length ||
      REQUIRED_HINT_LEVELS.some((level) => !hintLevels.includes(level))
    ) {
      errors.push(`Unit ${unit.slug} requires hint levels 1 through 4.`);
    }

    if (
      unit.supportedModes.length === 0 ||
      unit.supportedModes.some(
        (mode) => !isOneOf<LearningMode>(mode, LEARNING_MODES),
      )
    ) {
      errors.push(`Unit ${unit.slug} contains an invalid supported mode.`);
    }

    let exerciseNumber = 0;
    for (const variant of unit.variants) {
      if (!Number.isInteger(variant.count) || variant.count <= 0) {
        errors.push(`Unit ${unit.slug} variant count must be positive.`);
        continue;
      }

      for (let ordinal = 1; ordinal <= variant.count; ordinal += 1) {
        exerciseNumber += 1;
        const initialContent = replaceOrdinal(variant.initialContent, ordinal);
        const expectedContent = replaceOrdinal(variant.expectedContent, ordinal);
        const exercise = {
          id: `${unit.slug}-${String(exerciseNumber).padStart(2, "0")}`,
          unitId: unit.slug,
          slug: `${unit.slug}-${String(exerciseNumber).padStart(2, "0")}`,
          title: replaceOrdinal(variant.title, ordinal),
          instruction: replaceOrdinal(variant.instruction, ordinal),
          language: variant.language,
          exerciseType: unit.exerciseType,
          difficulty: unit.difficulty,
          initialContent,
          expectedContent,
          initialCursor: variant.initialCursor,
          completionRule: variant.completionRule,
          supportedModes: unit.supportedModes,
          targetDurationMs: variant.targetDurationMs,
          version: 1,
        };

        if (!isExerciseDefinition(exercise)) {
          errors.push(`Unit ${unit.slug} contains an invalid exercise schema.`);
          break;
        }
        if (!hasValidCursor(initialContent, variant.initialCursor)) {
          errors.push(`Unit ${unit.slug} has an invalid initial cursor.`);
          break;
        }

        if (unit.published) {
          summary.publishedExerciseCount += 1;
          summary.languageCounts[languageBucket(exercise.language)] += 1;
        }
      }
    }
  }

  if (summary.publishedUnitCount !== 10) {
    errors.push("Seed must contain exactly 10 published units.");
  }
  if (summary.publishedExerciseCount !== 100) {
    errors.push("Seed must contain exactly 100 published exercises.");
  }
  if (
    summary.languageCounts.csharp !== 60 ||
    summary.languageCounts.typescript + summary.languageCounts.javascript !== 20 ||
    summary.languageCounts.other !== 20
  ) {
    errors.push("Seed language distribution must be 60/20/20.");
  }

  return { errors, summary };
}

function runCli(): void {
  const seedPath = resolve(process.cwd(), "supabase/seed.sql");
  const result = validateSeedSql(readFileSync(seedPath, "utf8"));

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Validated ${result.summary.publishedUnitCount} units and ` +
      `${result.summary.publishedExerciseCount} exercises.`,
  );
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  resolve(entryPath) === resolve(process.cwd(), "scripts/validate-seed.ts")
) {
  runCli();
}
