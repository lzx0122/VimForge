import type { AttemptDraft } from "../../../types/attempt";

const STORAGE_KEY_PREFIX = "vimforge:draft-recovery:";

export interface RecoveryJournalRecord {
  operationId: string;
  value: AttemptDraft | null;
}

interface StoredRecoveryJournalEntry {
  sessionId: string;
  operationId: string;
  value: AttemptDraft | null;
}

function storageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

function generateOperationId(): string {
  return crypto.randomUUID();
}

function isCursorShaped(
  value: unknown,
): value is { line: number; column: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).line === "number" &&
    typeof (value as Record<string, unknown>).column === "number"
  );
}

function isAttemptDraftShaped(value: unknown): value is AttemptDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.clientAttemptId === "string" &&
    typeof candidate.exerciseId === "string" &&
    typeof candidate.exerciseVersion === "number" &&
    typeof candidate.learningMode === "string" &&
    candidate.source === "web" &&
    typeof candidate.startedAt === "string" &&
    (candidate.completedAt === null || typeof candidate.completedAt === "string") &&
    typeof candidate.initialContent === "string" &&
    typeof candidate.currentContent === "string" &&
    isCursorShaped(candidate.initialCursor) &&
    isCursorShaped(candidate.currentCursor) &&
    typeof candidate.currentMode === "string" &&
    Array.isArray(candidate.actions) &&
    typeof candidate.keystrokeCount === "number" &&
    typeof candidate.mistakeCount === "number" &&
    (candidate.lastMistakeFingerprint === null ||
      typeof candidate.lastMistakeFingerprint === "string") &&
    typeof candidate.undoCount === "number" &&
    typeof candidate.resetCount === "number" &&
    typeof candidate.highestHintLevel === "number" &&
    typeof candidate.completed === "boolean"
  );
}

function removeRawEntry(sessionId: string): void {
  try {
    localStorage.removeItem(storageKey(sessionId));
  } catch {
    // best-effort: nothing more we can safely do if storage itself is
    // inaccessible (disabled, private-mode quirks, etc).
  }
}

/**
 * Synchronous write-ahead journal for the reload window between a durable
 * Draft transition being decided and its IndexedDB write completing.
 * Chromium can tear the page down before a queued microtask's IndexedDB
 * transaction finishes (Firefox/WebKit reliably let it finish); a
 * synchronous localStorage write completes within the same task as the
 * triggering event, so it survives that teardown when IndexedDB does not.
 *
 * Every write is stamped with a fresh operationId. Callers must persist the
 * exact same `value` to IndexedDB afterward, then call
 * clearDraftRecoveryJournalIfCurrent() with the returned operationId -
 * never an unconditional clear - so a newer write started while an older
 * IndexedDB write is still in flight can never be erased by that older
 * write's completion.
 *
 * `value: null` is a tombstone: every transition that discards the Draft
 * (Reset, successful completion, Abandon) must write one and durably
 * persist it, so an interrupted discard can never be reversed by
 * recovering an older Draft.
 */
export function writeDraftRecoveryJournal(
  sessionId: string,
  value: AttemptDraft | null,
): { operationId: string } {
  const operationId = generateOperationId();
  const key = storageKey(sessionId);
  const entry: StoredRecoveryJournalEntry = { sessionId, operationId, value };

  try {
    // Remove the previous entry before attempting to write the new one: if
    // the write below throws (quota exceeded, storage disabled, private
    // mode), the key is left absent rather than holding the stale previous
    // entry, which would otherwise remain eligible for a future recovery
    // even though a newer write was actually intended.
    localStorage.removeItem(key);
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    removeRawEntry(sessionId);
  }

  return { operationId };
}

/**
 * Reads the current journal entry for a session. Malformed, incomplete, or
 * mismatched-sessionId data is treated as absent and proactively removed
 * (not merely ignored), so a corrupted entry cannot linger indefinitely.
 */
export function readDraftRecoveryJournal(
  sessionId: string,
): RecoveryJournalRecord | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey(sessionId));
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeRawEntry(sessionId);
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    removeRawEntry(sessionId);
    return null;
  }

  const entry = parsed as Record<string, unknown>;
  const valueIsValid = entry.value === null || isAttemptDraftShaped(entry.value);

  if (
    entry.sessionId !== sessionId ||
    typeof entry.operationId !== "string" ||
    !valueIsValid
  ) {
    removeRawEntry(sessionId);
    return null;
  }

  return {
    operationId: entry.operationId,
    value: entry.value as AttemptDraft | null,
  };
}

/**
 * Clears the journal only when it still holds the exact operation that just
 * durably completed. An older in-flight write's completion must never erase
 * a newer write's journal entry - the Draft-save scheduler coalesces and
 * asynchronously saves state, so this identity check is required, not
 * optional.
 */
export function clearDraftRecoveryJournalIfCurrent(
  sessionId: string,
  operationId: string,
): void {
  const current = readDraftRecoveryJournal(sessionId);
  if (current !== null && current.operationId === operationId) {
    removeRawEntry(sessionId);
  }
}

/**
 * The required write-ahead ordering for every durable Draft transition
 * (scheduled saves aside, since their IndexedDB write is deferred/coalesced
 * by the scheduler rather than immediate): write the intended value to the
 * journal first, persist it, then clear only the matching operation. A
 * failed `persist` leaves the journal in place for a later attempt to pick
 * up; it is the caller's responsibility to decide whether to rethrow.
 */
export async function persistDraftWithRecoveryJournal(
  sessionId: string,
  value: AttemptDraft | null,
  persist: () => Promise<void>,
): Promise<void> {
  const { operationId } = writeDraftRecoveryJournal(sessionId, value);
  await persist();
  clearDraftRecoveryJournalIfCurrent(sessionId, operationId);
}

export interface RecoveryReconciliation {
  recovered: boolean;
  value: AttemptDraft | null;
}

/**
 * Mount-time recovery: a journal entry existing at all means its value's
 * IndexedDB write was never confirmed complete (every write site clears its
 * own operationId only after that confirmation), so it is, by
 * construction, the last known intended state - applied unconditionally,
 * never compared against whatever IndexedDB currently holds. This also
 * recovers an interrupted Retry (a different clientAttemptId) or an
 * interrupted Reset/completion/Abandon (a null tombstone) correctly,
 * neither of which a same-Attempt recency heuristic could distinguish from
 * genuinely stale data.
 */
export async function reconcileDraftRecoveryJournal(
  sessionId: string,
  persistRecoveredValue: (value: AttemptDraft | null) => Promise<void>,
): Promise<RecoveryReconciliation> {
  const record = readDraftRecoveryJournal(sessionId);
  if (record === null) {
    return { recovered: false, value: null };
  }

  await persistRecoveredValue(record.value);
  clearDraftRecoveryJournalIfCurrent(sessionId, record.operationId);

  return { recovered: true, value: record.value };
}
