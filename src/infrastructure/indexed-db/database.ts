export const VIM_FORGE_DATABASE_NAME = "vim-forge";
export const VIM_FORGE_DATABASE_VERSION = 2;

export const INDEXED_DB_STORES = {
  attempts: "attempts",
  sessions: "sessions",
  settings: "settings",
  metadata: "metadata",
  skillMastery: "skillMastery",
  exerciseReviews: "exerciseReviews",
  learningOutcomes: "learningOutcomes",
} as const;

/**
 * Returns the object store, creating it first only if it doesn't already
 * exist. Safe to call on every upgrade regardless of the database's
 * starting version, so the schema never depends on which version a
 * database is upgrading from and existing stores are never recreated
 * (which would drop their data).
 */
function ensureStore(
  database: IDBDatabase,
  transaction: IDBTransaction,
  name: string,
  keyPath: string,
): IDBObjectStore {
  return database.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : database.createObjectStore(name, { keyPath });
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string,
): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function createSchema(
  database: IDBDatabase,
  transaction: IDBTransaction,
): void {
  const attempts = ensureStore(
    database,
    transaction,
    INDEXED_DB_STORES.attempts,
    "clientAttemptId",
  );
  ensureIndex(attempts, "syncStatus", "syncStatus");
  ensureIndex(attempts, "sessionId", "sessionId");
  ensureIndex(attempts, "exerciseId", "exerciseId");
  ensureIndex(attempts, "completedAt", "completedAt");

  const sessions = ensureStore(
    database,
    transaction,
    INDEXED_DB_STORES.sessions,
    "id",
  );
  ensureIndex(sessions, "status", "status");

  ensureStore(database, transaction, INDEXED_DB_STORES.settings, "key");
  ensureStore(database, transaction, INDEXED_DB_STORES.metadata, "key");

  ensureStore(
    database,
    transaction,
    INDEXED_DB_STORES.skillMastery,
    "skillId",
  );

  const exerciseReviews = ensureStore(
    database,
    transaction,
    INDEXED_DB_STORES.exerciseReviews,
    "exerciseId",
  );
  ensureIndex(exerciseReviews, "dueAt", "dueAt");
  ensureIndex(exerciseReviews, "updatedAt", "updatedAt");

  const learningOutcomes = ensureStore(
    database,
    transaction,
    INDEXED_DB_STORES.learningOutcomes,
    "clientAttemptId",
  );
  ensureIndex(learningOutcomes, "sessionId", "sessionId");
  ensureIndex(learningOutcomes, "exerciseId", "exerciseId");
  ensureIndex(learningOutcomes, "completedAt", "completedAt");
}

function requestError(request: IDBRequest, fallback: string): DOMException {
  return request.error ?? new DOMException(fallback, "UnknownError");
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(requestError(request, "IndexedDB request failed.")),
      { once: true },
    );
  });
}

export function transactionToPromise(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () =>
        reject(
          transaction.error ??
            new DOMException("IndexedDB transaction aborted.", "AbortError"),
        ),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () =>
        reject(
          transaction.error ??
            new DOMException("IndexedDB transaction failed.", "UnknownError"),
        ),
      { once: true },
    );
  });
}

export function openVimForgeDatabase(
  name = VIM_FORGE_DATABASE_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, VIM_FORGE_DATABASE_VERSION);

    request.addEventListener(
      "upgradeneeded",
      () => {
        const transaction = request.transaction;
        if (transaction === null) {
          throw new Error("Missing IndexedDB upgrade transaction.");
        }
        createSchema(request.result, transaction);
      },
      { once: true },
    );
    request.addEventListener(
      "success",
      () => {
        const database = request.result;
        database.addEventListener("versionchange", () => database.close());
        resolve(database);
      },
      { once: true },
    );
    request.addEventListener(
      "error",
      () => reject(requestError(request, "Unable to open IndexedDB.")),
      { once: true },
    );
    request.addEventListener(
      "blocked",
      () =>
        reject(
          new DOMException(
            "Opening IndexedDB is blocked by another connection.",
            "InvalidStateError",
          ),
        ),
      { once: true },
    );
  });
}

export function deleteVimForgeDatabase(
  name = VIM_FORGE_DATABASE_NAME,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.addEventListener("success", () => resolve(), { once: true });
    request.addEventListener(
      "error",
      () => reject(requestError(request, "Unable to delete IndexedDB.")),
      { once: true },
    );
    request.addEventListener(
      "blocked",
      () =>
        reject(
          new DOMException(
            "Deleting IndexedDB is blocked by an open connection.",
            "InvalidStateError",
          ),
        ),
      { once: true },
    );
  });
}
