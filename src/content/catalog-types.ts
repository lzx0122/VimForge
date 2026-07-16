import type {
  CompletionRule,
  Difficulty,
  ExerciseType,
  SupportedLanguage,
} from "../types";
import type { CursorPosition, LearningMode, VimMode } from "../types";
import type { NormalizedAction } from "../types";

export const SKILL_CATEGORIES = [
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

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** A skill definition is declared once under its owning unit. */
export interface CatalogSkill {
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  difficulty: Difficulty;
  /** Optional presentation metadata used by the unit_skills relation. */
  primary?: boolean;
  displayOrder?: number;
}

/** A weighted relationship between an exercise and one of its unit skills. */
export interface CatalogExerciseSkill {
  skillSlug: string;
  weight: number;
  primary: boolean;
}

export interface CatalogSolution {
  sequence: string;
  normalizedActions: NormalizedAction[];
  keystrokeCount: number;
  recommended: boolean;
  explanation: string;
  displayOrder?: number;
}

export interface CatalogHint {
  level: Exclude<0 | 1 | 2 | 3 | 4, 0>;
  content: string;
  commandPreview: string | null;
}

export interface CatalogExercise {
  slug: string;
  title: string;
  instruction: string;
  language: SupportedLanguage;
  exerciseType: ExerciseType;
  difficulty: Difficulty;
  initialContent: string;
  expectedContent: string;
  initialCursor: CursorPosition;
  completionRule: CompletionRule;
  supportedModes: LearningMode[];
  targetDurationMs: number;
  version: number;
  isPublished: boolean;
  /** Display ordering is intentionally not part of exercise versioning. */
  displayOrder?: number;
  skills: CatalogExerciseSkill[];
  solutions: CatalogSolution[];
  hints: CatalogHint[];
}

export interface CatalogUnit {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  displayOrder: number;
  isPublished: boolean;
  skills: CatalogSkill[];
  exercises: CatalogExercise[];
}

export interface CatalogSnapshot {
  schemaVersion: 1;
  catalogRevision: number;
  catalogHash: string;
  exportedAt: string;
  units: CatalogUnit[];
}

export interface CatalogValidationError {
  path: string;
  message: string;
}

export type CatalogValue =
  | null
  | boolean
  | number
  | string
  | CatalogValue[]
  | { [key: string]: CatalogValue };

export type CatalogExerciseOwnedFields = Pick<
  CatalogExercise,
  | "title"
  | "instruction"
  | "language"
  | "exerciseType"
  | "difficulty"
  | "initialContent"
  | "expectedContent"
  | "initialCursor"
  | "completionRule"
  | "supportedModes"
  | "targetDurationMs"
  | "skills"
  | "solutions"
  | "hints"
>;

export type CatalogVimMode = VimMode;
