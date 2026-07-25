import { describe, expectTypeOf, it } from "vitest";

import type { AttemptSyncInput } from "../features/practice/repositories/attempt-sync-repository";
import type {
  AttemptHydrationCursor,
  CloudAttemptSnapshot,
  CloudExerciseReviewSnapshot,
  CloudHydrationMetadata,
  CloudPage,
  CloudSettingsSnapshot,
  CloudSkillMasterySnapshot,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "./cloud-learning-state";
import type { LearningMode, QuestionCount } from "./learning";

describe("cloud hydration cursors", () => {
  it("keys AttemptHydrationCursor by createdAt then clientAttemptId", () => {
    expectTypeOf<AttemptHydrationCursor>().toEqualTypeOf<{
      createdAt: string;
      clientAttemptId: string;
    }>();
  });

  it("keys MasteryHydrationCursor by updatedAt then skillId", () => {
    expectTypeOf<MasteryHydrationCursor>().toEqualTypeOf<{
      updatedAt: string;
      skillId: string;
    }>();
  });

  it("keys ReviewHydrationCursor by updatedAt then exerciseId", () => {
    expectTypeOf<ReviewHydrationCursor>().toEqualTypeOf<{
      updatedAt: string;
      exerciseId: string;
    }>();
  });
});

describe("cloud projection DTOs", () => {
  it("does not carry a local revision counter on CloudSkillMasterySnapshot", () => {
    // Full-shape equality, not just a missing-key check: an extra
    // `revision` field would fail this just as loudly as a missing one.
    expectTypeOf<CloudSkillMasterySnapshot>().toEqualTypeOf<{
      skillId: string;
      masteryScore: number;
      masteryLevel: 0 | 1 | 2 | 3 | 4 | 5;
      successfulAttempts: number;
      uniqueExerciseIds: string[];
      consecutiveSuccesses: number;
      firstUnhintedSuccessAt: string | null;
      latestUnhintedSuccessAt: string | null;
      lastAttemptAt: string;
      updatedAt: string;
    }>();
  });

  it("does not carry a local revision counter on CloudExerciseReviewSnapshot", () => {
    expectTypeOf<CloudExerciseReviewSnapshot>().toEqualTypeOf<{
      exerciseId: string;
      masteryLevel: 0 | 1 | 2 | 3 | 4 | 5;
      currentIntervalDays: number;
      dueAt: string;
      lastPerformanceQuality: 0 | 1 | 2 | 3 | 4 | 5;
      lastAttemptAt: string;
      updatedAt: string;
    }>();
  });

  it("mirrors the Settings Store's persisted fields, without soundEnabled", () => {
    expectTypeOf<CloudSettingsSnapshot>().toEqualTypeOf<{
      editorFontSize: number;
      showLineNumbers: boolean;
      showKeypresses: boolean;
      preferredQuestionCount: QuestionCount;
      lastLearningMode: LearningMode | null;
      updatedAt: string;
    }>();
  });

  it("extends AttemptSyncInput with a createdAt server timestamp", () => {
    expectTypeOf<CloudAttemptSnapshot>().toExtend<AttemptSyncInput>();
    expectTypeOf<CloudAttemptSnapshot["createdAt"]>().toEqualTypeOf<string>();
    expectTypeOf<CloudAttemptSnapshot["clientAttemptId"]>().toEqualTypeOf<string>();
    expectTypeOf<CloudAttemptSnapshot["keystrokeCount"]>().toEqualTypeOf<number>();
  });
});

describe("cloud hydration paging and metadata", () => {
  it("pages any item/cursor pair with an explicit hasMore flag", () => {
    expectTypeOf<CloudPage<CloudAttemptSnapshot, AttemptHydrationCursor>>()
      .toEqualTypeOf<{
        items: CloudAttemptSnapshot[];
        nextCursor: AttemptHydrationCursor | null;
        hasMore: boolean;
      }>();
  });

  it("tracks one cursor per stream and a fixed schema version", () => {
    expectTypeOf<CloudHydrationMetadata>().toEqualTypeOf<{
      key: "cloud-hydration";
      userId: string;
      attemptsCursor: AttemptHydrationCursor | null;
      masteryCursor: MasteryHydrationCursor | null;
      reviewsCursor: ReviewHydrationCursor | null;
      completedAt: string | null;
      schemaVersion: 1;
    }>();
    expectTypeOf<CloudHydrationMetadata["schemaVersion"]>().toEqualTypeOf<1>();
    expectTypeOf<CloudHydrationMetadata["key"]>().toEqualTypeOf<"cloud-hydration">();
  });
});
