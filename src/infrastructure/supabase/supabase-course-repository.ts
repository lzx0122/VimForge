import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CourseRepository,
  CourseUnitSummary,
} from "../../features/course/repositories/course-repository";
import { DIFFICULTIES } from "../../types/exercise";
import { getSupabaseBrowserClient } from "./client";
import type { Database } from "./database.types";

const UNIT_SUMMARY_COLUMNS =
  "id,slug,title,description,difficulty,estimated_minutes,display_order";

function isDifficulty(value: string): value is CourseUnitSummary["difficulty"] {
  return DIFFICULTIES.some((difficulty) => difficulty === value);
}

export class SupabaseCourseRepository implements CourseRepository {
  public constructor(
    private readonly client: SupabaseClient<Database> =
      getSupabaseBrowserClient(),
  ) {}

  public async listPublishedUnits(): Promise<readonly CourseUnitSummary[]> {
    const { data, error } = await this.client
      .from("learning_units")
      .select(UNIT_SUMMARY_COLUMNS)
      .eq("is_published", true)
      .order("display_order", { ascending: true });

    if (error !== null) {
      throw new Error("Unable to load published course units.", {
        cause: error,
      });
    }

    return data.map((unit) => {
      if (!isDifficulty(unit.difficulty)) {
        throw new Error(`Invalid unit difficulty: ${unit.difficulty}.`);
      }

      return {
        id: unit.id,
        slug: unit.slug,
        title: unit.title,
        description: unit.description,
        difficulty: unit.difficulty,
        estimatedMinutes: unit.estimated_minutes,
        displayOrder: unit.display_order,
      };
    });
  }
}
