import type { StoredExerciseReview } from "../../types/learning-projection";
import { INDEXED_DB_STORES, requestToPromise } from "./database";

/**
 * Read-only: writes belong to the atomic commit service that keeps mastery,
 * review, and outcome records consistent with each other.
 */
export class ExerciseReviewRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async get(exerciseId: string): Promise<StoredExerciseReview | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.exerciseReviews,
      "readonly",
    );
    const record = await requestToPromise<StoredExerciseReview | undefined>(
      transaction
        .objectStore(INDEXED_DB_STORES.exerciseReviews)
        .get(exerciseId),
    );

    return record ?? null;
  }

  /** Reviews due at or before nowIso, i.e. dueAt <= nowIso. */
  public async listDue(nowIso: string): Promise<StoredExerciseReview[]> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.exerciseReviews,
      "readonly",
    );

    return requestToPromise<StoredExerciseReview[]>(
      transaction
        .objectStore(INDEXED_DB_STORES.exerciseReviews)
        .index("dueAt")
        .getAll(IDBKeyRange.upperBound(nowIso)),
    );
  }

  public async listAll(): Promise<StoredExerciseReview[]> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.exerciseReviews,
      "readonly",
    );

    return requestToPromise<StoredExerciseReview[]>(
      transaction.objectStore(INDEXED_DB_STORES.exerciseReviews).getAll(),
    );
  }
}
