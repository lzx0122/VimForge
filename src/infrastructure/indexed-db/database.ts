export const VIM_FORGE_DATABASE_NAME = "vim-forge";
export const VIM_FORGE_DATABASE_VERSION = 1;

export const INDEXED_DB_STORES = {
  attempts: "attempts",
  sessions: "sessions",
  settings: "settings",
  metadata: "metadata",
} as const;

function createSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(INDEXED_DB_STORES.attempts)) {
    const attempts = database.createObjectStore(INDEXED_DB_STORES.attempts, {
      keyPath: "clientAttemptId",
    });
    attempts.createIndex("syncStatus", "syncStatus", { unique: false });
  }

  if (!database.objectStoreNames.contains(INDEXED_DB_STORES.sessions)) {
    const sessions = database.createObjectStore(INDEXED_DB_STORES.sessions, {
      keyPath: "id",
    });
    sessions.createIndex("status", "status", { unique: false });
  }

  if (!database.objectStoreNames.contains(INDEXED_DB_STORES.settings)) {
    database.createObjectStore(INDEXED_DB_STORES.settings, {
      keyPath: "key",
    });
  }

  if (!database.objectStoreNames.contains(INDEXED_DB_STORES.metadata)) {
    database.createObjectStore(INDEXED_DB_STORES.metadata, {
      keyPath: "key",
    });
  }
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
      () => createSchema(request.result),
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
