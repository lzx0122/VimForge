import { describe, expect, it } from "vitest";

import {
  createTopicPracticePlan,
  sameDayMasteryMultiplier,
  type TopicPracticeCandidate,
} from "./topic-practice-service";

function candidate(
  exerciseId: string,
  topicSlugs: readonly string[],
  overrides: Partial<TopicPracticeCandidate> = {},
): TopicPracticeCandidate {
  return {
    exerciseId,
    topicSlugs,
    masteryLevel: 2,
    sameDayAttemptCount: 0,
    lastPracticedAt: "2026-07-15T08:00:00.000Z",
    ...overrides,
  };
}

describe("createTopicPracticePlan", () => {
  it("requires at least one selected topic", () => {
    expect(() =>
      createTopicPracticePlan({
        selectedTopics: [],
        questionCount: 5,
        candidates: [candidate("search-1", ["search"])],
        dueExerciseIds: [],
      }),
    ).toThrow("Select at least one topic for topic practice.");
  });

  it("selects the union of one or more topics without duplicate exercises", () => {
    const plan = createTopicPracticePlan({
      selectedTopics: ["search", "text-objects"],
      questionCount: 5,
      candidates: [
        candidate("search-1", ["search"]),
        candidate("text-object-1", ["text-objects"]),
        candidate("shared", ["search", "text-objects"]),
        candidate("movement-1", ["basic-movement"]),
        candidate("shared", ["search"]),
      ],
      dueExerciseIds: [],
    });

    expect(plan.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      "search-1",
      "text-object-1",
      "shared",
    ]);
  });

  it("prioritizes lower mastery, fewer same-day repeats, and older practice", () => {
    const plan = createTopicPracticePlan({
      selectedTopics: ["search"],
      questionCount: 5,
      candidates: [
        candidate("mastered", ["search"], { masteryLevel: 5 }),
        candidate("learning-repeated", ["search"], {
          masteryLevel: 1,
          sameDayAttemptCount: 2,
        }),
        candidate("learning-recent", ["search"], {
          masteryLevel: 1,
          lastPracticedAt: "2026-07-16T07:00:00.000Z",
        }),
        candidate("learning-never", ["search"], {
          masteryLevel: 1,
          lastPracticedAt: null,
        }),
        candidate("practicing", ["search"], { masteryLevel: 2 }),
      ],
      dueExerciseIds: [],
    });

    expect(plan.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      "learning-never",
      "learning-recent",
      "learning-repeated",
      "practicing",
      "mastered",
    ]);
  });

  it("preserves due review items without mutating the input", () => {
    const dueExerciseIds = ["due-text-object", "due-search"];
    const originalDueExerciseIds = [...dueExerciseIds];

    const plan = createTopicPracticePlan({
      selectedTopics: ["search"],
      questionCount: 5,
      candidates: [candidate("search-1", ["search"])],
      dueExerciseIds,
    });

    expect(plan.preservedDueExerciseIds).toEqual(originalDueExerciseIds);
    expect(plan.preservedDueExerciseIds).not.toBe(dueExerciseIds);
    expect(dueExerciseIds).toEqual(originalDueExerciseIds);
  });

  it("attaches a diminishing same-day mastery multiplier", () => {
    const plan = createTopicPracticePlan({
      selectedTopics: ["search"],
      questionCount: 5,
      candidates: [
        candidate("first", ["search"], { sameDayAttemptCount: 0 }),
        candidate("second", ["search"], { sameDayAttemptCount: 1 }),
        candidate("third", ["search"], { sameDayAttemptCount: 2 }),
      ],
      dueExerciseIds: [],
    });

    expect(plan.exercises).toEqual([
      { exerciseId: "first", masteryGainMultiplier: 1 },
      { exerciseId: "second", masteryGainMultiplier: 0.5 },
      { exerciseId: "third", masteryGainMultiplier: 0.33 },
    ]);
  });

  it("normalizes invalid repeat counts before calculating the multiplier", () => {
    expect(sameDayMasteryMultiplier(-2)).toBe(1);
    expect(sameDayMasteryMultiplier(1.9)).toBe(0.5);
    expect(sameDayMasteryMultiplier(Number.NaN)).toBe(1);
  });
});
