import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AttemptDraft } from "../../../types/attempt";
import {
  clearDraftRecoveryJournal,
  readDraftRecoveryJournal,
  selectRecoveryDraft,
  writeDraftRecoveryJournal,
} from "./draft-recovery-journal";

function draft(overrides: Partial<AttemptDraft> = {}): AttemptDraft {
  return {
    clientAttemptId: "attempt-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "beginner",
    source: "web",
    startedAt: "2026-07-25T08:00:00.000Z",
    completedAt: null,
    initialContent: "const name = true;",
    currentContent: "const name = true;",
    initialCursor: { line: 0, column: 6 },
    currentCursor: { line: 0, column: 6 },
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

describe("draft recovery journal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("writeDraftRecoveryJournal / readDraftRecoveryJournal", () => {
    it("writes the newest attempt state to the recovery mechanism and reads it back", () => {
      const savedDraft = draft({ keystrokeCount: 3 });

      writeDraftRecoveryJournal("session-1", savedDraft);

      expect(readDraftRecoveryJournal("session-1")).toEqual(savedDraft);
    });

    it("does not mix drafts belonging to different sessions", () => {
      writeDraftRecoveryJournal("session-a", draft({ clientAttemptId: "attempt-a" }));
      writeDraftRecoveryJournal("session-b", draft({ clientAttemptId: "attempt-b" }));

      expect(readDraftRecoveryJournal("session-a")?.clientAttemptId).toBe(
        "attempt-a",
      );
      expect(readDraftRecoveryJournal("session-b")?.clientAttemptId).toBe(
        "attempt-b",
      );
    });

    it("returns null when nothing has been written for a session", () => {
      expect(readDraftRecoveryJournal("never-written")).toBeNull();
    });

    it("ignores malformed recovery data instead of throwing", () => {
      localStorage.setItem("vimforge:draft-recovery:session-1", "not json");
      expect(() => readDraftRecoveryJournal("session-1")).not.toThrow();
      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("ignores a structurally incomplete recovery entry", () => {
      localStorage.setItem(
        "vimforge:draft-recovery:session-1",
        JSON.stringify({ sessionId: "session-1", draft: { clientAttemptId: "x" } }),
      );

      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("ignores an entry whose embedded sessionId does not match the requested key", () => {
      localStorage.setItem(
        "vimforge:draft-recovery:session-1",
        JSON.stringify({ sessionId: "some-other-session", draft: draft() }),
      );

      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("clears the recovery entry for a session", () => {
      writeDraftRecoveryJournal("session-1", draft());
      clearDraftRecoveryJournal("session-1");

      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });
  });

  describe("selectRecoveryDraft", () => {
    it("restores the journal when IndexedDB has no persisted Draft at all", () => {
      const journalDraft = draft({ keystrokeCount: 1 });

      expect(selectRecoveryDraft(null, journalDraft)).toEqual(journalDraft);
    });

    it("restores the journal when it represents a strictly newer state for the same Attempt", () => {
      const persisted = draft({ clientAttemptId: "attempt-1", keystrokeCount: 1 });
      const journalDraft = draft({ clientAttemptId: "attempt-1", keystrokeCount: 2 });

      expect(selectRecoveryDraft(persisted, journalDraft)).toEqual(journalDraft);
    });

    it("does not replace a newer IndexedDB draft with stale recovery data", () => {
      const persisted = draft({ clientAttemptId: "attempt-1", keystrokeCount: 5 });
      const journalDraft = draft({ clientAttemptId: "attempt-1", keystrokeCount: 2 });

      expect(selectRecoveryDraft(persisted, journalDraft)).toEqual(persisted);
    });

    it("keeps the persisted Draft when the journal belongs to a different Attempt", () => {
      const persisted = draft({ clientAttemptId: "attempt-2", keystrokeCount: 0 });
      const journalDraft = draft({ clientAttemptId: "attempt-1", keystrokeCount: 99 });

      expect(selectRecoveryDraft(persisted, journalDraft)).toEqual(persisted);
    });

    it("returns the persisted Draft unchanged when there is no journal entry", () => {
      const persisted = draft({ keystrokeCount: 4 });

      expect(selectRecoveryDraft(persisted, null)).toEqual(persisted);
    });

    it("returns null when neither a persisted Draft nor a journal entry exists", () => {
      expect(selectRecoveryDraft(null, null)).toBeNull();
    });

    it("keeps the winning Draft's identity and telemetry fully intact, not partially merged", () => {
      const persisted = draft({
        clientAttemptId: "attempt-1",
        startedAt: "2026-07-25T08:00:00.000Z",
        keystrokeCount: 1,
        mistakeCount: 1,
        resetCount: 1,
      });
      const journalDraft = draft({
        clientAttemptId: "attempt-1",
        startedAt: "2026-07-25T08:00:00.000Z",
        keystrokeCount: 3,
        mistakeCount: 0,
        resetCount: 0,
        currentContent: "const renamed = true;",
      });

      const result = selectRecoveryDraft(persisted, journalDraft);

      expect(result).toEqual(journalDraft);
      expect(result).not.toEqual(persisted);
    });
  });
});
