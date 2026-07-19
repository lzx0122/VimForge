import type { AttemptDraft } from "../../types/attempt";
import type { PracticeSession } from "../../types/session";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

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
      attemptDraft: storedSession.attemptDraft,
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
