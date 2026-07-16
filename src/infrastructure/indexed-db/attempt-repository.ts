import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

export type AttemptSyncStatus = "pending" | "synced";

export interface StoredAttempt extends AttemptSyncInput {
  syncStatus: AttemptSyncStatus;
}

export class AttemptRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async save(
    attempt: AttemptSyncInput,
    syncStatus: AttemptSyncStatus = "pending",
  ): Promise<void> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.attempts,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const objectStore = transaction.objectStore(INDEXED_DB_STORES.attempts);
    const existingAttempt = await requestToPromise<StoredAttempt | undefined>(
      objectStore.get(attempt.clientAttemptId),
    );

    if (existingAttempt === undefined) {
      objectStore.add({
        ...attempt,
        syncStatus,
      } satisfies StoredAttempt);
    }

    await completion;
  }

  public async get(clientAttemptId: string): Promise<StoredAttempt | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.attempts,
      "readonly",
    );
    const storedAttempt = await requestToPromise<StoredAttempt | undefined>(
      transaction
        .objectStore(INDEXED_DB_STORES.attempts)
        .get(clientAttemptId),
    );

    return storedAttempt ?? null;
  }

  public async listPending(): Promise<StoredAttempt[]> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.attempts,
      "readonly",
    );

    return requestToPromise<StoredAttempt[]>(
      transaction
        .objectStore(INDEXED_DB_STORES.attempts)
        .index("syncStatus")
        .getAll("pending"),
    );
  }

  public async markSynced(clientAttemptId: string): Promise<void> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.attempts,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const objectStore = transaction.objectStore(INDEXED_DB_STORES.attempts);
    const attempt = await requestToPromise<StoredAttempt | undefined>(
      objectStore.get(clientAttemptId),
    );

    if (attempt !== undefined) {
      objectStore.put({
        ...attempt,
        syncStatus: "synced",
      } satisfies StoredAttempt);
    }

    await completion;
  }
}
