import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { SupabasePracticeCandidateRepository } from "./supabase-practice-candidate-repository";
import type { Database } from "./database.types";

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
    "https://candidate-test.supabase.co",
    "sb_publishable_candidate_test_key",
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
        storageKey: `practice-candidate-repository-test-${clientCount}`,
      },
      global: { fetch: mockFetch },
    },
  );

  return { client, requests };
}

function tableOf(request: Request): string | undefined {
  return new URL(request.url).pathname.split("/").at(-1);
}

describe("SupabasePracticeCandidateRepository", () => {
  it("filters to published exercises supporting the requested learning mode", async () => {
    const { client, requests } = createMockClient((request) => {
      const table = tableOf(request);
      if (table === "exercises") {
        return [
          {
            id: "exercise-1",
            unit_id: "unit-1",
            slug: "insert-prefix-01",
            difficulty: "beginner",
            display_order: 1,
            supported_modes: ["beginner", "memory_review"],
          },
        ];
      }
      if (table === "exercise_skills") {
        return [{ exercise_id: "exercise-1", skill_id: "skill-1" }];
      }
      if (table === "skills") {
        return [{ id: "skill-1", slug: "insert-entry-points" }];
      }
      return [];
    });
    const repository = new SupabasePracticeCandidateRepository(client);

    const result = await repository.listPublishedCandidates({
      learningMode: "memory_review",
    });

    expect(result).toEqual([
      {
        exerciseId: "exercise-1",
        unitId: "unit-1",
        exerciseSlug: "insert-prefix-01",
        skillIds: ["skill-1"],
        skillSlugs: ["insert-entry-points"],
        learningModes: ["beginner", "memory_review"],
        difficulty: "beginner",
        displayOrder: 1,
      },
    ]);

    const exercisesRequest = requests.find((request) => tableOf(request) === "exercises");
    const exercisesUrl = new URL(exercisesRequest?.url ?? "");
    expect(exercisesUrl.searchParams.get("is_published")).toBe("eq.true");
    expect(exercisesUrl.searchParams.get("supported_modes")).toBe(
      "cs.{memory_review}",
    );
  });

  it("only selects lightweight columns, never full exercise content", async () => {
    const { client, requests } = createMockClient(() => []);
    const repository = new SupabasePracticeCandidateRepository(client);

    await repository.listPublishedCandidates({ learningMode: "beginner" });

    const exercisesRequest = requests.find((request) => tableOf(request) === "exercises");
    const selectedColumns =
      new URL(exercisesRequest?.url ?? "").searchParams.get("select") ?? "";
    expect(selectedColumns).toContain("display_order");
    expect(selectedColumns).toContain("supported_modes");
    expect(selectedColumns).not.toContain("instruction");
    expect(selectedColumns).not.toContain("initial_content");
    expect(selectedColumns).not.toContain("expected_content");
    expect(selectedColumns).not.toContain("completion_rule");
    expect(selectedColumns).not.toContain("title");
    expect(selectedColumns).not.toContain("target_duration_ms");
  });

  it("excludes candidates that have none of the requested skill slugs", async () => {
    const { client } = createMockClient((request) => {
      const table = tableOf(request);
      if (table === "exercises") {
        return [
          {
            id: "exercise-1",
            unit_id: "unit-1",
            slug: "text-object-01",
            difficulty: "beginner",
            display_order: 1,
            supported_modes: ["beginner"],
          },
          {
            id: "exercise-2",
            unit_id: "unit-1",
            slug: "movement-01",
            difficulty: "beginner",
            display_order: 2,
            supported_modes: ["beginner"],
          },
        ];
      }
      if (table === "exercise_skills") {
        return [
          { exercise_id: "exercise-1", skill_id: "skill-1" },
          { exercise_id: "exercise-2", skill_id: "skill-2" },
        ];
      }
      if (table === "skills") {
        return [
          { id: "skill-1", slug: "quoted-text-object" },
          { id: "skill-2", slug: "basic-motion" },
        ];
      }
      return [];
    });
    const repository = new SupabasePracticeCandidateRepository(client);

    const result = await repository.listPublishedCandidates({
      learningMode: "beginner",
      skillSlugs: ["quoted-text-object"],
    });

    expect(result.map((candidate) => candidate.exerciseId)).toEqual([
      "exercise-1",
    ]);
  });

  it("returns skillIds and skillSlugs in a stable, sorted order regardless of join row order", async () => {
    const { client } = createMockClient((request) => {
      const table = tableOf(request);
      if (table === "exercises") {
        return [
          {
            id: "exercise-1",
            unit_id: "unit-1",
            slug: "composition-01",
            difficulty: "advanced",
            display_order: 1,
            supported_modes: ["efficiency"],
          },
        ];
      }
      if (table === "exercise_skills") {
        return [
          { exercise_id: "exercise-1", skill_id: "skill-2" },
          { exercise_id: "exercise-1", skill_id: "skill-1" },
        ];
      }
      if (table === "skills") {
        return [
          { id: "skill-2", slug: "yank-composition" },
          { id: "skill-1", slug: "dot-repeat" },
        ];
      }
      return [];
    });
    const repository = new SupabasePracticeCandidateRepository(client);

    const result = await repository.listPublishedCandidates({
      learningMode: "efficiency",
    });

    expect(result[0]?.skillSlugs).toEqual(["dot-repeat", "yank-composition"]);
    expect(result[0]?.skillIds).toEqual(["skill-1", "skill-2"]);
  });

  it("loads relations in batched queries instead of one request per exercise", async () => {
    const { client, requests } = createMockClient((request) => {
      const table = tableOf(request);
      if (table === "exercises") {
        return Array.from({ length: 5 }, (_, index) => ({
          id: `exercise-${index + 1}`,
          unit_id: "unit-1",
          slug: `exercise-${index + 1}`,
          difficulty: "beginner",
          display_order: index + 1,
          supported_modes: ["beginner"],
        }));
      }
      if (table === "exercise_skills") {
        return Array.from({ length: 5 }, (_, index) => ({
          exercise_id: `exercise-${index + 1}`,
          skill_id: "skill-1",
        }));
      }
      if (table === "skills") {
        return [{ id: "skill-1", slug: "basic-motion" }];
      }
      return [];
    });
    const repository = new SupabasePracticeCandidateRepository(client);

    const result = await repository.listPublishedCandidates({
      learningMode: "beginner",
    });

    expect(result).toHaveLength(5);
    // exactly one request per table: exercises, exercise_skills, skills.
    expect(requests).toHaveLength(3);
  });

  it("pages through the full exercise list instead of truncating it", async () => {
    const totalExercises = 205;
    const allExercises = Array.from({ length: totalExercises }, (_, index) => ({
      id: `exercise-${index + 1}`,
      unit_id: "unit-1",
      slug: `exercise-${String(index + 1).padStart(3, "0")}`,
      difficulty: "beginner",
      display_order: index + 1,
      supported_modes: ["beginner"],
    }));

    const { client, requests } = createMockClient((request) => {
      const table = tableOf(request);
      if (table !== "exercises") {
        return [];
      }
      const url = new URL(request.url);
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "0");
      return allExercises.slice(offset, offset + limit);
    });
    const repository = new SupabasePracticeCandidateRepository(client);

    const result = await repository.listPublishedCandidates({
      learningMode: "beginner",
    });

    expect(result).toHaveLength(totalExercises);
    const exercisesRequests = requests.filter(
      (request) => tableOf(request) === "exercises",
    );
    expect(exercisesRequests.length).toBeGreaterThanOrEqual(2);
  });
});
