import type {
  LearningMode,
  QuestionCount,
} from "../../types/learning";
import {
  INDEXED_DB_STORES,
  requestToPromise,
  transactionToPromise,
} from "./database";

const SETTINGS_KEY = "preferences";

export interface LocalSettings {
  editorFontSize: number;
  showLineNumbers: boolean;
  showKeypresses: boolean;
  soundEnabled: boolean;
  preferredQuestionCount: QuestionCount;
  lastLearningMode: LearningMode | null;
  updatedAt: string;
}

interface StoredSettings {
  key: typeof SETTINGS_KEY;
  value: LocalSettings;
}

export class SettingsRepository {
  public constructor(private readonly database: IDBDatabase) {}

  public async save(settings: LocalSettings): Promise<void> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.settings,
      "readwrite",
    );
    const completion = transactionToPromise(transaction);

    transaction.objectStore(INDEXED_DB_STORES.settings).put({
      key: SETTINGS_KEY,
      value: settings,
    } satisfies StoredSettings);

    await completion;
  }

  public async get(): Promise<LocalSettings | null> {
    const transaction = this.database.transaction(
      INDEXED_DB_STORES.settings,
      "readonly",
    );
    const storedSettings = await requestToPromise<StoredSettings | undefined>(
      transaction.objectStore(INDEXED_DB_STORES.settings).get(SETTINGS_KEY),
    );

    return storedSettings?.value ?? null;
  }
}
