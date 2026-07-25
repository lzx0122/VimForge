import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptDraft } from "../../../types/attempt";
import {
  clearDraftRecoveryJournalIfCurrent,
  persistDraftWithRecoveryJournal,
  readDraftRecoveryJournal,
  reconcileDraftRecoveryJournal,
  writeDraftRecoveryJournal,
} from "./draft-recovery-journal";

const STORAGE_KEY = "vimforge:draft-recovery:session-1";

function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    vi.restoreAllMocks();
  });

  describe("write / read", () => {
    it("writes the newest attempt state to the recovery mechanism and reads it back with a fresh operationId", () => {
      const savedDraft = draft({ keystrokeCount: 3 });

      const { operationId } = writeDraftRecoveryJournal("session-1", savedDraft);

      const record = readDraftRecoveryJournal("session-1");
      expect(record).not.toBeNull();
      expect(record?.operationId).toBe(operationId);
      expect(record?.value).toEqual(savedDraft);
    });

    it("supports a null tombstone value", () => {
      writeDraftRecoveryJournal("session-1", null);

      const record = readDraftRecoveryJournal("session-1");
      expect(record).not.toBeNull();
      expect(record?.value).toBeNull();
    });

    it("assigns a different operationId to each write", () => {
      const first = writeDraftRecoveryJournal("session-1", draft());
      const second = writeDraftRecoveryJournal("session-1", draft());

      expect(second.operationId).not.toBe(first.operationId);
    });

    it("does not mix drafts belonging to different sessions", () => {
      writeDraftRecoveryJournal("session-a", draft({ clientAttemptId: "attempt-a" }));
      writeDraftRecoveryJournal("session-b", draft({ clientAttemptId: "attempt-b" }));

      expect(readDraftRecoveryJournal("session-a")?.value?.clientAttemptId).toBe(
        "attempt-a",
      );
      expect(readDraftRecoveryJournal("session-b")?.value?.clientAttemptId).toBe(
        "attempt-b",
      );
    });

    it("returns null when nothing has been written for a session", () => {
      expect(readDraftRecoveryJournal("never-written")).toBeNull();
    });

    it("ignores malformed recovery data instead of throwing, and cleans it up", () => {
      localStorage.setItem(STORAGE_KEY, "not json");

      expect(() => readDraftRecoveryJournal("session-1")).not.toThrow();
      expect(readDraftRecoveryJournal("session-1")).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("ignores and cleans up a structurally incomplete recovery entry", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sessionId: "session-1",
          operationId: "op-1",
          value: { clientAttemptId: "x" },
        }),
      );

      expect(readDraftRecoveryJournal("session-1")).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("ignores and cleans up an entry whose embedded sessionId does not match the requested key", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sessionId: "some-other-session",
          operationId: "op-1",
          value: draft(),
        }),
      );

      expect(readDraftRecoveryJournal("session-1")).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("ignores an entry missing an operationId", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sessionId: "session-1", value: draft() }),
      );

      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("a failed replacement write does not leave the previous entry eligible for recovery", () => {
      writeDraftRecoveryJournal("session-1", draft({ keystrokeCount: 1 }));
      expect(readDraftRecoveryJournal("session-1")?.value?.keystrokeCount).toBe(1);

      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        });

      const result = writeDraftRecoveryJournal("session-1", draft({ keystrokeCount: 2 }));
      setItemSpy.mockRestore();

      // The failed write must not leave the stale keystrokeCount: 1 entry
      // sitting there for a later mount to wrongly recover.
      expect(readDraftRecoveryJournal("session-1")).toBeNull();
      expect(result.operationId).toBeTruthy();
    });
  });

  describe("clearDraftRecoveryJournalIfCurrent", () => {
    it("clears the journal when the operationId matches the current entry", () => {
      const { operationId } = writeDraftRecoveryJournal("session-1", draft());

      clearDraftRecoveryJournalIfCurrent("session-1", operationId);

      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("does not clear a newer journal entry when an older operation completes", () => {
      const older = writeDraftRecoveryJournal(
        "session-1",
        draft({ keystrokeCount: 1 }),
      );
      const newer = writeDraftRecoveryJournal(
        "session-1",
        draft({ keystrokeCount: 2 }),
      );

      // The older operation's completion must not erase the newer entry.
      clearDraftRecoveryJournalIfCurrent("session-1", older.operationId);

      const record = readDraftRecoveryJournal("session-1");
      expect(record?.operationId).toBe(newer.operationId);
      expect(record?.value?.keystrokeCount).toBe(2);
    });

    it("is a no-op when there is no journal entry at all", () => {
      expect(() =>
        clearDraftRecoveryJournalIfCurrent("session-1", "op-1"),
      ).not.toThrow();
      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });
  });

  describe("persistDraftWithRecoveryJournal", () => {
    it("clears the journal only after persist succeeds", async () => {
      const persist = vi.fn().mockResolvedValue(undefined);

      await persistDraftWithRecoveryJournal(
        "session-1",
        draft({ keystrokeCount: 3 }),
        persist,
      );

      expect(persist).toHaveBeenCalledTimes(1);
      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("keeps the matching journal and propagates the error when persist fails", async () => {
      const persist = vi.fn().mockRejectedValue(new Error("disk full"));

      await expect(
        persistDraftWithRecoveryJournal("session-1", draft(), persist),
      ).rejects.toThrow("disk full");

      expect(readDraftRecoveryJournal("session-1")).not.toBeNull();
    });

    it("does not resurrect a discarded Draft: a null tombstone is what gets persisted and cleared", async () => {
      // Simulates a prior in-progress edit's leftover journal entry.
      writeDraftRecoveryJournal("session-1", draft({ keystrokeCount: 9 }));
      const persist = vi.fn().mockResolvedValue(undefined);

      await persistDraftWithRecoveryJournal("session-1", null, persist);

      expect(persist).toHaveBeenCalledTimes(1);
      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("an older in-flight persist completing does not clear a newer journal entry written while it was pending", async () => {
      const olderPersist = createDeferred<void>();
      const olderCall = persistDraftWithRecoveryJournal(
        "session-1",
        draft({ keystrokeCount: 1 }),
        () => olderPersist.promise,
      );

      // A newer transition (e.g. the scheduler coalescing a second
      // schedule() call, or Restart racing a still-pending scheduled save)
      // writes its own journal entry while the older persist is in flight.
      const newer = writeDraftRecoveryJournal(
        "session-1",
        draft({ keystrokeCount: 2 }),
      );

      olderPersist.resolve();
      await olderCall;

      const record = readDraftRecoveryJournal("session-1");
      expect(record?.operationId).toBe(newer.operationId);
      expect(record?.value?.keystrokeCount).toBe(2);
    });
  });

  describe("reconcileDraftRecoveryJournal", () => {
    it("does nothing when there is no journal entry", async () => {
      const persistRecoveredValue = vi.fn().mockResolvedValue(undefined);

      const result = await reconcileDraftRecoveryJournal(
        "session-1",
        persistRecoveredValue,
      );

      expect(result).toEqual({ recovered: false, value: null });
      expect(persistRecoveredValue).not.toHaveBeenCalled();
    });

    it("recovers a Draft the journal has but IndexedDB never confirmed, and clears the journal", async () => {
      const pendingDraft = draft({
        keystrokeCount: 8,
        mistakeCount: 3,
        highestHintLevel: 2,
      });
      writeDraftRecoveryJournal("session-1", pendingDraft);
      const persistRecoveredValue = vi.fn().mockResolvedValue(undefined);

      const result = await reconcileDraftRecoveryJournal(
        "session-1",
        persistRecoveredValue,
      );

      // Equal keystrokeCount was never even a possibility here: the whole
      // Draft (including mistakeCount/highestHintLevel) is applied as one
      // unit, so a race that only changed non-keyboard fields is still
      // recovered correctly.
      expect(result).toEqual({ recovered: true, value: pendingDraft });
      expect(persistRecoveredValue).toHaveBeenCalledWith(pendingDraft);
      expect(readDraftRecoveryJournal("session-1")).toBeNull();
    });

    it("recovers a pending Retry (a different clientAttemptId) even though IndexedDB still has the previous Attempt", async () => {
      const retryDraft = draft({
        clientAttemptId: "attempt-retry",
        keystrokeCount: 0,
        mistakeCount: 0,
        resetCount: 0,
      });
      writeDraftRecoveryJournal("session-1", retryDraft);
      const persistRecoveredValue = vi.fn().mockResolvedValue(undefined);

      const result = await reconcileDraftRecoveryJournal(
        "session-1",
        persistRecoveredValue,
      );

      expect(result.value?.clientAttemptId).toBe("attempt-retry");
      expect(persistRecoveredValue).toHaveBeenCalledWith(retryDraft);
    });

    it("recovers a pending Reset/completion/Abandon tombstone even though IndexedDB still has the previous Draft", async () => {
      writeDraftRecoveryJournal("session-1", null);
      const persistRecoveredValue = vi.fn().mockResolvedValue(undefined);

      const result = await reconcileDraftRecoveryJournal(
        "session-1",
        persistRecoveredValue,
      );

      expect(result).toEqual({ recovered: true, value: null });
      expect(persistRecoveredValue).toHaveBeenCalledWith(null);
    });

    it("keeps the journal and propagates the error when persisting the recovered value fails", async () => {
      writeDraftRecoveryJournal("session-1", draft());
      const persistRecoveredValue = vi.fn().mockRejectedValue(new Error("disk full"));

      await expect(
        reconcileDraftRecoveryJournal("session-1", persistRecoveredValue),
      ).rejects.toThrow("disk full");

      expect(readDraftRecoveryJournal("session-1")).not.toBeNull();
    });

    it("ignores malformed journal data safely and does not call persistRecoveredValue", async () => {
      localStorage.setItem(STORAGE_KEY, "not json");
      const persistRecoveredValue = vi.fn().mockResolvedValue(undefined);

      const result = await reconcileDraftRecoveryJournal(
        "session-1",
        persistRecoveredValue,
      );

      expect(result).toEqual({ recovered: false, value: null });
      expect(persistRecoveredValue).not.toHaveBeenCalled();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("does not clear a newer journal entry when reconciling an older one whose persist resolves later", async () => {
      writeDraftRecoveryJournal("session-1", draft({ keystrokeCount: 1 }));
      const deferred = createDeferred<void>();
      const reconcilePromise = reconcileDraftRecoveryJournal(
        "session-1",
        () => deferred.promise,
      );

      // A newer write lands (e.g. a fresh keypress) while the recovered
      // value's own persistence is still pending.
      const newer = writeDraftRecoveryJournal(
        "session-1",
        draft({ keystrokeCount: 2 }),
      );

      deferred.resolve();
      await reconcilePromise;

      const record = readDraftRecoveryJournal("session-1");
      expect(record?.operationId).toBe(newer.operationId);
      expect(record?.value?.keystrokeCount).toBe(2);
    });
  });
});
