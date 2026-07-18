import { describe, expect, it } from "vitest";

import { createFreshAttemptState } from "./fresh-attempt-service";

const exercise = {
  initialContent: "const name = true;",
  initialCursor: { line: 0, column: 6 },
};

describe("createFreshAttemptState", () => {
  it("creates a fully reset attempt with a cloned initial cursor", () => {
    const state = createFreshAttemptState({
      exercise,
      clientAttemptId: "attempt-new",
      startedAt: "2026-07-19T09:30:00.000Z",
    });

    expect(state).toEqual({
      clientAttemptId: "attempt-new",
      startedAt: "2026-07-19T09:30:00.000Z",
      snapshot: {
        content: "const name = true;",
        cursor: { line: 0, column: 6 },
        mode: "normal",
      },
      highestHintLevel: 0,
      resetCount: 0,
      keystrokeCount: 0,
      recordedActions: [],
      hasUserInteraction: false,
      unmetMessages: [],
    });
    expect(state.snapshot.cursor).not.toBe(exercise.initialCursor);
  });
});
