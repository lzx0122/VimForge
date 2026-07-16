export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type CatalogTable<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type LearningUnitRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: string;
  estimated_minutes: number;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

type SkillRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  created_at: string;
  updated_at: string;
};

type UnitSkillRow = {
  unit_id: string;
  skill_id: string;
  is_primary: boolean;
  display_order: number;
};

type ExerciseRow = {
  id: string;
  unit_id: string;
  slug: string;
  title: string;
  instruction: string;
  language: string;
  exercise_type: string;
  difficulty: string;
  initial_content: string;
  expected_content: string;
  initial_cursor: Json;
  completion_rule: Json;
  supported_modes: string[];
  target_duration_ms: number;
  version: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

type ExerciseSkillRow = {
  exercise_id: string;
  skill_id: string;
  weight: number;
  is_primary: boolean;
};

type ExerciseSolutionRow = {
  id: string;
  exercise_id: string;
  sequence: string;
  normalized_actions: Json;
  keystroke_count: number;
  is_recommended: boolean;
  explanation: string;
  display_order: number;
  created_at: string;
};

type ExerciseHintRow = {
  id: string;
  exercise_id: string;
  level: number;
  content: string;
  command_preview: string | null;
  created_at: string;
};

type UserSettingsRow = {
  user_id: string;
  editor_font_size: number;
  show_line_numbers: boolean;
  show_keypresses: boolean;
  sound_enabled: boolean;
  preferred_question_count: number;
  last_learning_mode: string | null;
  created_at: string;
  updated_at: string;
};

type UserSettingsTable = {
  Row: UserSettingsRow;
  Insert: {
    user_id: string;
    editor_font_size: number;
    show_line_numbers: boolean;
    show_keypresses: boolean;
    sound_enabled: boolean;
    preferred_question_count: number;
    last_learning_mode: string | null;
    updated_at: string;
  };
  Update: Partial<Omit<UserSettingsRow, "user_id" | "created_at">>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      learning_units: CatalogTable<LearningUnitRow>;
      skills: CatalogTable<SkillRow>;
      unit_skills: CatalogTable<UnitSkillRow>;
      exercises: CatalogTable<ExerciseRow>;
      exercise_skills: CatalogTable<ExerciseSkillRow>;
      exercise_solutions: CatalogTable<ExerciseSolutionRow>;
      exercise_hints: CatalogTable<ExerciseHintRow>;
      user_settings: UserSettingsTable;
    };
    Views: Record<string, never>;
    Functions: {
      record_exercise_attempt: {
        Args: { payload: Json };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
