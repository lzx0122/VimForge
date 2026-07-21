import type { AttemptDraft } from "../../types/attempt";
import type { PracticeSession } from "../../types/session";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

function normalizeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : 0;
}

/**
 * Version-1 IndexedDB records were persisted before keystrokeCount and
 * lastMistakeFingerprint existed, so a stored Draft may lack them (or hold
 * corrupted counters) at runtime despite the type requiring them. Normalize
 * at this repository boundary so every caller receives a genuinely complete
 * AttemptDraft.
 */
export function normalizePersistedAttemptDraft(
  draft: AttemptDraft,
): AttemptDraft {
  const persisted = draft as AttemptDraft & {
    keystrokeCount?: unknown;
    mistakeCount?: unknown;
    lastMistakeFingerprint?: unknown;
  };

  return {
    ...draft,
    initialCursor: { ...draft.initialCursor },
    currentCursor: { ...draft.currentCursor },
    actions: draft.actions.map((action) => ({ ...action })),
    keystrokeCount: normalizeNonNegativeInteger(
      persisted.keystrokeCount,
    ),
    mistakeCount: normalizeNonNegativeInteger(
      persisted.mistakeCount,
    ),
    lastMistakeFingerprint:
      typeof persisted.lastMistakeFingerprint === "string"
        ? persisted.lastMistakeFingerprint
        : null,
  };
}

function buildSnapshotFingerprint(
  content: string,
  cursor: { line: number; column: number },
  mode: string,
): string {
  return JSON.stringify([content, cursor.line, cursor.column, mode]);
}

/**
 * P1 does not restore Insert, Visual, Replace, or Command mode: an
 * unfinished Draft always resumes in Normal Mode. When the persisted
 * lastMistakeFingerprint represents the persisted current snapshot (in its
 * original, persisted mode), re-fingerprint it to Normal Mode too - a
 * reload must not let VimEditor's Normal-Mode mount silently make an
 * already-counted failed snapshot look new again.
 */
export function normalizeResumedDraftMode(
  draft: AttemptDraft,
): AttemptDraft {
  const currentFingerprint = buildSnapshotFingerprint(
    draft.currentContent,
    draft.currentCursor,
    draft.currentMode,
  );

  const lastMistakeFingerprint =
    draft.lastMistakeFingerprint === currentFingerprint
      ? buildSnapshotFingerprint(
          draft.currentContent,
          draft.currentCursor,
          "normal",
        )
      : draft.lastMistakeFingerprint;

  return {
    ...draft,
    currentCursor: { ...draft.currentCursor },
    currentMode: "normal",
    lastMistakeFingerprint,
  };
}

export interface StoredSessionRecord {
  id: string;
  status: PracticeSession["status"];
  session: PracticeSession;
  attemptDraft: AttemptDraft | null;
}

export interface ResumeState {
  session: PracticeSession;
  attemptDraft: AttemptDraft | null;
}

export function toStoredSession(
  session: PracticeSession,
  attemptDraft: AttemptDraft | null,
): StoredSessionRecord {
  return {
    id: session.id,
    status: session.status,
    session,
    attemptDraft,
  };
}

/**
 * Version-1 IndexedDB records were persisted before `actualCount` existed, so
 * a stored record's `session` may lack it at runtime despite the type
 * requiring it. Normalize at this repository boundary so every caller
 * receives a genuinely complete PracticeSession.
 */
export function normalizePersistedSession(
  session: PracticeSession,
): PracticeSession {
  if (typeof session.actualCount === "number") {
    return session;
  }

  return {
    ...session,
    actualCount: session.exerciseIds.length,
  };
}

export class SessionRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async save(
    session: PracticeSession,
    attemptDraft: AttemptDraft | null = null,
  ): Promise<void> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);

    transaction
      .objectStore(INDEXED_DB_STORES.sessions)
      .put(toStoredSession(session, attemptDraft));

    await completion;
  }

  public async get(id: string): Promise<PracticeSession | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readonly",
    );
    const storedSession = await requestToPromise<
      StoredSessionRecord | undefined
    >(
      transaction.objectStore(INDEXED_DB_STORES.sessions).get(id),
    );

    return storedSession === undefined
      ? null
      : normalizePersistedSession(storedSession.session);
  }

  public async getActive(): Promise<PracticeSession | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readonly",
    );
    const storedSession = await requestToPromise<
      StoredSessionRecord | undefined
    >(
      transaction
        .objectStore(INDEXED_DB_STORES.sessions)
        .index("status")
        .get("active"),
    );

    return storedSession === undefined
      ? null
      : normalizePersistedSession(storedSession.session);
  }

  public async getResumeState(id: string): Promise<ResumeState | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readonly",
    );
    const storedSession = await requestToPromise<
      StoredSessionRecord | undefined
    >(transaction.objectStore(INDEXED_DB_STORES.sessions).get(id));

    if (storedSession === undefined) {
      return null;
    }

    return {
      session: normalizePersistedSession(storedSession.session),
      attemptDraft:
        storedSession.attemptDraft === null
          ? null
          : normalizeResumedDraftMode(
              normalizePersistedAttemptDraft(storedSession.attemptDraft),
            ),
    };
  }

  public async saveAttemptDraft(
    sessionId: string,
    attemptDraft: AttemptDraft | null,
  ): Promise<void> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const objectStore = transaction.objectStore(INDEXED_DB_STORES.sessions);
    const storedSession = await requestToPromise<
      StoredSessionRecord | undefined
    >(objectStore.get(sessionId));

    if (storedSession === undefined) {
      transaction.abort();
      await completion;
      return;
    }

    objectStore.put({
      ...storedSession,
      attemptDraft,
    } satisfies StoredSessionRecord);

    await completion;
  }
}
