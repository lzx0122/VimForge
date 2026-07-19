import { describe, expect, it } from "vitest";

import type { PracticeSession } from "../../types/session";
import { normalizePersistedSession } from "./session-repository";

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
