import type {
  AttemptHydrationCursor,
  CloudHydrationMetadata,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "../../types/cloud-learning-state";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

const CLOUD_HYDRATION_KEY = "cloud-hydration" as const;

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Validates the literal calendar date/time components, not just whether
 * Date.parse() can make sense of the string - a bare Date.parse() silently
 * normalizes impossible dates (e.g. Feb 30 rolls into March) instead of
 * rejecting them.
 */
function assertTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string timestamp.`);
  }
  const match = TIMESTAMP_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`${field} is not a valid ISO-8601 timestamp: ${value}`);
  }

  const [, year, month, day, hour, minute, second] = match;
  const asUtc = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  if (
    asUtc.getUTCFullYear() !== Number(year) ||
    asUtc.getUTCMonth() !== Number(month) - 1 ||
    asUtc.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${field} is not a valid calendar date: ${value}`);
  }

  return value;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function assertNullableAttemptCursor(
  value: unknown,
): AttemptHydrationCursor | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object") {
    throw new Error("attemptsCursor must be null or an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    createdAt: assertTimestamp(record.createdAt, "attemptsCursor.createdAt"),
    clientAttemptId: assertNonEmptyString(
      record.clientAttemptId,
      "attemptsCursor.clientAttemptId",
    ),
  };
}

function assertNullableMasteryCursor(
  value: unknown,
): MasteryHydrationCursor | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object") {
    throw new Error("masteryCursor must be null or an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    updatedAt: assertTimestamp(record.updatedAt, "masteryCursor.updatedAt"),
    skillId: assertNonEmptyString(record.skillId, "masteryCursor.skillId"),
  };
}

function assertNullableReviewCursor(
  value: unknown,
): ReviewHydrationCursor | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object") {
    throw new Error("reviewsCursor must be null or an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    updatedAt: assertTimestamp(record.updatedAt, "reviewsCursor.updatedAt"),
    exerciseId: assertNonEmptyString(
      record.exerciseId,
      "reviewsCursor.exerciseId",
    ),
  };
}

function emptyMetadata(userId: string): CloudHydrationMetadata {
  return {
    key: CLOUD_HYDRATION_KEY,
    userId,
    attemptsCursor: null,
    masteryCursor: null,
    reviewsCursor: null,
    completedAt: null,
    schemaVersion: 1,
  };
}

function parseStoredMetadata(
  value: unknown,
  userId: string,
): CloudHydrationMetadata {
  if (typeof value !== "object" || value === null) {
    throw new Error("Stored cloud hydration metadata must be an object.");
  }
  const record = value as Record<string, unknown>;

  if (record.schemaVersion !== 1) {
    throw new Error(
      `Unsupported cloud hydration metadata schema version: ${String(record.schemaVersion)}`,
    );
  }
  if (record.userId !== userId) {
    throw new Error(
      `Cloud hydration metadata belongs to a different user (expected ${userId}, found ${String(record.userId)}).`,
    );
  }

  return {
    key: CLOUD_HYDRATION_KEY,
    userId,
    attemptsCursor: assertNullableAttemptCursor(record.attemptsCursor),
    masteryCursor: assertNullableMasteryCursor(record.masteryCursor),
    reviewsCursor: assertNullableReviewCursor(record.reviewsCursor),
    completedAt:
      record.completedAt === null
        ? null
        : assertTimestamp(record.completedAt, "completedAt"),
    schemaVersion: 1,
  };
}

/**
 * Persists this account's hydration progress in the existing metadata
 * store. Page cursor updates happen inside the atomic committer (Task 20);
 * this repository only reads the current state and marks completion.
 */
export class CloudHydrationMetadataRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async get(userId: string): Promise<CloudHydrationMetadata> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.metadata,
      "readonly",
    );
    const stored = await requestToPromise<unknown>(
      transaction
        .objectStore(INDEXED_DB_STORES.metadata)
        .get(CLOUD_HYDRATION_KEY),
    );

    return stored === undefined
      ? emptyMetadata(userId)
      : parseStoredMetadata(stored, userId);
  }

  public async markCompleted(
    userId: string,
    completedAt: string,
  ): Promise<void> {
    assertTimestamp(completedAt, "completedAt");

    const transaction = this.database.transaction(
      INDEXED_DB_STORES.metadata,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);
    const store = transaction.objectStore(INDEXED_DB_STORES.metadata);

    try {
      const stored = await requestToPromise<unknown>(
        store.get(CLOUD_HYDRATION_KEY),
      );
      const existing =
        stored === undefined
          ? emptyMetadata(userId)
          : parseStoredMetadata(stored, userId);

      store.put({
        ...existing,
        completedAt,
      } satisfies CloudHydrationMetadata);
    } catch (error: unknown) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }

    await completion;
  }
}
