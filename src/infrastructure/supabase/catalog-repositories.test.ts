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
  function findRequest(requests: Request[], table: string): Request {
    const request = requests.find((candidate) =>
      new URL(candidate.url).pathname.endsWith(`/${table}`),
    );
    if (request === undefined) {
      throw new Error(`No request was made to ${table}.`);
    }
    return request;
  }

  it("maps published unit summaries with primary skills sorted by display order and a published exercise count", async () => {
    const { client, requests } = createMockClient((request) => {
      const table = new URL(request.url).pathname.split("/").at(-1);
      if (table === "learning_units") {
        return [
          {
            id: "unit-1",
            slug: "text-objects",
            title: "文字物件",
            description: "精準操作文字範圍。",
            difficulty: "advanced",
            estimated_minutes: 28,
            display_order: 8,
          },
        ];
      }
      if (table === "unit_skills") {
        return [
          { unit_id: "unit-1", skill_id: "skill-2", is_primary: true, display_order: 2 },
          { unit_id: "unit-1", skill_id: "skill-1", is_primary: true, display_order: 1 },
        ];
      }
      if (table === "skills") {
        return [
          { id: "skill-1", slug: "quote-object", name: "引號文字物件", category: "text_object" },
          { id: "skill-2", slug: "bracket-object", name: "括號文字物件", category: "text_object" },
        ];
      }
      if (table === "exercises") {
        return [{ unit_id: "unit-1" }, { unit_id: "unit-1" }, { unit_id: "unit-1" }];
      }
      return [];
    });
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
        exerciseCount: 3,
        primarySkills: [
          {
            id: "skill-1",
            slug: "quote-object",
            name: "引號文字物件",
            category: "text_object",
            primary: true,
            displayOrder: 1,
          },
          {
            id: "skill-2",
            slug: "bracket-object",
            name: "括號文字物件",
            category: "text_object",
            primary: true,
            displayOrder: 2,
          },
        ],
      },
    ]);

    const unitsUrl = new URL(findRequest(requests, "learning_units").url);
    expect(unitsUrl.searchParams.get("is_published")).toBe("eq.true");
    expect(unitsUrl.searchParams.get("order")).toBe("display_order.asc");

    const unitSkillsUrl = new URL(findRequest(requests, "unit_skills").url);
    expect(unitSkillsUrl.searchParams.get("is_primary")).toBe("eq.true");
    expect(unitSkillsUrl.searchParams.get("unit_id")).toBe("in.(unit-1)");

    const exercisesUrl = new URL(findRequest(requests, "exercises").url);
    expect(exercisesUrl.searchParams.get("is_published")).toBe("eq.true");
    expect(exercisesUrl.searchParams.get("unit_id")).toBe("in.(unit-1)");
    expect(exercisesUrl.searchParams.get("select")).toBe("unit_id");
  });

  it("returns an empty list without querying skills or exercises when no units are published", async () => {
    const { client, requests } = createMockClient(() => []);
    const repository = new SupabaseCourseRepository(client);

    await expect(repository.listPublishedUnits()).resolves.toEqual([]);
    expect(requests).toHaveLength(1);
  });

  describe("getPublishedUnitBySlug", () => {
    it("loads unit detail with skills and exercises ordered by display order then slug", async () => {
      const { client, requests } = createMockClient((request) => {
        const table = new URL(request.url).pathname.split("/").at(-1);
        if (table === "learning_units") {
          return {
            id: "unit-1",
            slug: "text-objects",
            title: "文字物件",
            description: "精準操作文字範圍。",
            difficulty: "advanced",
            estimated_minutes: 28,
            display_order: 8,
          };
        }
        if (table === "unit_skills") {
          return [
            { unit_id: "unit-1", skill_id: "skill-2", is_primary: false, display_order: 2 },
            { unit_id: "unit-1", skill_id: "skill-1", is_primary: true, display_order: 1 },
          ];
        }
        if (table === "skills") {
          return [
            { id: "skill-1", slug: "quote-object", name: "引號文字物件", category: "text_object" },
            { id: "skill-2", slug: "bracket-object", name: "括號文字物件", category: "text_object" },
          ];
        }
        if (table === "exercises") {
          return [
            {
              id: "exercise-b",
              slug: "text-objects-02",
              title: "練習二",
              exercise_type: "challenge",
              difficulty: "advanced",
              display_order: 1,
            },
            {
              id: "exercise-a",
              slug: "text-objects-01",
              title: "練習一",
              exercise_type: "guided",
              difficulty: "advanced",
              display_order: 1,
            },
            {
              id: "exercise-c",
              slug: "text-objects-03",
              title: "練習三",
              exercise_type: "challenge",
              difficulty: "advanced",
              display_order: 2,
            },
          ];
        }
        return [];
      });
      const repository = new SupabaseCourseRepository(client);

      await expect(repository.getPublishedUnitBySlug("text-objects")).resolves.toEqual({
        id: "unit-1",
        slug: "text-objects",
        title: "文字物件",
        description: "精準操作文字範圍。",
        difficulty: "advanced",
        estimatedMinutes: 28,
        displayOrder: 8,
        exerciseCount: 3,
        skills: [
          {
            id: "skill-1",
            slug: "quote-object",
            name: "引號文字物件",
            category: "text_object",
            primary: true,
            displayOrder: 1,
          },
          {
            id: "skill-2",
            slug: "bracket-object",
            name: "括號文字物件",
            category: "text_object",
            primary: false,
            displayOrder: 2,
          },
        ],
        exercises: [
          {
            id: "exercise-a",
            slug: "text-objects-01",
            title: "練習一",
            exerciseType: "guided",
            difficulty: "advanced",
            displayOrder: 1,
          },
          {
            id: "exercise-b",
            slug: "text-objects-02",
            title: "練習二",
            exerciseType: "challenge",
            difficulty: "advanced",
            displayOrder: 1,
          },
          {
            id: "exercise-c",
            slug: "text-objects-03",
            title: "練習三",
            exerciseType: "challenge",
            difficulty: "advanced",
            displayOrder: 2,
          },
        ],
      });

      const unitUrl = new URL(findRequest(requests, "learning_units").url);
      expect(unitUrl.searchParams.get("slug")).toBe("eq.text-objects");
      expect(unitUrl.searchParams.get("is_published")).toBe("eq.true");

      const exercisesUrl = new URL(findRequest(requests, "exercises").url);
      expect(exercisesUrl.searchParams.get("order")).toBe(
        "display_order.asc,slug.asc",
      );
      const selectedExerciseColumns = exercisesUrl.searchParams.get("select") ?? "";
      expect(selectedExerciseColumns).not.toContain("initial_content");
      expect(selectedExerciseColumns).not.toContain("expected_content");
      expect(selectedExerciseColumns).not.toContain("completion_rule");
    });

    it("returns null when the matching unit is not published", async () => {
      const { client, requests } = createMockClient(() => null);
      const repository = new SupabaseCourseRepository(client);

      await expect(
        repository.getPublishedUnitBySlug("draft-unit"),
      ).resolves.toBeNull();
      expect(requests).toHaveLength(1);
    });

    it("returns null for an unknown unit slug", async () => {
      const { client, requests } = createMockClient(() => null);
      const repository = new SupabaseCourseRepository(client);

      await expect(
        repository.getPublishedUnitBySlug("does-not-exist"),
      ).resolves.toBeNull();
      expect(requests).toHaveLength(1);
    });
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

  it("orders by display order then slug and does not cap a single unit's exercise list at 20 when requested for a course", async () => {
    const { client, requests } = createMockClient(() =>
      Array.from({ length: 25 }, (_, index) => ({
        id: `exercise-${index + 1}`,
        unit_id: "unit-1",
        slug: `unit-${String(index + 1).padStart(2, "0")}`,
        title: `練習 ${index + 1}`,
        instruction: "指示",
        language: "plaintext",
        exercise_type: "guided",
        difficulty: "beginner",
        supported_modes: ["beginner"],
        target_duration_ms: 1000,
        version: 1,
      })),
    );
    const repository = new SupabaseExerciseRepository(client);

    const result = await repository.listPublishedExercises({
      unitId: "unit-1",
      learningMode: "beginner",
      orderByDisplayOrder: true,
    });

    expect(result).toHaveLength(25);

    const requestUrl = new URL(requests[0]?.url ?? "");
    expect(requestUrl.searchParams.get("order")).toBe(
      "display_order.asc,slug.asc",
    );
    expect(requestUrl.searchParams.get("limit")).not.toBe("20");
  });

  it("keeps ordering by slug alone when orderByDisplayOrder is not requested", async () => {
    const { client, requests } = createMockClient(() => []);
    const repository = new SupabaseExerciseRepository(client);

    await repository.listPublishedExercises({ unitId: "unit-1" });

    const requestUrl = new URL(requests[0]?.url ?? "");
    expect(requestUrl.searchParams.get("order")).toBe("slug.asc");
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
