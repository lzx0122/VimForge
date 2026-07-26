import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { LocalSettings } from "../indexed-db/settings-repository";
import type { Database } from "./database.types";
import { SupabaseSettingsRepository } from "./supabase-settings-repository";

interface RecordedQuery {
  table: string;
  select: string | null;
  eq: { column: string; value: unknown } | null;
  maybeSingle: boolean;
  upsertPayload: Record<string, unknown> | null;
  upsertOptions: { onConflict: string } | null;
}

function emptyQuery(): RecordedQuery {
  return {
    table: "",
    select: null,
    eq: null,
    maybeSingle: false,
    upsertPayload: null,
    upsertOptions: null,
  };
}

function createFakeSupabaseClient(result: {
  data: unknown;
  error: { message: string } | null;
}): { client: SupabaseClient<Database>; query: RecordedQuery } {
  const query = emptyQuery();

  const client = {
    from(table: string) {
      query.table = table;
      return {
        select(columns: string) {
          query.select = columns;
          return {
            eq(column: string, value: unknown) {
              query.eq = { column, value };
              return {
                maybeSingle() {
                  query.maybeSingle = true;
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
        upsert(
          payload: Record<string, unknown>,
          options: { onConflict: string },
        ) {
          query.upsertPayload = payload;
          query.upsertOptions = options;
          return Promise.resolve(result);
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, query };
}

function settingsRow(): Record<string, unknown> {
  return {
    editor_font_size: 18,
    show_line_numbers: true,
    show_keypresses: false,
    preferred_question_count: 20,
    last_learning_mode: "efficiency",
    updated_at: "2026-07-16T08:01:00.000Z",
  };
}

function localSettings(
  overrides: Partial<LocalSettings> = {},
): LocalSettings {
  return {
    editorFontSize: 18,
    showLineNumbers: true,
    showKeypresses: false,
    soundEnabled: true,
    preferredQuestionCount: 20,
    lastLearningMode: "efficiency",
    updatedAt: "2026-07-16T08:01:00.000Z",
    ...overrides,
  };
}

describe("SupabaseSettingsRepository", () => {
  describe("get", () => {
    it("selects only the fields synced with the cloud, excluding sound_enabled", async () => {
      const { client, query } = createFakeSupabaseClient({
        data: settingsRow(),
        error: null,
      });
      const repository = new SupabaseSettingsRepository(client);

      await repository.get("user-1");

      expect(query.table).toBe("user_settings");
      expect(query.select).toBe(
        [
          "editor_font_size",
          "show_line_numbers",
          "show_keypresses",
          "preferred_question_count",
          "last_learning_mode",
          "updated_at",
        ].join(","),
      );
      expect(query.select).not.toContain("sound_enabled");
      expect(query.eq).toEqual({ column: "user_id", value: "user-1" });
    });

    it("maps a stored row into LocalSettings with soundEnabled forced to false", async () => {
      const { client } = createFakeSupabaseClient({
        data: settingsRow(),
        error: null,
      });
      const repository = new SupabaseSettingsRepository(client);

      await expect(repository.get("user-1")).resolves.toEqual({
        editorFontSize: 18,
        showLineNumbers: true,
        showKeypresses: false,
        soundEnabled: false,
        preferredQuestionCount: 20,
        lastLearningMode: "efficiency",
        updatedAt: "2026-07-16T08:01:00.000Z",
      });
    });

    it("returns null when no cloud settings row exists", async () => {
      const { client } = createFakeSupabaseClient({
        data: null,
        error: null,
      });
      const repository = new SupabaseSettingsRepository(client);

      await expect(repository.get("user-1")).resolves.toBeNull();
    });

    it("wraps a Supabase error with a cause", async () => {
      const { client } = createFakeSupabaseClient({
        data: null,
        error: { message: "network down" },
      });
      const repository = new SupabaseSettingsRepository(client);

      await expect(repository.get("user-1")).rejects.toThrow(
        "Unable to load cloud settings.",
      );
    });
  });

  describe("save", () => {
    it("upserts without sound_enabled, since it is a per-device preference", async () => {
      const { client, query } = createFakeSupabaseClient({
        data: null,
        error: null,
      });
      const repository = new SupabaseSettingsRepository(client);

      await repository.save("user-1", localSettings());

      expect(query.table).toBe("user_settings");
      expect(query.upsertPayload).toEqual({
        user_id: "user-1",
        editor_font_size: 18,
        show_line_numbers: true,
        show_keypresses: false,
        preferred_question_count: 20,
        last_learning_mode: "efficiency",
        updated_at: "2026-07-16T08:01:00.000Z",
      });
      expect(query.upsertOptions).toEqual({ onConflict: "user_id" });
    });

    it("wraps a Supabase error with a cause", async () => {
      const { client } = createFakeSupabaseClient({
        data: null,
        error: { message: "network down" },
      });
      const repository = new SupabaseSettingsRepository(client);

      await expect(
        repository.save("user-1", localSettings()),
      ).rejects.toThrow("Unable to synchronize settings with Supabase.");
    });
  });
});
