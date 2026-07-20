import type { StoredSkillMastery } from "../../types/learning-projection";
import { INDEXED_DB_STORES, requestToPromise } from "./database";

/**
 * Read-only: writes belong to the atomic commit service that keeps mastery,
 * review, and outcome records consistent with each other.
 */
export class SkillMasteryRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async get(skillId: string): Promise<StoredSkillMastery | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.skillMastery,
      "readonly",
    );
    const record = await requestToPromise<StoredSkillMastery | undefined>(
      transaction.objectStore(INDEXED_DB_STORES.skillMastery).get(skillId),
    );

    return record ?? null;
  }

  public async listAll(): Promise<StoredSkillMastery[]> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.skillMastery,
      "readonly",
    );

    return requestToPromise<StoredSkillMastery[]>(
      transaction.objectStore(INDEXED_DB_STORES.skillMastery).getAll(),
    );
  }
}
