import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CloudHydrationMetadata } from "../../types/cloud-learning-state";
import { CloudHydrationMetadataRepository } from "./cloud-hydration-metadata-repository";
import {
  deleteVimForgeDatabase,
  INDEXED_DB_STORES,
  openVimForgeDatabase,
  transactionToPromise,
} from "./database";

const DATABASE_NAME = "vim-forge-cloud-hydration-metadata-test";

function metadata(
  overrides: Partial<CloudHydrationMetadata> = {},
): CloudHydrationMetadata {
  return {
    key: "cloud-hydration",
    userId: "user-a",
    attemptsCursor: {
      createdAt: "2026-07-16T08:00:00.000Z",
      clientAttemptId: "attempt-1",
    },
    masteryCursor: {
      updatedAt: "2026-07-15T08:00:00.000Z",
      skillId: "skill-1",
    },
    reviewsCursor: {
      updatedAt: "2026-07-16T00:00:00.000Z",
      exerciseId: "exercise-1",
    },
    completedAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

async function seed(database: IDBDatabase, record: unknown): Promise<void> {
  const transaction = database.transaction(
    INDEXED_DB_STORES.metadata,
    "readwrite",
  );
  transaction.objectStore(INDEXED_DB_STORES.metadata).put(record);
  await transactionToPromise(transaction);
}

describe("CloudHydrationMetadataRepository", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  describe("get", () => {
    it("returns schema-version-1 empty cursors when no record exists", async () => {
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(repository.get("user-a")).resolves.toEqual({
        key: "cloud-hydration",
        userId: "user-a",
        attemptsCursor: null,
        masteryCursor: null,
        reviewsCursor: null,
        completedAt: null,
        schemaVersion: 1,
      });
    });

    it("round-trips existing valid metadata", async () => {
      await seed(database, metadata());
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(repository.get("user-a")).resolves.toEqual(metadata());
    });

    it("throws when the stored metadata belongs to a different user", async () => {
      await seed(database, metadata({ userId: "user-a" }));
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(repository.get("user-b")).rejects.toThrow();
    });

    it("throws when the stored schema version is unsupported", async () => {
      await seed(database, {
        ...metadata(),
        schemaVersion: 2,
      });
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(repository.get("user-a")).rejects.toThrow();
    });

    it("throws when a cursor has an invalid shape", async () => {
      await seed(database, {
        ...metadata(),
        attemptsCursor: { createdAt: "2026-07-16T08:00:00.000Z" },
      });
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(repository.get("user-a")).rejects.toThrow();
    });

    it("throws when a cursor timestamp has an out-of-range minute component", async () => {
      await seed(database, {
        ...metadata(),
        attemptsCursor: {
          createdAt: "2026-07-16T08:60:00Z",
          clientAttemptId: "attempt-1",
        },
      });
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(repository.get("user-a")).rejects.toThrow();
    });

    it("throws when a cursor timestamp has an out-of-range UTC offset", async () => {
      await seed(database, {
        ...metadata(),
        masteryCursor: {
          updatedAt: "2026-07-15T08:00:00+99:99",
          skillId: "skill-1",
        },
      });
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(repository.get("user-a")).rejects.toThrow();
    });

    it("accepts a valid offset timestamp with extended fractional precision unchanged", async () => {
      const timestamp = "2026-07-20T17:00:00.123456+08:00";
      await seed(database, {
        ...metadata(),
        attemptsCursor: {
          createdAt: timestamp,
          clientAttemptId: "attempt-1",
        },
      });
      const repository = new CloudHydrationMetadataRepository(database);

      const result = await repository.get("user-a");

      expect(result.attemptsCursor?.createdAt).toBe(timestamp);
    });
  });

  describe("markCompleted", () => {
    it("preserves all cursors", async () => {
      await seed(database, metadata());
      const repository = new CloudHydrationMetadataRepository(database);

      await repository.markCompleted("user-a", "2026-07-20T09:00:00.000Z");

      await expect(repository.get("user-a")).resolves.toEqual(
        metadata({ completedAt: "2026-07-20T09:00:00.000Z" }),
      );
    });

    it("rejects an invalid completion timestamp without touching the stored record", async () => {
      await seed(database, metadata());
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(
        repository.markCompleted("user-a", "not-a-timestamp"),
      ).rejects.toThrow();

      await expect(repository.get("user-a")).resolves.toEqual(metadata());
    });

    it("rejects an invalid completion second without mutating the stored record", async () => {
      await seed(database, metadata());
      const repository = new CloudHydrationMetadataRepository(database);

      await expect(
        repository.markCompleted("user-a", "2026-07-20T09:00:60Z"),
      ).rejects.toThrow();

      await expect(repository.get("user-a")).resolves.toEqual(metadata());
    });
  });
});
