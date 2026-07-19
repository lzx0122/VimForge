import {
  DIFFICULTIES,
  EXERCISE_TYPES,
  SUPPORTED_LANGUAGES,
} from "../types/exercise";
import {
  LEARNING_MODES,
  VIM_MODES,
  type CursorPosition,
} from "../types/learning";
import type { CompletionRule } from "../types/exercise";
import type { NormalizedAction } from "../types/attempt";
import {
  SKILL_CATEGORIES,
  type CatalogExercise,
  type CatalogContentWarning,
  type CatalogExerciseSkill,
  type CatalogHint,
  type CatalogSkill,
  type CatalogSnapshot,
  type CatalogSolution,
  type CatalogUnit,
  type CatalogValidationError,
} from "./catalog-types";
import {
  canonicalizeValue,
} from "./catalog-canonicalizer";

export { canonicalizeCatalog, hashCatalog } from "./catalog-canonicalizer";
export type {
  CatalogExercise,
  CatalogContentWarning,
  CatalogExerciseSkill,
  CatalogHint,
  CatalogSkill,
  CatalogSnapshot,
  CatalogSolution,
  CatalogUnit,
  CatalogValidationError,
} from "./catalog-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    throw new Error(`${path}.${key}: expected a non-empty string.`);
  }
  return value;
}

function readRequiredNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}.${key}: expected a finite number.`);
  }
  return value;
}

function readRequiredBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${path}.${key}: expected a boolean.`);
  }
  return value;
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected an object.`);
  }
  return value;
}

function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path}: expected an array.`);
  }
  return value;
}

function parseCursor(value: unknown, path: string): CursorPosition {
  const record = readRecord(value, path);
  const line = record.line;
  const column = record.column;
  if (!isNonNegativeInteger(line) || !isNonNegativeInteger(column)) {
    throw new Error(`${path}: line and column must be non-negative integers.`);
  }
  return { line, column };
}

function parseCompletionRule(value: unknown, path: string): CompletionRule {
  const record = readRecord(value, path);
  if (record.contentMatch !== "exact" && record.contentMatch !== "unchanged") {
    throw new Error(`${path}.contentMatch: expected exact or unchanged.`);
  }
  const cursorRecord = readRecord(record.cursorMatch, `${path}.cursorMatch`);
  let cursorMatch: CompletionRule["cursorMatch"];
  if (cursorRecord.type === "ignore") {
    cursorMatch = { type: "ignore" };
  } else if (cursorRecord.type === "exact") {
    cursorMatch = {
      type: "exact",
      line: readRequiredNumber(cursorRecord, "line", `${path}.cursorMatch`),
      column: readRequiredNumber(cursorRecord, "column", `${path}.cursorMatch`),
    };
  } else if (cursorRecord.type === "range") {
    cursorMatch = {
      type: "range",
      start: parseCursor(cursorRecord.start, `${path}.cursorMatch.start`),
      end: parseCursor(cursorRecord.end, `${path}.cursorMatch.end`),
    };
  } else {
    throw new Error(`${path}.cursorMatch.type: expected ignore, exact, or range.`);
  }

  const requiredMode = record.requiredMode;
  if (requiredMode !== undefined && !isOneOf(requiredMode, VIM_MODES)) {
    throw new Error(`${path}.requiredMode: expected a supported Vim mode.`);
  }
  return {
    contentMatch: record.contentMatch,
    cursorMatch,
    ...(requiredMode === undefined ? {} : { requiredMode }),
  };
}

function parseNormalizedAction(value: unknown, path: string): NormalizedAction {
  const record = readRecord(value, path);
  if (record.type === "vim_command" && typeof record.command === "string") {
    return { type: "vim_command", command: record.command };
  }
  if (
    record.type === "insert_text" &&
    typeof record.text === "string" &&
    isNonNegativeInteger(record.textLength)
  ) {
    return {
      type: "insert_text",
      text: record.text,
      textLength: record.textLength,
    };
  }
  if (record.type === "mode_change" && isOneOf(record.mode, VIM_MODES)) {
    return { type: "mode_change", mode: record.mode };
  }
  if (record.type === "undo") {
    return { type: "undo" };
  }
  if (record.type === "reset") {
    return { type: "reset" };
  }
  if (
    record.type === "search" &&
    typeof record.query === "string" &&
    (record.direction === "forward" || record.direction === "backward")
  ) {
    return {
      type: "search",
      query: record.query,
      direction: record.direction,
    };
  }
  throw new Error(`${path}: invalid normalized action.`);
}

function parseSkill(value: unknown, path: string): CatalogSkill {
  const record = readRecord(value, path);
  const category = record.category;
  const difficulty = record.difficulty;
  if (!isOneOf(category, SKILL_CATEGORIES)) {
    throw new Error(`${path}.category: expected a supported skill category.`);
  }
  if (!isOneOf(difficulty, DIFFICULTIES)) {
    throw new Error(`${path}.difficulty: expected a supported difficulty.`);
  }
  const primary = record.primary;
  const displayOrder = record.displayOrder;
  if (primary !== undefined && typeof primary !== "boolean") {
    throw new Error(`${path}.primary: expected a boolean.`);
  }
  if (displayOrder !== undefined && !isNonNegativeInteger(displayOrder)) {
    throw new Error(`${path}.displayOrder: expected a non-negative integer.`);
  }
  return {
    slug: readRequiredString(record, "slug", path),
    name: readRequiredString(record, "name", path),
    description: readRequiredString(record, "description", path),
    category,
    difficulty,
    ...(primary === undefined ? {} : { primary }),
    ...(displayOrder === undefined ? {} : { displayOrder }),
  };
}

function parseExerciseSkill(value: unknown, path: string): CatalogExerciseSkill {
  const record = readRecord(value, path);
  const skillSlug = record.skillSlug ?? record.slug;
  if (!isNonEmptyString(skillSlug)) {
    throw new Error(`${path}.skillSlug: expected a non-empty skill slug.`);
  }
  const weight = record.weight;
  if (typeof weight !== "number" || !Number.isFinite(weight)) {
    throw new Error(`${path}.weight: expected a finite number.`);
  }
  if (typeof record.primary !== "boolean") {
    throw new Error(`${path}.primary: expected a boolean.`);
  }
  return { skillSlug, weight, primary: record.primary };
}

function parseSolution(value: unknown, path: string): CatalogSolution {
  const record = readRecord(value, path);
  const normalizedActions = readArray(
    record.normalizedActions,
    `${path}.normalizedActions`,
  ).map((action, index) =>
    parseNormalizedAction(action, `${path}.normalizedActions[${index}]`),
  );
  const displayOrder = record.displayOrder;
  if (displayOrder !== undefined && !isNonNegativeInteger(displayOrder)) {
    throw new Error(`${path}.displayOrder: expected a non-negative integer.`);
  }
  return {
    sequence: readRequiredString(record, "sequence", path),
    normalizedActions,
    keystrokeCount: readRequiredNumber(record, "keystrokeCount", path),
    recommended: readRequiredBoolean(record, "recommended", path),
    explanation: readRequiredString(record, "explanation", path),
    ...(displayOrder === undefined ? {} : { displayOrder }),
  };
}

function parseHint(value: unknown, path: string): CatalogHint {
  const record = readRecord(value, path);
  const level = record.level;
  if (level !== 1 && level !== 2 && level !== 3 && level !== 4) {
    throw new Error(`${path}.level: expected a hint level from 1 through 4.`);
  }
  const commandPreview = record.commandPreview;
  if (commandPreview !== null && typeof commandPreview !== "string") {
    throw new Error(`${path}.commandPreview: expected a string or null.`);
  }
  return {
    level,
    content: readRequiredString(record, "content", path),
    commandPreview,
  };
}

function parseExercise(value: unknown, path: string): CatalogExercise {
  const record = readRecord(value, path);
  const language = record.language;
  const exerciseType = record.exerciseType;
  const difficulty = record.difficulty;
  if (!isOneOf(language, SUPPORTED_LANGUAGES)) {
    throw new Error(`${path}.language: expected a supported language.`);
  }
  if (!isOneOf(exerciseType, EXERCISE_TYPES)) {
    throw new Error(`${path}.exerciseType: expected a supported exercise type.`);
  }
  if (!isOneOf(difficulty, DIFFICULTIES)) {
    throw new Error(`${path}.difficulty: expected a supported difficulty.`);
  }
  const supportedModes = readArray(
    record.supportedModes,
    `${path}.supportedModes`,
  ).map((mode, index) => {
    if (!isOneOf(mode, LEARNING_MODES)) {
      throw new Error(`${path}.supportedModes[${index}]: unsupported learning mode.`);
    }
    return mode;
  });
  const displayOrder = record.displayOrder;
  const publicationFlag = record.isPublished ?? record.published;
  if (displayOrder !== undefined && !isNonNegativeInteger(displayOrder)) {
    throw new Error(`${path}.displayOrder: expected a non-negative integer.`);
  }
  if (typeof publicationFlag !== "boolean") {
    throw new Error(`${path}.isPublished: expected a boolean.`);
  }
  return {
    slug: readRequiredString(record, "slug", path),
    title: readRequiredString(record, "title", path),
    instruction: readRequiredString(record, "instruction", path),
    language,
    exerciseType,
    difficulty,
    initialContent: typeof record.initialContent === "string" ? record.initialContent : (() => { throw new Error(`${path}.initialContent: expected a string.`); })(),
    expectedContent: typeof record.expectedContent === "string" ? record.expectedContent : (() => { throw new Error(`${path}.expectedContent: expected a string.`); })(),
    initialCursor: parseCursor(record.initialCursor, `${path}.initialCursor`),
    completionRule: parseCompletionRule(record.completionRule, `${path}.completionRule`),
    supportedModes,
    targetDurationMs: readRequiredNumber(record, "targetDurationMs", path),
    version: readRequiredNumber(record, "version", path),
    isPublished: publicationFlag,
    ...(displayOrder === undefined ? {} : { displayOrder }),
    skills: readArray(record.skills, `${path}.skills`).map((skill, index) =>
      parseExerciseSkill(skill, `${path}.skills[${index}]`),
    ),
    solutions: readArray(record.solutions, `${path}.solutions`).map((solution, index) =>
      parseSolution(solution, `${path}.solutions[${index}]`),
    ),
    hints: readArray(record.hints, `${path}.hints`).map((hint, index) =>
      parseHint(hint, `${path}.hints[${index}]`),
    ),
  };
}

function parseUnit(value: unknown, path: string): CatalogUnit {
  const record = readRecord(value, path);
  const difficulty = record.difficulty;
  if (!isOneOf(difficulty, DIFFICULTIES)) {
    throw new Error(`${path}.difficulty: expected a supported difficulty.`);
  }
  const publicationFlag = record.isPublished ?? record.published;
  if (typeof publicationFlag !== "boolean") {
    throw new Error(`${path}.isPublished: expected a boolean.`);
  }
  return {
    slug: readRequiredString(record, "slug", path),
    title: readRequiredString(record, "title", path),
    description: readRequiredString(record, "description", path),
    difficulty,
    estimatedMinutes: readRequiredNumber(record, "estimatedMinutes", path),
    displayOrder: readRequiredNumber(record, "displayOrder", path),
    isPublished: publicationFlag,
    skills: readArray(record.skills, `${path}.skills`).map((skill, index) =>
      parseSkill(skill, `${path}.skills[${index}]`),
    ),
    exercises: readArray(record.exercises, `${path}.exercises`).map((exercise, index) =>
      parseExercise(exercise, `${path}.exercises[${index}]`),
    ),
  };
}

export function parseCatalogSnapshot(input: unknown): CatalogSnapshot {
  const record = readRecord(input, "catalog");
  if (record.schemaVersion !== 1) {
    throw new Error("schemaVersion: expected version 1.");
  }
  const units = readArray(record.units, "units").map((unit, index) =>
    parseUnit(unit, `units[${index}]`),
  );
  const snapshot: CatalogSnapshot = {
    schemaVersion: 1,
    catalogRevision: readRequiredNumber(record, "catalogRevision", "catalog"),
    catalogHash: readRequiredString(record, "catalogHash", "catalog"),
    exportedAt: readRequiredString(record, "exportedAt", "catalog"),
    units,
  };
  const errors = validateCatalogSnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  }
  return snapshot;
}

function addError(
  errors: CatalogValidationError[],
  path: string,
  message: string,
): void {
  errors.push({ path, message });
}

function validateCursor(
  value: unknown,
  path: string,
  content: string | undefined,
  errors: CatalogValidationError[],
): value is CursorPosition {
  if (!isRecord(value)) {
    addError(errors, path, "expected an object with line and column.");
    return false;
  }
  if (!isNonNegativeInteger(value.line)) {
    addError(errors, `${path}.line`, "expected a non-negative integer.");
  }
  if (!isNonNegativeInteger(value.column)) {
    addError(errors, `${path}.column`, "expected a non-negative integer.");
  }
  if (!isNonNegativeInteger(value.line) || !isNonNegativeInteger(value.column)) {
    return false;
  }
  if (content !== undefined) {
    const lines = content.split(/\r?\n/);
    const line = lines[value.line];
    if (line === undefined) {
      addError(errors, `${path}.line`, "line is outside the initial content.");
    } else if (value.column > line.length) {
      addError(errors, `${path}.column`, "column is outside the initial content line.");
    }
  }
  return true;
}

function validateCompletionRule(
  value: unknown,
  path: string,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, path, "expected a completion rule object.");
    return;
  }
  if (value.contentMatch !== "exact" && value.contentMatch !== "unchanged") {
    addError(errors, `${path}.contentMatch`, "expected exact or unchanged.");
  }
  if (!isRecord(value.cursorMatch)) {
    addError(errors, `${path}.cursorMatch`, "expected a cursor match object.");
  } else if (value.cursorMatch.type === "ignore") {
    // no further fields are needed
  } else if (value.cursorMatch.type === "exact") {
    validateCursor(value.cursorMatch, `${path}.cursorMatch`, undefined, errors);
  } else if (value.cursorMatch.type === "range") {
    validateCursor(value.cursorMatch.start, `${path}.cursorMatch.start`, undefined, errors);
    validateCursor(value.cursorMatch.end, `${path}.cursorMatch.end`, undefined, errors);
  } else {
    addError(errors, `${path}.cursorMatch.type`, "expected ignore, exact, or range.");
  }
  if (value.requiredMode !== undefined && !isOneOf(value.requiredMode, VIM_MODES)) {
    addError(errors, `${path}.requiredMode`, "expected a supported Vim mode.");
  }
}

function validateActions(
  actions: unknown,
  path: string,
  errors: CatalogValidationError[],
): void {
  if (!Array.isArray(actions)) {
    addError(errors, path, "expected an array of normalized actions.");
    return;
  }
  actions.forEach((value, index) => {
    const actionPath = `${path}[${index}]`;
    if (!isRecord(value) || typeof value.type !== "string") {
      addError(errors, actionPath, "expected a normalized action.");
      return;
    }
    if (value.type === "vim_command") {
      if (typeof value.command !== "string") addError(errors, `${actionPath}.command`, "expected a string.");
    } else if (value.type === "insert_text") {
      if (typeof value.text !== "string") addError(errors, `${actionPath}.text`, "expected a string.");
      if (!isNonNegativeInteger(value.textLength)) addError(errors, `${actionPath}.textLength`, "expected a non-negative integer.");
    } else if (value.type === "mode_change") {
      if (!isOneOf(value.mode, VIM_MODES)) addError(errors, `${actionPath}.mode`, "expected a supported Vim mode.");
    } else if (value.type === "undo" || value.type === "reset") {
      // no payload
    } else if (value.type === "search") {
      if (typeof value.query !== "string") addError(errors, `${actionPath}.query`, "expected a string.");
      if (value.direction !== "forward" && value.direction !== "backward") addError(errors, `${actionPath}.direction`, "expected forward or backward.");
    } else {
      addError(errors, `${actionPath}.type`, "unknown normalized action type.");
    }
  });
}

function validateExercise(
  exercise: CatalogExercise,
  path: string,
  unitSkills: ReadonlySet<string>,
  globalExerciseSlugs: Set<string>,
  errors: CatalogValidationError[],
): void {
  const value: unknown = exercise;
  if (!isRecord(value)) {
    addError(errors, path, "expected an exercise object.");
    return;
  }
  if (!isNonEmptyString(value.slug)) {
    addError(errors, `${path}.slug`, "expected a non-empty stable slug.");
  } else {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) {
      addError(errors, `${path}.slug`, "must contain lowercase letters, numbers, and hyphens only.");
    }
    if (globalExerciseSlugs.has(value.slug)) {
      addError(errors, `${path}.slug`, `duplicate exercise slug '${value.slug}'.`);
    }
    globalExerciseSlugs.add(value.slug);
  }
  ["title", "instruction"].forEach((key) => {
    if (!isNonEmptyString(value[key])) addError(errors, `${path}.${key}`, "expected a non-empty string.");
  });
  if (!isOneOf(value.language, SUPPORTED_LANGUAGES)) addError(errors, `${path}.language`, "unsupported language.");
  if (!isOneOf(value.exerciseType, EXERCISE_TYPES)) addError(errors, `${path}.exerciseType`, "unsupported exercise type.");
  if (!isOneOf(value.difficulty, DIFFICULTIES)) addError(errors, `${path}.difficulty`, "unsupported difficulty.");
  if (typeof value.initialContent !== "string") addError(errors, `${path}.initialContent`, "expected a string.");
  if (typeof value.expectedContent !== "string") addError(errors, `${path}.expectedContent`, "expected a string.");
  const publicationFlag = value.isPublished ?? value.published;
  if (typeof publicationFlag !== "boolean") addError(errors, `${path}.isPublished`, "expected a boolean.");
  if (!isPositiveInteger(value.targetDurationMs)) addError(errors, `${path}.targetDurationMs`, "expected a positive integer.");
  if (!isPositiveInteger(value.version)) addError(errors, `${path}.version`, "expected a positive integer.");
  if (value.displayOrder !== undefined && !isNonNegativeInteger(value.displayOrder)) addError(errors, `${path}.displayOrder`, "expected a non-negative integer.");

  validateCursor(value.initialCursor, `${path}.initialCursor`, typeof value.initialContent === "string" ? value.initialContent : undefined, errors);
  validateCompletionRule(value.completionRule, `${path}.completionRule`, errors);

  if (!Array.isArray(value.supportedModes) || value.supportedModes.length === 0) {
    addError(errors, `${path}.supportedModes`, "at least one learning mode is required.");
  } else {
    const modes = new Set<string>();
    value.supportedModes.forEach((mode, index) => {
      if (!isOneOf(mode, LEARNING_MODES)) addError(errors, `${path}.supportedModes[${index}]`, "unsupported learning mode.");
      if (typeof mode === "string" && modes.has(mode)) addError(errors, `${path}.supportedModes[${index}]`, "duplicate learning mode.");
      if (typeof mode === "string") modes.add(mode);
    });
  }

  if (!Array.isArray(value.skills) || value.skills.length === 0) {
    addError(errors, `${path}.skills`, "at least one skill relationship is required.");
  } else {
    const skillSlugs = new Set<string>();
    let totalWeight = 0;
    let primaryCount = 0;
    value.skills.forEach((skill, index) => {
      const skillPath = `${path}.skills[${index}]`;
      if (!isRecord(skill)) {
        addError(errors, skillPath, "expected a skill relationship object.");
        return;
      }
      const skillSlug = skill.skillSlug ?? skill.slug ?? skill.skillId;
      if (!isNonEmptyString(skillSlug)) addError(errors, `${skillPath}.skillSlug`, "expected a skill slug.");
      else {
        if (skillSlugs.has(skillSlug)) addError(errors, `${skillPath}.skillSlug`, "duplicate skill relationship.");
        skillSlugs.add(skillSlug);
        if (!unitSkills.has(skillSlug)) addError(errors, `${skillPath}.skillSlug`, "skill is not declared by the unit.");
      }
      if (typeof skill.weight !== "number" || !Number.isFinite(skill.weight) || skill.weight <= 0 || skill.weight > 1) addError(errors, `${skillPath}.weight`, "weight must be greater than 0 and no greater than 1.");
      else totalWeight += skill.weight;
      if (typeof skill.primary !== "boolean") addError(errors, `${skillPath}.primary`, "expected a boolean.");
      else if (skill.primary) primaryCount += 1;
    });
    if (Math.abs(totalWeight - 1) > 1e-9) addError(errors, `${path}.skills`, "skill weights must sum to 1.");
    if (primaryCount !== 1) addError(errors, `${path}.skills`, "exactly one primary skill is required.");
  }

  if (!Array.isArray(value.solutions) || value.solutions.length === 0) {
    addError(errors, `${path}.solutions`, "at least one solution is required.");
  } else {
    let recommendedCount = 0;
    value.solutions.forEach((solution, index) => {
      const solutionPath = `${path}.solutions[${index}]`;
      if (!isRecord(solution)) {
        addError(errors, solutionPath, "expected a solution object.");
        return;
      }
      if (!isNonEmptyString(solution.sequence)) addError(errors, `${solutionPath}.sequence`, "expected a non-empty string.");
      if (!isNonEmptyString(solution.explanation)) addError(errors, `${solutionPath}.explanation`, "expected a non-empty string.");
      if (!isPositiveInteger(solution.keystrokeCount)) addError(errors, `${solutionPath}.keystrokeCount`, "expected a positive integer.");
      if (typeof solution.recommended !== "boolean") addError(errors, `${solutionPath}.recommended`, "expected a boolean.");
      else if (solution.recommended) recommendedCount += 1;
      if (solution.displayOrder !== undefined && !isNonNegativeInteger(solution.displayOrder)) addError(errors, `${solutionPath}.displayOrder`, "expected a non-negative integer.");
      validateActions(solution.normalizedActions, `${solutionPath}.normalizedActions`, errors);
    });
    if (recommendedCount !== 1) addError(errors, `${path}.solutions`, "exactly one recommended solution is required.");
  }

  if (!Array.isArray(value.hints)) {
    addError(errors, `${path}.hints`, "expected an array of hints.");
  } else {
    const levels = new Set<number>();
    value.hints.forEach((hint, index) => {
      const hintPath = `${path}.hints[${index}]`;
      if (!isRecord(hint)) {
        addError(errors, hintPath, "expected a hint object.");
        return;
      }
      if (hint.level !== 1 && hint.level !== 2 && hint.level !== 3 && hint.level !== 4) addError(errors, `${hintPath}.level`, "hint level must be between 1 and 4.");
      else if (levels.has(hint.level)) addError(errors, `${hintPath}.level`, "duplicate hint level.");
      else levels.add(hint.level);
      if (!isNonEmptyString(hint.content)) addError(errors, `${hintPath}.content`, "expected a non-empty string.");
      if (hint.commandPreview !== null && typeof hint.commandPreview !== "string") addError(errors, `${hintPath}.commandPreview`, "expected a string or null.");
    });
  }
}

function validateUnit(
  unit: CatalogUnit,
  path: string,
  globalUnitSlugs: Set<string>,
  globalSkillSlugs: Set<string>,
  globalExerciseSlugs: Set<string>,
  displayOrders: Set<number>,
  errors: CatalogValidationError[],
): void {
  const value: unknown = unit;
  if (!isRecord(value)) {
    addError(errors, path, "expected a unit object.");
    return;
  }
  if (!isNonEmptyString(value.slug)) addError(errors, `${path}.slug`, "expected a non-empty stable slug.");
  else {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) addError(errors, `${path}.slug`, "must contain lowercase letters, numbers, and hyphens only.");
    if (globalUnitSlugs.has(value.slug)) addError(errors, `${path}.slug`, `duplicate unit slug '${value.slug}'.`);
    globalUnitSlugs.add(value.slug);
  }
  if (!isNonEmptyString(value.title)) addError(errors, `${path}.title`, "expected a non-empty string.");
  if (!isNonEmptyString(value.description)) addError(errors, `${path}.description`, "expected a non-empty string.");
  if (!isOneOf(value.difficulty, DIFFICULTIES)) addError(errors, `${path}.difficulty`, "unsupported difficulty.");
  if (!isPositiveInteger(value.estimatedMinutes)) addError(errors, `${path}.estimatedMinutes`, "expected a positive integer.");
  if (!isPositiveInteger(value.displayOrder)) addError(errors, `${path}.displayOrder`, "expected a positive integer.");
  else if (displayOrders.has(value.displayOrder)) addError(errors, `${path}.displayOrder`, "duplicate unit display order.");
  else displayOrders.add(value.displayOrder);
  const publicationFlag = value.isPublished ?? value.published;
  if (typeof publicationFlag !== "boolean") addError(errors, `${path}.isPublished`, "expected a boolean.");

  const unitSkillSlugs = new Set<string>();
  if (!Array.isArray(value.skills) || value.skills.length === 0) addError(errors, `${path}.skills`, "at least one skill definition is required.");
  else {
    value.skills.forEach((skill, index) => {
      const skillPath = `${path}.skills[${index}]`;
      if (!isRecord(skill)) {
        addError(errors, skillPath, "expected a skill definition object.");
        return;
      }
      if (!isNonEmptyString(skill.slug)) addError(errors, `${skillPath}.slug`, "expected a non-empty stable slug.");
      else {
        if (unitSkillSlugs.has(skill.slug)) addError(errors, `${skillPath}.slug`, `duplicate skill slug '${skill.slug}'.`);
        if (globalSkillSlugs.has(skill.slug)) addError(errors, `${skillPath}.slug`, `duplicate catalog skill slug '${skill.slug}'.`);
        unitSkillSlugs.add(skill.slug);
        globalSkillSlugs.add(skill.slug);
      }
      if (!isNonEmptyString(skill.name)) addError(errors, `${skillPath}.name`, "expected a non-empty string.");
      if (!isNonEmptyString(skill.description)) addError(errors, `${skillPath}.description`, "expected a non-empty string.");
      if (!isOneOf(skill.category, SKILL_CATEGORIES)) addError(errors, `${skillPath}.category`, "unsupported skill category.");
      if (!isOneOf(skill.difficulty, DIFFICULTIES)) addError(errors, `${skillPath}.difficulty`, "unsupported difficulty.");
      if (skill.primary !== undefined && typeof skill.primary !== "boolean") addError(errors, `${skillPath}.primary`, "expected a boolean.");
      if (skill.displayOrder !== undefined && !isNonNegativeInteger(skill.displayOrder)) addError(errors, `${skillPath}.displayOrder`, "expected a non-negative integer.");
    });
  }

  if (!Array.isArray(value.exercises) || value.exercises.length === 0) addError(errors, `${path}.exercises`, "at least one explicit exercise is required.");
  else value.exercises.forEach((exercise, index) => validateExercise(exercise as CatalogExercise, `${path}.exercises[${index}]`, unitSkillSlugs, globalExerciseSlugs, errors));
}

function canonicalExerciseWithoutSlug(exercise: CatalogExercise): string {
  // Slugs identify an exercise, while publication/version/order fields are
  // administrative metadata. Keep the complete teaching and evaluation
  // payload in the fingerprint, including solution actions and explanations,
  // but omit those metadata fields at every relevant level.
  return canonicalizeValue({
    title: exercise.title,
    instruction: exercise.instruction,
    language: exercise.language,
    exerciseType: exercise.exerciseType,
    difficulty: exercise.difficulty,
    initialContent: exercise.initialContent,
    expectedContent: exercise.expectedContent,
    initialCursor: exercise.initialCursor,
    completionRule: exercise.completionRule,
    supportedModes: exercise.supportedModes,
    targetDurationMs: exercise.targetDurationMs,
    skills: exercise.skills,
    solutions: Array.isArray(exercise.solutions)
      ? exercise.solutions.map((solution) => {
        if (!isRecord(solution)) return solution;
        return Object.fromEntries(
          Object.entries(solution).filter(([key]) => key !== "displayOrder"),
        );
      })
      : exercise.solutions,
    hints: exercise.hints,
  });
}

function normalizedContent(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\d+/gu, "")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizedContent(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizedContent(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap / new Set([...leftTokens, ...rightTokens]).size;
}

function stableExerciseMetadata(exercise: CatalogExercise): string {
  return canonicalizeValue({
    language: exercise.language,
    exerciseType: exercise.exerciseType,
    difficulty: exercise.difficulty,
    initialCursor: exercise.initialCursor,
    completionRule: exercise.completionRule,
    supportedModes: exercise.supportedModes,
    targetDurationMs: exercise.targetDurationMs,
    skills: exercise.skills,
  });
}

function likelyChangedContentRename(before: CatalogExercise, after: CatalogExercise): boolean {
  if (stableExerciseMetadata(before) !== stableExerciseMetadata(after)) return false;
  const similarity = [
    tokenSimilarity(before.title, after.title),
    tokenSimilarity(before.instruction, after.instruction),
    tokenSimilarity(before.initialContent, after.initialContent),
    tokenSimilarity(before.expectedContent, after.expectedContent),
  ];
  const average = similarity.reduce((sum, value) => sum + value, 0) / similarity.length;
  return similarity[0] !== undefined && similarity[0] >= 0.35 && average >= 0.66;
}

/** Review content diversity without making intentional ordinal variants invalid. */
export function reviewCatalogContent(snapshot: CatalogSnapshot): {
  warnings: readonly CatalogContentWarning[];
} {
  const warnings: CatalogContentWarning[] = [];
  const exercises = snapshot.units.flatMap((unit, unitIndex) =>
    unit.exercises.map((exercise, exerciseIndex) => ({ exercise, unitIndex, exerciseIndex })),
  );
  for (let leftIndex = 0; leftIndex < exercises.length; leftIndex += 1) {
    const left = exercises[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < exercises.length; rightIndex += 1) {
      const right = exercises[rightIndex];
      if (right === undefined) continue;
      if (canonicalExerciseWithoutSlug(left.exercise) === canonicalExerciseWithoutSlug(right.exercise)) continue;
      const normalizedFields = ["title", "instruction", "initialContent", "expectedContent"] as const;
      const ordinalOnly = normalizedFields.every((field) =>
        normalizedContent(left.exercise[field]) === normalizedContent(right.exercise[field]),
      );
      const similarity = normalizedFields.reduce(
        (sum, field) => sum + tokenSimilarity(left.exercise[field], right.exercise[field]),
        0,
      ) / normalizedFields.length;
      if (ordinalOnly || similarity >= 0.82) {
        warnings.push({
          path: `units[${right.unitIndex}].exercises[${right.exerciseIndex}]`,
          message: ordinalOnly
            ? `exercise content is an ordinal-only duplicate of '${left.exercise.slug}'; create a distinct scenario or use --strict-content-diversity to reject warnings.`
            : `exercise content is suspiciously similar to '${left.exercise.slug}'; review scenario diversity or use --strict-content-diversity to reject warnings.`,
        });
      }
    }
  }
  return { warnings };
}

export function validateCatalogSnapshot(
  snapshot: CatalogSnapshot,
  previous?: CatalogSnapshot,
): readonly CatalogValidationError[] {
  const errors: CatalogValidationError[] = [];
  const root: unknown = snapshot;
  if (!isRecord(root)) {
    return [{ path: "catalog", message: "expected a catalog snapshot object." }];
  }
  if (root.schemaVersion !== 1) addError(errors, "schemaVersion", "expected version 1.");
  if (!isPositiveInteger(root.catalogRevision)) addError(errors, "catalogRevision", "expected a positive integer.");
  if (typeof root.catalogHash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(root.catalogHash)) addError(errors, "catalogHash", "expected a sha256 hash.");
  if (typeof root.exportedAt !== "string" || Number.isNaN(Date.parse(root.exportedAt))) addError(errors, "exportedAt", "expected an ISO timestamp.");
  if (!Array.isArray(root.units)) {
    addError(errors, "units", "expected an array of units.");
  } else {
    const unitSlugs = new Set<string>();
    const skillSlugs = new Set<string>();
    const exerciseSlugs = new Set<string>();
    const displayOrders = new Set<number>();
    root.units.forEach((unit, index) => validateUnit(unit as CatalogUnit, `units[${index}]`, unitSlugs, skillSlugs, exerciseSlugs, displayOrders, errors));
  }

  if (previous !== undefined) {
    const nextUnitSlugs = new Set(snapshot.units.map((unit) => unit.slug));
    for (const unit of previous.units) {
      if (!nextUnitSlugs.has(unit.slug)) {
        addError(errors, "units", `base unit '${unit.slug}' is omitted; keep every base unit and unpublish exercises explicitly.`);
      }
    }
    const beforeExercises = previous.units.flatMap((unit) => unit.exercises);
    const afterExercises = snapshot.units.flatMap((unit) => unit.exercises);
    const beforeSlugs = new Set(beforeExercises.map((exercise) => exercise.slug));
    const afterSlugs = new Set(afterExercises.map((exercise) => exercise.slug));
    const removed = beforeExercises.filter((exercise) => !afterSlugs.has(exercise.slug));
    const added = afterExercises.filter((exercise) => !beforeSlugs.has(exercise.slug));
    const addedIdentities = new Set(added.map(canonicalExerciseWithoutSlug));
    if (removed.some((exercise) => addedIdentities.has(canonicalExerciseWithoutSlug(exercise)))) {
      addError(errors, "units", "renamed existing exercise slugs are not supported.");
    }
    // Compare every removed exercise with every added candidate. A stable slug
    // rename can move between units, so restricting this heuristic to matching
    // units would allow changed-content renames to evade review.
    for (const before of removed) {
      for (const after of added) {
        if (likelyChangedContentRename(before, after)) {
          const afterUnitIndex = snapshot.units.findIndex((unit) =>
            unit.exercises.some((exercise) => exercise.slug === after.slug),
          );
          addError(errors, `units[${afterUnitIndex}].exercises`, `exercise '${before.slug}' appears to have been renamed to '${after.slug}' with changed content; preserve the original slug, or document an intentional remove-and-add with clearly different metadata.`);
        }
      }
    }
  }
  const contentKeys = new Map<string, string>();
  if (Array.isArray(root.units)) {
    root.units.forEach((unit, unitIndex) => {
      if (!isRecord(unit) || !Array.isArray(unit.exercises)) return;
      unit.exercises.forEach((exercise, exerciseIndex) => {
        if (!isRecord(exercise)) return;
        const parsedExercise = exercise as unknown as CatalogExercise;
        const key = canonicalExerciseWithoutSlug(parsedExercise);
        const previousPath = contentKeys.get(key);
        if (previousPath !== undefined) {
          addError(errors, `units[${unitIndex}].exercises[${exerciseIndex}]`, `exact duplicate exercise content; already defined at ${previousPath}. Use a distinct scenario and stable slug.`);
        } else {
          contentKeys.set(key, `units[${unitIndex}].exercises[${exerciseIndex}]`);
        }
      });
    });
  }
  return errors;
}

export function exerciseVersionChanged(
  before: CatalogExercise,
  after: CatalogExercise,
): boolean {
  const beforeOwned = {
    title: before.title,
    instruction: before.instruction,
    language: before.language,
    exerciseType: before.exerciseType,
    difficulty: before.difficulty,
    initialContent: before.initialContent,
    expectedContent: before.expectedContent,
    initialCursor: before.initialCursor,
    completionRule: before.completionRule,
    supportedModes: before.supportedModes,
    targetDurationMs: before.targetDurationMs,
    skills: before.skills,
    solutions: before.solutions.map((solution) => ({
      sequence: solution.sequence,
      normalizedActions: solution.normalizedActions,
      keystrokeCount: solution.keystrokeCount,
      recommended: solution.recommended,
      explanation: solution.explanation,
    })),
    hints: before.hints,
  };
  const afterOwned = {
    title: after.title,
    instruction: after.instruction,
    language: after.language,
    exerciseType: after.exerciseType,
    difficulty: after.difficulty,
    initialContent: after.initialContent,
    expectedContent: after.expectedContent,
    initialCursor: after.initialCursor,
    completionRule: after.completionRule,
    supportedModes: after.supportedModes,
    targetDurationMs: after.targetDurationMs,
    skills: after.skills,
    solutions: after.solutions.map((solution) => ({
      sequence: solution.sequence,
      normalizedActions: solution.normalizedActions,
      keystrokeCount: solution.keystrokeCount,
      recommended: solution.recommended,
      explanation: solution.explanation,
    })),
    hints: after.hints,
  };
  return canonicalizeValue(beforeOwned) !== canonicalizeValue(afterOwned);
}
