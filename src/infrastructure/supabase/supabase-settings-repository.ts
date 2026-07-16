import type { SupabaseClient } from "@supabase/supabase-js";

import type { LocalSettings } from "../indexed-db/settings-repository";
import { getSupabaseBrowserClient } from "./client";
import type { Database } from "./database.types";

export class SupabaseSettingsRepository {
  public constructor(
    private readonly client: SupabaseClient<Database> | null = null,
  ) {}

  public async save(userId: string, settings: LocalSettings): Promise<void> {
    const client = this.client ?? getSupabaseBrowserClient();
    const { error } = await client.from("user_settings").upsert(
      {
        user_id: userId,
        editor_font_size: settings.editorFontSize,
        show_line_numbers: settings.showLineNumbers,
        show_keypresses: settings.showKeypresses,
        sound_enabled: settings.soundEnabled,
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
