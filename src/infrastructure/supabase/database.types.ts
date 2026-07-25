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
  display_order: number;
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

export type ExerciseAttemptRow = {
  id: string;
  client_attempt_id: string;
  user_id: string;
  session_id: string | null;
  exercise_id: string;
  exercise_version: number;
  learning_mode: string;
  source: string;
  completed: boolean;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  keystroke_count: number;
  recommended_keystroke_count: number | null;
  mistake_count: number;
  undo_count: number;
  reset_count: number;
  hint_level_used: number;
  used_recommended_solution: boolean;
  normalized_actions: Json;
  speed_score: number | null;
  accuracy_score: number;
  scoring_version: string;
  performance_quality: number;
  practice_context: string;
  created_at: string;
};

export type UserSkillMasteryRow = {
  user_id: string;
  skill_id: string;
  mastery_level: number;
  mastery_score: number;
  successful_attempts: number;
  failed_attempts: number;
  unique_exercises_completed: number;
  unique_exercise_ids: string[];
  consecutive_successes: number;
  average_speed_score: number | null;
  average_accuracy_score: number | null;
  average_hint_level: number | null;
  first_unhinted_success_at: string | null;
  latest_unhinted_success_at: string | null;
  last_practiced_at: string | null;
  last_success_at: string | null;
  updated_at: string;
};

export type UserReviewItemRow = {
  user_id: string;
  exercise_id: string;
  skill_id: string;
  review_status: string;
  priority: number;
  current_interval_days: number;
  due_at: string;
  last_reviewed_at: string | null;
  last_result: string | null;
  mastery_level: number;
  last_performance_quality: number;
  last_attempt_at: string;
  updated_at: string;
};

export type UserSettingsRow = {
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
      exercise_attempts: CatalogTable<ExerciseAttemptRow>;
      user_skill_mastery: CatalogTable<UserSkillMasteryRow>;
      user_review_items: CatalogTable<UserReviewItemRow>;
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
