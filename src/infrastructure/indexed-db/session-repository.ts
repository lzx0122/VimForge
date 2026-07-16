import type { PracticeSession } from "../../types/session";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

export class SessionRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async save(session: PracticeSession): Promise<void> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);

    transaction.objectStore(INDEXED_DB_STORES.sessions).put(session);

    await completion;
  }

  public async get(id: string): Promise<PracticeSession | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readonly",
    );
    const session = await requestToPromise<PracticeSession | undefined>(
      transaction.objectStore(INDEXED_DB_STORES.sessions).get(id),
    );

    return session ?? null;
  }

  public async getActive(): Promise<PracticeSession | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.sessions,
      "readonly",
    );
    const session = await requestToPromise<PracticeSession | undefined>(
      transaction
        .objectStore(INDEXED_DB_STORES.sessions)
        .index("status")
        .get("active"),
    );

    return session ?? null;
  }
}
