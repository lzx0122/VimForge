import type { StoredLearningOutcome } from "../../types/learning-projection";
import { INDEXED_DB_STORES, requestToPromise } from "./database";

/**
 * Read-only: writes belong to the atomic commit service that keeps mastery,
 * review, and outcome records consistent with each other.
 */
export class LearningOutcomeRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async get(
    clientAttemptId: string,
  ): Promise<StoredLearningOutcome | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.learningOutcomes,
      "readonly",
    );
    const record = await requestToPromise<StoredLearningOutcome | undefined>(
      transaction
        .objectStore(INDEXED_DB_STORES.learningOutcomes)
        .get(clientAttemptId),
    );

    return record ?? null;
  }

  /** A session's outcomes in the order they were completed. */
  public async listBySessionId(
    sessionId: string,
  ): Promise<StoredLearningOutcome[]> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.learningOutcomes,
      "readonly",
    );
    const outcomes = await requestToPromise<StoredLearningOutcome[]>(
      transaction
        .objectStore(INDEXED_DB_STORES.learningOutcomes)
        .index("sessionId")
        .getAll(sessionId),
    );

    return [...outcomes].sort((left, right) =>
      left.completedAt.localeCompare(right.completedAt),
    );
  }
}
