import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AttemptSyncInput,
  AttemptSyncRepository,
  AttemptSyncResult,
  SyncedSkillMastery,
} from "../../features/practice/repositories/attempt-sync-repository";
import type { NormalizedAction } from "../../types/attempt";
import { getSupabaseBrowserClient } from "./client";
import type { Database, Json } from "./database.types";

function normalizedActionToJson(action: NormalizedAction): Json {
  switch (action.type) {
    case "vim_command":
      return { type: action.type, command: action.command };
    case "insert_text":
      return {
        type: action.type,
        text: action.text,
        textLength: action.textLength,
      };
    case "mode_change":
      return { type: action.type, mode: action.mode };
    case "undo":
    case "reset":
      return { type: action.type };
    case "search":
      return {
        type: action.type,
        query: action.query,
        direction: action.direction,
      };
  }
}

function toPayload(input: AttemptSyncInput): Json {
  return {
    clientAttemptId: input.clientAttemptId,
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    exerciseVersion: input.exerciseVersion,
    learningMode: input.learningMode,
    source: input.source,
    completed: input.completed,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    keystrokeCount: input.keystrokeCount,
    recommendedKeystrokeCount: input.recommendedKeystrokeCount,
    mistakeCount: input.mistakeCount,
    undoCount: input.undoCount,
    resetCount: input.resetCount,
    highestHintLevel: input.highestHintLevel,
    usedRecommendedSolution: input.usedRecommendedSolution,
    normalizedActions: input.normalizedActions.map(normalizedActionToJson),
    speedScore: input.speedScore,
    accuracyScore: input.accuracyScore,
    performanceQuality: input.performanceQuality,
    practiceContext: input.practiceContext,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMasteryLevel(value: unknown): value is 0 | 1 | 2 | 3 | 4 | 5 {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 5
  );
}

function toMastery(value: unknown): SyncedSkillMastery {
  if (
    !isRecord(value) ||
    typeof value.skillId !== "string" ||
    !isMasteryLevel(value.masteryLevel) ||
    typeof value.masteryScore !== "number" ||
    !Number.isFinite(value.masteryScore) ||
    value.masteryScore < 0 ||
    value.masteryScore > 100
  ) {
    throw new Error("Invalid record attempt response from Supabase.");
  }

  return {
    skillId: value.skillId,
    masteryLevel: value.masteryLevel,
    masteryScore: value.masteryScore,
  };
}

function toAttemptSyncResult(value: unknown): AttemptSyncResult {
  if (
    !isRecord(value) ||
    typeof value.attemptId !== "string" ||
    !Array.isArray(value.mastery) ||
    (value.dueAt !== null && typeof value.dueAt !== "string")
  ) {
    throw new Error("Invalid record attempt response from Supabase.");
  }

  return {
    attemptId: value.attemptId,
    mastery: value.mastery.map(toMastery),
    dueAt: value.dueAt,
  };
}

export class SupabaseAttemptSyncRepository implements AttemptSyncRepository {
  public constructor(
    private readonly client: SupabaseClient<Database> =
      getSupabaseBrowserClient(),
  ) {}

  public async recordAttempt(
    attempt: AttemptSyncInput,
  ): Promise<AttemptSyncResult> {
    const { data, error } = await this.client.rpc(
      "record_exercise_attempt",
      { payload: toPayload(attempt) },
    );

    if (error !== null) {
      throw new Error("Unable to sync the exercise attempt.", {
        cause: error,
      });
    }

    return toAttemptSyncResult(data);
  }
}
