import { describe, expect, it } from "vitest";

import type { ReviewScheduleInput } from "./review-scheduler";
import { scheduleReview } from "./review-scheduler";

const NOW = new Date("2026-07-16T08:00:00.000Z");

function createInput(
  overrides: Partial<ReviewScheduleInput> = {},
): ReviewScheduleInput {
  return {
    masteryLevel: 3,
    performanceQuality: 4,
    highestHintLevel: 0,
    currentIntervalDays: 0,
    now: NOW,
    ...overrides,
  };
}

describe("scheduleReview successful attempts", () => {
  it.each([
    { masteryLevel: 0 as const, expectedDays: 0.25 },
    { masteryLevel: 1 as const, expectedDays: 1 },
    { masteryLevel: 2 as const, expectedDays: 3 },
    { masteryLevel: 3 as const, expectedDays: 7 },
    { masteryLevel: 4 as const, expectedDays: 14 },
    { masteryLevel: 5 as const, expectedDays: 30 },
  ])(
    "uses the Level $masteryLevel base interval",
    ({ masteryLevel, expectedDays }) => {
      const schedule = scheduleReview(createInput({ masteryLevel }));

      expect(schedule.intervalDays).toBe(expectedDays);
      expect(schedule.dueAt.toISOString()).toBe(
        new Date(NOW.getTime() + expectedDays * 86_400_000).toISOString(),
      );
    },
  );

  it.each([
    { performanceQuality: 3 as const, expectedDays: 5.25 },
    { performanceQuality: 4 as const, expectedDays: 7 },
    { performanceQuality: 5 as const, expectedDays: 8.75 },
  ])(
    "applies the quality $performanceQuality interval multiplier",
    ({ performanceQuality, expectedDays }) => {
      expect(
        scheduleReview(createInput({ performanceQuality })).intervalDays,
      ).toBe(expectedDays);
    },
  );

  it("grows from the old interval when it exceeds the Level base", () => {
    const schedule = scheduleReview(
      createInput({
        masteryLevel: 2,
        performanceQuality: 5,
        currentIntervalDays: 10,
      }),
    );

    expect(schedule.intervalDays).toBe(12.5);
  });

  it.each([
    { highestHintLevel: 1 as const, expectedMaximum: 14 },
    { highestHintLevel: 2 as const, expectedMaximum: 7 },
    { highestHintLevel: 3 as const, expectedMaximum: 3 },
    { highestHintLevel: 4 as const, expectedMaximum: 1 },
  ])(
    "caps Level $highestHintLevel hinted attempts at $expectedMaximum days",
    ({ highestHintLevel, expectedMaximum }) => {
      const schedule = scheduleReview(
        createInput({
          masteryLevel: 5,
          performanceQuality: 5,
          highestHintLevel,
          currentIntervalDays: 30,
        }),
      );

      expect(schedule.intervalDays).toBe(expectedMaximum);
    },
  );

  it("caps every successful interval at 30 days", () => {
    const schedule = scheduleReview(
      createInput({
        masteryLevel: 5,
        performanceQuality: 5,
        currentIntervalDays: 30,
      }),
    );

    expect(schedule.intervalDays).toBe(30);
  });
});

describe("scheduleReview failed attempts", () => {
  it.each([0, 1, 2] as const)(
    "schedules quality %s ten minutes later",
    (performanceQuality) => {
      const schedule = scheduleReview(
        createInput({ performanceQuality }),
      );

      expect(schedule.intervalDays).toBe(0);
      expect(schedule.dueAt.toISOString()).toBe(
        "2026-07-16T08:10:00.000Z",
      );
      expect(schedule.requeueAtSessionEnd).toBe(false);
    },
  );

  it("uses the current session tail when one is available", () => {
    const sessionTailAt = new Date("2026-07-16T08:04:00.000Z");
    const schedule = scheduleReview(
      createInput({
        performanceQuality: 1,
        sessionTailAt,
      }),
    );

    expect(schedule.intervalDays).toBe(0);
    expect(schedule.dueAt.toISOString()).toBe(sessionTailAt.toISOString());
    expect(schedule.dueAt).not.toBe(sessionTailAt);
    expect(schedule.requeueAtSessionEnd).toBe(true);
  });

  it("ignores an expired session tail and uses ten minutes", () => {
    const schedule = scheduleReview(
      createInput({
        performanceQuality: 0,
        sessionTailAt: new Date("2026-07-16T07:59:00.000Z"),
      }),
    );

    expect(schedule.dueAt.toISOString()).toBe(
      "2026-07-16T08:10:00.000Z",
    );
    expect(schedule.requeueAtSessionEnd).toBe(false);
  });
});
