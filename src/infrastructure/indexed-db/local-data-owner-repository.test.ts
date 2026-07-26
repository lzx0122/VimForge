import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteVimForgeDatabase,
  INDEXED_DB_STORES,
  openVimForgeDatabase,
  requestToPromise,
  VIM_FORGE_DATABASE_VERSION,
} from "./database";
import {
  LocalDataOwnerConflictError,
  LocalDataOwnerRepository,
} from "./local-data-owner-repository";

const DATABASE_NAME = "vim-forge-local-data-owner-test";
const LOCAL_DATA_OWNER_KEY = "local-data-owner";

async function readStoredOwner(
  database: IDBDatabase,
): Promise<{ key: string; userId: string } | undefined> {
  return requestToPromise<{ key: string; userId: string } | undefined>(
    database
      .transaction(INDEXED_DB_STORES.metadata, "readonly")
      .objectStore(INDEXED_DB_STORES.metadata)
      .get(LOCAL_DATA_OWNER_KEY),
  );
}

describe("LocalDataOwnerRepository", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  it("binds user A when no owner is recorded yet", async () => {
    const repository = new LocalDataOwnerRepository(database);

    await repository.bind("user-a");

    await expect(readStoredOwner(database)).resolves.toEqual({
      key: LOCAL_DATA_OWNER_KEY,
      userId: "user-a",
    });
  });

  it("is idempotent when binding user A again", async () => {
    const repository = new LocalDataOwnerRepository(database);

    await repository.bind("user-a");
    await expect(repository.bind("user-a")).resolves.toBeUndefined();

    await expect(readStoredOwner(database)).resolves.toEqual({
      key: LOCAL_DATA_OWNER_KEY,
      userId: "user-a",
    });
  });

  it("throws a typed conflict when binding user B after user A", async () => {
    const repository = new LocalDataOwnerRepository(database);
    await repository.bind("user-a");

    const rejection = repository.bind("user-b");

    await expect(rejection).rejects.toBeInstanceOf(
      LocalDataOwnerConflictError,
    );
    await expect(rejection).rejects.toMatchObject({
      existingUserId: "user-a",
      requestedUserId: "user-b",
    });
  });

  it("leaves user A's record unchanged after a conflicting bind", async () => {
    const repository = new LocalDataOwnerRepository(database);
    await repository.bind("user-a");

    await expect(repository.bind("user-b")).rejects.toThrow();

    await expect(readStoredOwner(database)).resolves.toEqual({
      key: LOCAL_DATA_OWNER_KEY,
      userId: "user-a",
    });
  });

  it("rejects an empty or whitespace user id without recording anything", async () => {
    const repository = new LocalDataOwnerRepository(database);

    await expect(repository.bind("")).rejects.toThrow();
    await expect(repository.bind("   ")).rejects.toThrow();

    await expect(readStoredOwner(database)).resolves.toBeUndefined();
  });

  it("uses the existing metadata store and leaves the database version unchanged", async () => {
    const repository = new LocalDataOwnerRepository(database);

    await repository.bind("user-a");

    expect(database.version).toBe(VIM_FORGE_DATABASE_VERSION);
    expect(
      database.objectStoreNames.contains(INDEXED_DB_STORES.metadata),
    ).toBe(true);
    expect(database.objectStoreNames.contains(LOCAL_DATA_OWNER_KEY)).toBe(
      false,
    );
  });
});
