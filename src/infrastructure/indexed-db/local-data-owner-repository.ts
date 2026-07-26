import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

const LOCAL_DATA_OWNER_KEY = "local-data-owner";

interface LocalDataOwnerRecord {
  key: typeof LOCAL_DATA_OWNER_KEY;
  userId: string;
}

export class LocalDataOwnerConflictError extends Error {
  public constructor(
    public readonly existingUserId: string,
    public readonly requestedUserId: string,
  ) {
    super(
      `Local data already belongs to user ${existingUserId}; cannot bind it to ${requestedUserId}.`,
    );
  }
}

/**
 * Binds the local IndexedDB database to exactly one account, so cloud
 * hydration never merges two different users' data into one local store.
 * Stored in the existing metadata store rather than a dedicated one, so
 * binding an account never requires a schema upgrade.
 */
export class LocalDataOwnerRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async bind(userId: string): Promise<void> {
    if (userId.trim().length === 0) {
      throw new Error("Cannot bind local data to an empty user id.");
    }

    const transaction = this.database.transaction(
      INDEXED_DB_STORES.metadata,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const store = transaction.objectStore(INDEXED_DB_STORES.metadata);

    try {
      const existing = await requestToPromise<
        LocalDataOwnerRecord | undefined
      >(store.get(LOCAL_DATA_OWNER_KEY));

      if (existing === undefined) {
        store.put({
          key: LOCAL_DATA_OWNER_KEY,
          userId,
        } satisfies LocalDataOwnerRecord);
      } else if (existing.userId !== userId) {
        throw new LocalDataOwnerConflictError(existing.userId, userId);
      }
    } catch (error: unknown) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }

    await completion;
  }
}
