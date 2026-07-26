import type { SupabaseClient } from "@supabase/supabase-js";

import type { LocalSettings } from "../indexed-db/settings-repository";
import { getSupabaseBrowserClient } from "./client";
import { mapCloudSettings } from "./cloud-learning-state-mapper";
import type { Database, UserSettingsRow } from "./database.types";

const SETTINGS_COLUMNS = [
  "editor_font_size",
  "show_line_numbers",
  "show_keypresses",
  "preferred_question_count",
  "last_learning_mode",
  "updated_at",
].join(",");

/**
 * postgrest-js can't narrow a hand-maintained Database type's row shape
 * from a narrower select() column string; SETTINGS_COLUMNS above includes
 * every field mapCloudSettings() actually reads, so this cast asserts a
 * shape the runtime data genuinely has.
 */
function asRow<TRow>(value: unknown): TRow {
  return value as TRow;
}

export class SupabaseSettingsRepository {
  public constructor(
    private readonly client: SupabaseClient<Database> | null = null,
  ) {}

  /**
   * sound_enabled is a per-device preference, never synced with the
   * cloud - it is deliberately excluded from both this query and save().
   */
  public async get(userId: string): Promise<LocalSettings | null> {
    const client = this.client ?? getSupabaseBrowserClient();
    const { data, error } = await client
      .from("user_settings")
      .select(SETTINGS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error !== null) {
      throw new Error("Unable to load cloud settings.", { cause: error });
    }
    if (data === null) {
      return null;
    }

    return {
      ...mapCloudSettings(asRow<UserSettingsRow>(data)),
      soundEnabled: false,
    };
  }

  public async save(userId: string, settings: LocalSettings): Promise<void> {
    const client = this.client ?? getSupabaseBrowserClient();
    const { error } = await client.from("user_settings").upsert(
      {
        user_id: userId,
        editor_font_size: settings.editorFontSize,
        show_line_numbers: settings.showLineNumbers,
        show_keypresses: settings.showKeypresses,
        preferred_question_count: settings.preferredQuestionCount,
        last_learning_mode: settings.lastLearningMode,
        updated_at: settings.updatedAt,
      },
      { onConflict: "user_id" },
    );

    if (error !== null) {
      throw new Error("Unable to synchronize settings with Supabase.", {
        cause: error,
      });
    }
  }
}
