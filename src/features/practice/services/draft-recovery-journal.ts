import type { AttemptDraft } from "../../../types/attempt";

const STORAGE_KEY_PREFIX = "vimforge:draft-recovery:";

interface RecoveryJournalEntry {
  sessionId: string;
  draft: AttemptDraft;
}

function storageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
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

/**
 * Synchronous, best-effort recovery aid for the reload window between a
 * physical keypress and an abrupt page teardown: Chromium can tear down the
 * page before the draft-save scheduler's queued microtask and its
 * IndexedDB transaction complete (unlike Firefox/WebKit, which reliably let
 * that in-flight work finish). localStorage writes are synchronous and
 * complete within the same task as the triggering input event, so they
 * survive that teardown when the IndexedDB write does not.
 */
export function writeDraftRecoveryJournal(
  sessionId: string,
  draft: AttemptDraft,
): void {
  try {
    localStorage.setItem(
      storageKey(sessionId),
      JSON.stringify({ sessionId, draft } satisfies RecoveryJournalEntry),
    );
  } catch {
    // localStorage can throw (quota exceeded, disabled, private mode): the
    // journal is a best-effort recovery aid, never a required dependency.
  }
}

export function readDraftRecoveryJournal(
  sessionId: string,
): AttemptDraft | null {
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
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const entry = parsed as Record<string, unknown>;
  if (entry.sessionId !== sessionId || !isAttemptDraftShaped(entry.draft)) {
    return null;
  }

  return entry.draft;
}

export function clearDraftRecoveryJournal(sessionId: string): void {
  try {
    localStorage.removeItem(storageKey(sessionId));
  } catch {
    // best-effort, see writeDraftRecoveryJournal.
  }
}

/**
 * Reconciles the durable IndexedDB Draft against the synchronous recovery
 * journal. keystrokeCount only ever increases within a single Attempt's
 * lifetime (Restart preserves it; only Retry resets it under a new
 * clientAttemptId), so for the same Attempt it is a reliable recency
 * signal without needing wall-clock timestamps. A journal entry for a
 * different clientAttemptId is never trusted over IndexedDB - without a
 * shared identity to compare recency against, keeping IndexedDB's own
 * record avoids clobbering a durably-completed transition (e.g. Retry)
 * with a stale journal left over from an earlier Attempt.
 */
export function selectRecoveryDraft(
  persisted: AttemptDraft | null,
  journal: AttemptDraft | null,
): AttemptDraft | null {
  if (journal === null) {
    return persisted;
  }
  if (persisted === null) {
    return journal;
  }
  if (journal.clientAttemptId !== persisted.clientAttemptId) {
    return persisted;
  }

  return journal.keystrokeCount >= persisted.keystrokeCount ? journal : persisted;
}
