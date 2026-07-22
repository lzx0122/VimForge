import { describe, expect, it } from "vitest";

import {
  createFreshAttemptState,
  restartCurrentAttempt,
  type FreshAttemptState,
} from "./fresh-attempt-service";

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
      mistakeCount: 0,
      lastMistakeFingerprint: null,
      recordedActions: [],
      hasUserInteraction: false,
      unmetMessages: [],
    });
    expect(state.snapshot.cursor).not.toBe(exercise.initialCursor);
  });
});

function createCurrentAttempt(
  overrides: Partial<FreshAttemptState> = {},
): FreshAttemptState {
  return {
    clientAttemptId: "attempt-current",
    startedAt: "2026-07-19T09:30:00.000Z",
    snapshot: {
      content: "const restoredName = true;",
      cursor: { line: 0, column: 18 },
      mode: "insert",
    },
    highestHintLevel: 2,
    resetCount: 1,
    keystrokeCount: 12,
    mistakeCount: 3,
    lastMistakeFingerprint: '["const restoredName = true;",0,18,"insert"]',
    recordedActions: [{ type: "vim_command", command: "ciw" }],
    hasUserInteraction: true,
    unmetMessages: ["cursor must be on line 0"],
    ...overrides,
  };
}

describe("restartCurrentAttempt", () => {
  it("keeps the same attempt id and start time", () => {
    const current = createCurrentAttempt();

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.clientAttemptId).toBe(current.clientAttemptId);
    expect(restarted.startedAt).toBe(current.startedAt);
  });

  it("preserves keystrokeCount, mistakeCount, and highestHintLevel", () => {
    const current = createCurrentAttempt();

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.keystrokeCount).toBe(current.keystrokeCount);
    expect(restarted.mistakeCount).toBe(current.mistakeCount);
    expect(restarted.highestHintLevel).toBe(current.highestHintLevel);
  });

  it("increments resetCount by exactly one", () => {
    const current = createCurrentAttempt({ resetCount: 1 });

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.resetCount).toBe(2);
  });

  it("preserves existing actions and appends a reset action", () => {
    const current = createCurrentAttempt({
      recordedActions: [{ type: "vim_command", command: "ciw" }],
    });

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.recordedActions).toEqual([
      { type: "vim_command", command: "ciw" },
      { type: "reset" },
    ]);
  });

  it("returns content and cursor to the exercise's initial state", () => {
    const current = createCurrentAttempt();

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.snapshot.content).toBe(exercise.initialContent);
    expect(restarted.snapshot.cursor).toEqual(exercise.initialCursor);
    expect(restarted.snapshot.cursor).not.toBe(exercise.initialCursor);
  });

  it("resets mode to normal", () => {
    const current = createCurrentAttempt({
      snapshot: {
        content: "const restoredName = true;",
        cursor: { line: 0, column: 18 },
        mode: "visual",
      },
    });

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.snapshot.mode).toBe("normal");
  });

  it("clears unmet messages", () => {
    const current = createCurrentAttempt({
      unmetMessages: ["cursor must be on line 0"],
    });

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.unmetMessages).toEqual([]);
  });

  it("preserves lastMistakeFingerprint", () => {
    const current = createCurrentAttempt({
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
    });

    const restarted = restartCurrentAttempt({ exercise, current });

    expect(restarted.lastMistakeFingerprint).toBe(
      '["wrong",0,3,"normal"]',
    );
  });

  it("does not mutate the input current attempt or its actions array", () => {
    const originalActions = [{ type: "vim_command" as const, command: "ciw" }];
    const current = Object.freeze(
      createCurrentAttempt({
        recordedActions: Object.freeze([...originalActions]) as never,
      }),
    );

    expect(() => restartCurrentAttempt({ exercise, current })).not.toThrow();
    expect(current.recordedActions).toEqual(originalActions);
  });
});
