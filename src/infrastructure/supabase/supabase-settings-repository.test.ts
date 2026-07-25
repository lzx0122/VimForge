import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { LocalSettings } from "../indexed-db/settings-repository";
import { SupabaseSettingsRepository } from "./supabase-settings-repository";
import type { Database } from "./database.types";

let clientCount = 0;

function settings(overrides: Partial<LocalSettings> = {}): LocalSettings {
  return {
    editorFontSize: 18,
    showLineNumbers: true,
    showKeypresses: false,
    preferredQuestionCount: 10,
    lastLearningMode: "efficiency",
    updatedAt: "2026-07-16T08:00:00.000Z",
    ...overrides,
  };
}

function createMockClient(): {
  client: SupabaseClient<Database>;
  requests: Request[];
} {
  const requests: Request[] = [];
  clientCount += 1;
  const mockFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createClient<Database>(
    "https://settings-sync-test.supabase.co",
    "sb_publishable_settings_sync_test_key",
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
        storageKey: `settings-sync-test-${clientCount}`,
      },
      global: { fetch: mockFetch },
    },
  );

  return { client, requests };
}

describe("SupabaseSettingsRepository", () => {
  it("upserts settings without writing sound_enabled", async () => {
    const { client, requests } = createMockClient();
    const repository = new SupabaseSettingsRepository(client);

    await repository.save("user-1", settings());

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request).toBeDefined();
    const body: unknown = await request?.json();

    expect(body).toMatchObject({
      user_id: "user-1",
      editor_font_size: 18,
      show_line_numbers: true,
      show_keypresses: false,
      preferred_question_count: 10,
      last_learning_mode: "efficiency",
    });
    expect(body).not.toHaveProperty("sound_enabled");
    expect(JSON.stringify(body)).not.toContain("sound_enabled");
  });
});
