import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { SupabaseCourseRepository } from "./supabase-course-repository";
import type { Database } from "./database.types";
import { SupabaseExerciseRepository } from "./supabase-exercise-repository";

type ResponseResolver = (request: Request) => unknown;
let clientCount = 0;

function createMockClient(resolveResponse: ResponseResolver): {
  client: SupabaseClient<Database>;
  requests: Request[];
} {
  const requests: Request[] = [];
  clientCount += 1;
  const mockFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);

    return new Response(JSON.stringify(resolveResponse(request)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createClient<Database>(
    "https://catalog-test.supabase.co",
    "sb_publishable_catalog_test_key",
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
        storageKey: `catalog-repository-test-${clientCount}`,
      },
      global: { fetch: mockFetch },
    },
  );

  return { client, requests };
}

describe("SupabaseCourseRepository", () => {
  it("maps published unit summaries to the domain model", async () => {
    const { client, requests } = createMockClient(() => [
      {
        id: "unit-1",
        slug: "text-objects",
        title: "文字物件",
        description: "精準操作文字範圍。",
        difficulty: "advanced",
        estimated_minutes: 28,
        display_order: 8,
      },
    ]);
    const repository = new SupabaseCourseRepository(client);

    await expect(repository.listPublishedUnits()).resolves.toEqual([
      {
        id: "unit-1",
        slug: "text-objects",
        title: "文字物件",
        description: "精準操作文字範圍。",
        difficulty: "advanced",
        estimatedMinutes: 28,
        displayOrder: 8,
      },
    ]);

    const requestUrl = new URL(requests[0]?.url ?? "");
    expect(requestUrl.pathname).toBe("/rest/v1/learning_units");
    expect(requestUrl.searchParams.get("is_published")).toBe("eq.true");
    expect(requestUrl.searchParams.get("order")).toBe(
      "display_order.asc",
    );
  });
});

describe("SupabaseExerciseRepository", () => {
  it("loads at most 20 published summaries without full editor content", async () => {
    const { client, requests } = createMockClient(() => [
      {
        id: "exercise-1",
        unit_id: "unit-1",
        slug: "change-string",
        title: "修改字串",
        instruction: "修改引號內文字。",
        language: "typescript",
        exercise_type: "challenge",
        difficulty: "advanced",
        supported_modes: ["memory_review", "efficiency"],
        target_duration_ms: 8000,
        version: 1,
      },
    ]);
    const repository = new SupabaseExerciseRepository(client);

    await expect(
      repository.listPublishedExercises({
        unitId: "unit-1",
        learningMode: "efficiency",
        limit: 100,
      }),
    ).resolves.toEqual([
      {
        id: "exercise-1",
        unitId: "unit-1",
        slug: "change-string",
        title: "修改字串",
        instruction: "修改引號內文字。",
        language: "typescript",
        exerciseType: "challenge",
        difficulty: "advanced",
        supportedModes: ["memory_review", "efficiency"],
        targetDurationMs: 8000,
        version: 1,
      },
    ]);

    const requestUrl = new URL(requests[0]?.url ?? "");
    const selectedColumns = requestUrl.searchParams.get("select") ?? "";
    expect(requestUrl.searchParams.get("is_published")).toBe("eq.true");
    expect(requestUrl.searchParams.get("unit_id")).toBe("eq.unit-1");
    expect(requestUrl.searchParams.get("supported_modes")).toBe(
      "cs.{efficiency}",
    );
    expect(requestUrl.searchParams.get("limit")).toBe("20");
    expect(selectedColumns).not.toContain("initial_content");
    expect(selectedColumns).not.toContain("expected_content");
    expect(selectedColumns).not.toContain("completion_rule");
  });

  it("loads and maps one complete practice exercise on demand", async () => {
    const { client, requests } = createMockClient((request) => {
      const table = new URL(request.url).pathname.split("/").at(-1);

      if (table === "exercises") {
        return {
          id: "exercise-1",
          unit_id: "unit-1",
          slug: "change-string",
          title: "修改字串",
          instruction: "修改引號內文字。",
          language: "typescript",
          exercise_type: "challenge",
          difficulty: "advanced",
          initial_content: 'const value = "draft";',
          expected_content: 'const value = "approved";',
          initial_cursor: { line: 0, column: 15 },
          completion_rule: {
            contentMatch: "exact",
            cursorMatch: { type: "ignore" },
            requiredMode: "normal",
          },
          supported_modes: ["memory_review", "efficiency"],
          target_duration_ms: 8000,
          version: 1,
        };
      }
      if (table === "exercise_skills") {
        return [
          { skill_id: "skill-1", weight: 1, is_primary: true },
        ];
      }
      if (table === "exercise_solutions") {
        return [
          {
            sequence: 'ci"approved<Esc>',
            normalized_actions: [
              { type: "vim_command", command: 'ci"' },
              { type: "insert_text", text: "approved", textLength: 8 },
            ],
            keystroke_count: 12,
            is_recommended: true,
            explanation: "只替換引號內文字。",
            display_order: 1,
          },
        ];
      }
      if (table === "exercise_hints") {
        return [
          {
            level: 1,
            content: "使用引號文字物件。",
            command_preview: null,
          },
        ];
      }
      return [];
    });
    const repository = new SupabaseExerciseRepository(client);

    await expect(repository.getPublishedExercise("exercise-1")).resolves.toEqual({
      id: "exercise-1",
      unitId: "unit-1",
      slug: "change-string",
      title: "修改字串",
      instruction: "修改引號內文字。",
      language: "typescript",
      exerciseType: "challenge",
      difficulty: "advanced",
      initialContent: 'const value = "draft";',
      expectedContent: 'const value = "approved";',
      initialCursor: { line: 0, column: 15 },
      completionRule: {
        contentMatch: "exact",
        cursorMatch: { type: "ignore" },
        requiredMode: "normal",
      },
      supportedModes: ["memory_review", "efficiency"],
      targetDurationMs: 8000,
      version: 1,
      skills: [{ skillId: "skill-1", weight: 1, primary: true }],
      solutions: [
        {
          sequence: 'ci"approved<Esc>',
          normalizedActions: [
            { type: "vim_command", command: 'ci"' },
            { type: "insert_text", text: "approved", textLength: 8 },
          ],
          keystrokeCount: 12,
          recommended: true,
          explanation: "只替換引號內文字。",
          displayOrder: 1,
        },
      ],
      hints: [
        {
          level: 1,
          content: "使用引號文字物件。",
          commandPreview: null,
        },
      ],
    });

    expect(requests).toHaveLength(4);
    expect(
      requests.every((request) =>
        new URL(request.url).searchParams.has("exercise_id") ||
        new URL(request.url).searchParams.has("id"),
      ),
    ).toBe(true);
  });
});
