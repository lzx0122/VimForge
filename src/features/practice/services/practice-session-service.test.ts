import { describe, expect, it } from "vitest";

import { createPracticeSession } from "./practice-session-service";

const STARTED_AT = "2026-07-19T08:00:00.000Z";

describe("createPracticeSession", () => {
  it("sets actualCount to the exercise count for a course session with no requested count", () => {
    const exerciseIds = Array.from(
      { length: 8 },
      (_, index) => `exercise-${index + 1}`,
    );

    const session = createPracticeSession({
      id: "session-1",
      learningMode: "beginner",
      selectionType: "course",
      requestedCount: null,
      exerciseIds,
      startedAt: STARTED_AT,
    });

    expect(session.requestedCount).toBeNull();
    expect(session.actualCount).toBe(8);
  });

  it("sets actualCount below requestedCount when fewer exercises are available", () => {
    const exerciseIds = Array.from(
      { length: 7 },
      (_, index) => `exercise-${index + 1}`,
    );

    const session = createPracticeSession({
      id: "session-2",
      learningMode: "memory_review",
      selectionType: "daily_review",
      requestedCount: 10,
      exerciseIds,
      startedAt: STARTED_AT,
    });

    expect(session.requestedCount).toBe(10);
    expect(session.actualCount).toBe(7);
  });
});
