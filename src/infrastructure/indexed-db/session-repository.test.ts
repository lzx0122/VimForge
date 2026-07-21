import { describe, expect, it } from "vitest";

import type { AttemptDraft } from "../../types/attempt";
import type { PracticeSession } from "../../types/session";
import {
  normalizePersistedAttemptDraft,
  normalizePersistedSession,
  normalizeResumedDraftMode,
} from "./session-repository";

function createSession(): PracticeSession {
  return {
    id: "session-1",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 5,
    actualCount: 2,
    status: "active",
    currentIndex: 1,
    exerciseIds: ["exercise-1", "exercise-2"],
    selectedSkillIds: [],
    startedAt: "2026-07-16T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-16T08:01:00.000Z",
  };
}

function createAttemptDraft(
  overrides: Partial<AttemptDraft> = {},
): AttemptDraft {
  return {
    clientAttemptId: "attempt-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: null,
    initialContent: "const name = true;",
    currentContent: "const name = true;",
    initialCursor: { line: 0, column: 0 },
    currentCursor: { line: 0, column: 0 },
    currentMode: "normal",
    actions: [],
    keystrokeCount: 0,
    mistakeCount: 0,
    lastMistakeFingerprint: null,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    completed: false,
    ...overrides,
  };
}

describe("normalizePersistedSession", () => {
  it("keeps an existing actualCount unchanged", () => {
    const session = createSession();

    expect(normalizePersistedSession(session).actualCount).toBe(2);
  });

  it("falls back to exerciseIds.length when actualCount is missing", () => {
    const session: Record<string, unknown> = { ...createSession() };
    delete session.actualCount;

    const normalized = normalizePersistedSession(
      session as unknown as PracticeSession,
    );

    expect(normalized.actualCount).toBe(2);
    expect(normalized.exerciseIds).toEqual(["exercise-1", "exercise-2"]);
  });
});

describe("normalizePersistedAttemptDraft", () => {
  it("returns keystrokeCount, mistakeCount, and a non-null fingerprint unchanged when already valid", () => {
    const draft = createAttemptDraft({
      keystrokeCount: 17,
      mistakeCount: 2,
      lastMistakeFingerprint: '["const restoredName = true;",0,18,"normal"]',
    });

    const normalized = normalizePersistedAttemptDraft(draft);

    expect(normalized.keystrokeCount).toBe(17);
    expect(normalized.mistakeCount).toBe(2);
    expect(normalized.lastMistakeFingerprint).toBe(
      '["const restoredName = true;",0,18,"normal"]',
    );
  });

  it("normalizes a legacy draft missing keystrokeCount and lastMistakeFingerprint", () => {
    const legacy: Record<string, unknown> = {
      ...createAttemptDraft({ mistakeCount: 3 }),
    };
    delete legacy.keystrokeCount;
    delete legacy.lastMistakeFingerprint;

    const normalized = normalizePersistedAttemptDraft(
      legacy as unknown as AttemptDraft,
    );

    expect(normalized.keystrokeCount).toBe(0);
    expect(normalized.mistakeCount).toBe(3);
    expect(normalized.lastMistakeFingerprint).toBeNull();
  });

  it("normalizes a legacy draft with a missing mistakeCount to 0", () => {
    const legacy: Record<string, unknown> = { ...createAttemptDraft() };
    delete legacy.mistakeCount;

    const normalized = normalizePersistedAttemptDraft(
      legacy as unknown as AttemptDraft,
    );

    expect(normalized.mistakeCount).toBe(0);
  });

  it("normalizes negative or non-integer counters to 0", () => {
    const draft = createAttemptDraft({
      keystrokeCount: -1,
      mistakeCount: 1.5,
    });

    const normalized = normalizePersistedAttemptDraft(draft);

    expect(normalized.keystrokeCount).toBe(0);
    expect(normalized.mistakeCount).toBe(0);
  });

  it("does not derive keystrokeCount from the actions array", () => {
    const draft = createAttemptDraft({
      keystrokeCount: 0,
      actions: [
        { type: "vim_command", command: "d" },
        { type: "vim_command", command: "w" },
      ],
    });

    const normalized = normalizePersistedAttemptDraft(draft);

    expect(normalized.keystrokeCount).toBe(0);
  });
});

describe("normalizeResumedDraftMode", () => {
  it("sets currentMode to normal", () => {
    const draft = createAttemptDraft({ currentMode: "insert" });

    expect(normalizeResumedDraftMode(draft).currentMode).toBe("normal");
  });

  it("re-fingerprints a persisted mistake matching the current snapshot's persisted mode to normal mode", () => {
    const draft = createAttemptDraft({
      currentContent: "const restoredName = true;",
      currentCursor: { line: 0, column: 18 },
      currentMode: "insert",
      lastMistakeFingerprint: '["const restoredName = true;",0,18,"insert"]',
    });

    const normalized = normalizeResumedDraftMode(draft);

    expect(normalized.lastMistakeFingerprint).toBe(
      '["const restoredName = true;",0,18,"normal"]',
    );
  });

  it("leaves a fingerprint that does not represent the current snapshot unchanged", () => {
    const draft = createAttemptDraft({
      currentContent: "const restoredName = true;",
      currentCursor: { line: 0, column: 18 },
      currentMode: "normal",
      lastMistakeFingerprint: '["some other snapshot",1,2,"normal"]',
    });

    const normalized = normalizeResumedDraftMode(draft);

    expect(normalized.lastMistakeFingerprint).toBe(
      '["some other snapshot",1,2,"normal"]',
    );
  });

  it("leaves a null fingerprint unchanged", () => {
    const draft = createAttemptDraft({ lastMistakeFingerprint: null });

    expect(normalizeResumedDraftMode(draft).lastMistakeFingerprint).toBeNull();
  });
});
