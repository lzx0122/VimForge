import { createPinia, setActivePinia } from "pinia";
import { isReactive } from "vue";
import { beforeEach, describe, expect, it } from "vitest";

import type { AttemptDraft } from "../types/attempt";
import type { PracticeSession } from "../types/session";
import { usePracticeStore } from "./practice-store";

const SESSION_STARTED_AT = "2026-07-16T08:00:00.000Z";

function createAttemptDraft(exerciseId = "exercise-1"): AttemptDraft {
  return {
    clientAttemptId: `attempt-${exerciseId}`,
    exerciseId,
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    startedAt: SESSION_STARTED_AT,
    completedAt: null,
    initialContent: "const oldName = true;",
    currentContent: "const newName = true;",
    initialCursor: { line: 0, column: 6 },
    currentCursor: { line: 0, column: 13 },
    currentMode: "normal",
    actions: [{ type: "vim_command", command: "ciw" }],
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    completed: false,
  };
}

describe("usePracticeStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("creates an active exercise plan at the first exercise", () => {
    const store = usePracticeStore();

    const session = store.createSession({
      id: "session-1",
      learningMode: "memory_review",
      selectionType: "topic_practice",
      requestedCount: 5,
      exerciseIds: ["exercise-1", "exercise-2"],
      selectedSkillIds: ["skill-motion"],
      startedAt: SESSION_STARTED_AT,
    });

    expect(session).toMatchObject({
      id: "session-1",
      status: "active",
      currentIndex: 0,
      exerciseIds: ["exercise-1", "exercise-2"],
      selectedSkillIds: ["skill-motion"],
      completedAt: null,
      startedAt: SESSION_STARTED_AT,
      updatedAt: SESSION_STARTED_AT,
    });
    expect(store.currentExerciseId).toBe("exercise-1");
  });

  it("keeps a serializable attempt draft without editor state", () => {
    const store = usePracticeStore();
    const draft = createAttemptDraft();

    store.saveAttemptDraft(draft);

    expect(store.attemptDraft).toEqual(draft);
    expect(Object.keys(store.$state).sort()).toEqual([
      "attemptDraft",
      "session",
    ]);
    expect("editorView" in store.$state).toBe(false);
    expect(() => JSON.stringify(store.$state)).not.toThrow();
  });

  it("completes exercises, advances currentIndex, and completes the plan", () => {
    const store = usePracticeStore();
    store.createSession({
      id: "session-1",
      learningMode: "memory_review",
      selectionType: "daily_review",
      requestedCount: 5,
      exerciseIds: ["exercise-1", "exercise-2"],
      startedAt: SESSION_STARTED_AT,
    });
    store.saveAttemptDraft(createAttemptDraft("exercise-1"));

    store.completeCurrentExercise("2026-07-16T08:01:00.000Z");

    expect(store.session).toMatchObject({
      currentIndex: 1,
      status: "active",
      completedAt: null,
    });
    expect(store.currentExerciseId).toBe("exercise-2");
    expect(store.attemptDraft).toMatchObject({
      completed: true,
      completedAt: "2026-07-16T08:01:00.000Z",
    });

    store.saveAttemptDraft(createAttemptDraft("exercise-2"));
    store.completeCurrentExercise("2026-07-16T08:02:00.000Z");

    expect(store.session).toMatchObject({
      currentIndex: 2,
      status: "completed",
      completedAt: "2026-07-16T08:02:00.000Z",
    });
    expect(store.currentExerciseId).toBeNull();
  });

  it("records a skipped draft as incomplete and advances", () => {
    const store = usePracticeStore();
    store.createSession({
      id: "session-1",
      learningMode: "efficiency",
      selectionType: "weakness_practice",
      requestedCount: 5,
      exerciseIds: ["exercise-1", "exercise-2"],
      startedAt: SESSION_STARTED_AT,
    });
    store.saveAttemptDraft(createAttemptDraft());

    store.skipCurrentExercise("2026-07-16T08:01:00.000Z");

    expect(store.session?.currentIndex).toBe(1);
    expect(store.currentExerciseId).toBe("exercise-2");
    expect(store.attemptDraft).toMatchObject({
      completed: false,
      completedAt: "2026-07-16T08:01:00.000Z",
    });
  });

  it("leaves state unchanged when an already completed plan cannot advance", () => {
    const store = usePracticeStore();
    store.createSession({
      id: "session-1",
      learningMode: "memory_review",
      selectionType: "daily_review",
      requestedCount: 5,
      exerciseIds: ["exercise-1"],
      startedAt: SESSION_STARTED_AT,
    });
    store.saveAttemptDraft(createAttemptDraft());
    store.completeCurrentExercise("2026-07-16T08:01:00.000Z");
    const completedState = JSON.stringify(store.$state);

    expect(() =>
      store.skipCurrentExercise("2026-07-16T08:02:00.000Z"),
    ).toThrow("Only an active practice session can advance.");
    expect(JSON.stringify(store.$state)).toBe(completedState);
  });

  it("restores a persisted session and can discard only its attempt draft", () => {
    const store = usePracticeStore();
    const persistedSession: PracticeSession = {
      id: "session-1",
      learningMode: "memory_review",
      selectionType: "daily_review",
      requestedCount: 5,
      status: "active",
      currentIndex: 1,
      exerciseIds: ["exercise-1", "exercise-2"],
      selectedSkillIds: [],
      startedAt: SESSION_STARTED_AT,
      completedAt: null,
      updatedAt: "2026-07-16T08:01:00.000Z",
    };

    store.restoreSession(persistedSession, createAttemptDraft("exercise-2"));

    expect(store.currentExerciseId).toBe("exercise-2");
    expect(store.attemptDraft?.exerciseId).toBe("exercise-2");

    store.discardAttemptDraft();

    expect(store.session?.id).toBe("session-1");
    expect(store.attemptDraft).toBeNull();
  });

  it("abandons an active session without creating a failed attempt", () => {
    const store = usePracticeStore();
    store.createSession({
      id: "session-1",
      learningMode: "memory_review",
      selectionType: "daily_review",
      requestedCount: 5,
      exerciseIds: ["exercise-1", "exercise-2"],
      startedAt: SESSION_STARTED_AT,
    });
    store.saveAttemptDraft(createAttemptDraft());

    const abandonedSession = store.abandonSession(
      "2026-07-16T08:01:00.000Z",
    );

    expect(abandonedSession).toMatchObject({
      status: "abandoned",
      currentIndex: 0,
      completedAt: "2026-07-16T08:01:00.000Z",
      updatedAt: "2026-07-16T08:01:00.000Z",
    });
    expect(isReactive(abandonedSession.exerciseIds)).toBe(false);
    expect(isReactive(abandonedSession.selectedSkillIds)).toBe(false);
    expect(store.attemptDraft).toBeNull();
  });

  it("resets all practice session state", () => {
    const store = usePracticeStore();
    store.createSession({
      id: "session-1",
      learningMode: "beginner",
      selectionType: "course",
      requestedCount: null,
      exerciseIds: ["exercise-1"],
      startedAt: SESSION_STARTED_AT,
    });
    store.saveAttemptDraft(createAttemptDraft());

    store.resetSession();

    expect(store.session).toBeNull();
    expect(store.attemptDraft).toBeNull();
    expect(store.currentExerciseId).toBeNull();
  });
});
