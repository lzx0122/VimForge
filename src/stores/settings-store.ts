import { defineStore } from "pinia";

import {
  SettingsRepository,
  type LocalSettings,
} from "../infrastructure/indexed-db/settings-repository";
import { openVimForgeDatabase } from "../infrastructure/indexed-db/database";
import { reportError } from "../infrastructure/monitoring/error-reporter";
import { SupabaseSettingsRepository } from "../infrastructure/supabase/supabase-settings-repository";
import type { QuestionCount } from "../types/learning";
import { useAuthStore } from "./auth-store";

export interface LocalSettingsRepository {
  get(): Promise<LocalSettings | null>;
  save(settings: LocalSettings): Promise<void>;
}

export interface CloudSettingsRepository {
  save(userId: string, settings: LocalSettings): Promise<void>;
}

export type SettingsPersistenceStatus = "local" | "synced" | "error";

interface SettingsStoreState extends LocalSettings {
  initialized: boolean;
  saving: boolean;
  persistenceStatus: SettingsPersistenceStatus;
  errorMessage: string | null;
}

type SettingsPatch = Partial<Omit<LocalSettings, "updatedAt">>;

interface SettingsPersistenceOptions {
  local: LocalSettingsRepository;
  cloud?: CloudSettingsRepository;
  userId: string | null;
  now?: () => Date;
}

export const DEFAULT_SETTINGS: LocalSettings = {
  editorFontSize: 16,
  showLineNumbers: true,
  showKeypresses: true,
  soundEnabled: false,
  preferredQuestionCount: 10,
  lastLearningMode: null,
  updatedAt: "",
};

let defaultLocalRepositoryPromise: Promise<LocalSettingsRepository> | null =
  null;
let defaultCloudRepository: CloudSettingsRepository | null = null;

async function createDefaultLocalRepository(): Promise<LocalSettingsRepository> {
  return new SettingsRepository(await openVimForgeDatabase());
}

function getDefaultLocalRepository(): Promise<LocalSettingsRepository> {
  defaultLocalRepositoryPromise ??= createDefaultLocalRepository();

  return defaultLocalRepositoryPromise;
}

function getDefaultCloudRepository(): CloudSettingsRepository {
  defaultCloudRepository ??= new SupabaseSettingsRepository();

  return defaultCloudRepository;
}

function normalizeFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize)) {
    return DEFAULT_SETTINGS.editorFontSize;
  }

  return Math.min(28, Math.max(12, Math.round(fontSize)));
}

function isQuestionCount(value: number): value is QuestionCount {
  return value === 5 || value === 10 || value === 20;
}

function normalizeSettings(settings: LocalSettings): LocalSettings {
  return {
    ...settings,
    editorFontSize: normalizeFontSize(settings.editorFontSize),
    preferredQuestionCount: isQuestionCount(settings.preferredQuestionCount)
      ? settings.preferredQuestionCount
      : DEFAULT_SETTINGS.preferredQuestionCount,
  };
}

export const useSettingsStore = defineStore("settings", {
  state: (): SettingsStoreState => ({
    ...DEFAULT_SETTINGS,
    initialized: false,
    saving: false,
    persistenceStatus: "local",
    errorMessage: null,
  }),

  actions: {
    async initialize(
      localRepository?: LocalSettingsRepository,
    ): Promise<void> {
      this.errorMessage = null;

      try {
        const local = localRepository ?? (await getDefaultLocalRepository());
        const settings = await local.get();
        if (settings !== null) {
          this.$patch(normalizeSettings(settings));
        }
        this.persistenceStatus = "local";
      } catch (error: unknown) {
        reportError("settings.initialize", error);
        this.persistenceStatus = "error";
        this.errorMessage = "無法讀取這台裝置上的設定。";
      } finally {
        this.initialized = true;
      }
    },

    async updateSettings(
      patch: SettingsPatch,
      persistence?: SettingsPersistenceOptions,
    ): Promise<void> {
      this.saving = true;
      this.errorMessage = null;

      try {
        const local =
          persistence?.local ?? (await getDefaultLocalRepository());
        const userId =
          persistence === undefined
            ? (useAuthStore().currentUser?.id ?? null)
            : persistence.userId;
        const cloud =
          persistence?.cloud ??
          (userId === null ? null : getDefaultCloudRepository());
        const now = persistence?.now ?? (() => new Date());
        const settings = normalizeSettings({
          editorFontSize:
            patch.editorFontSize ?? this.editorFontSize,
          showLineNumbers:
            patch.showLineNumbers ?? this.showLineNumbers,
          showKeypresses:
            patch.showKeypresses ?? this.showKeypresses,
          soundEnabled: patch.soundEnabled ?? this.soundEnabled,
          preferredQuestionCount:
            patch.preferredQuestionCount ?? this.preferredQuestionCount,
          lastLearningMode:
            patch.lastLearningMode === undefined
              ? this.lastLearningMode
              : patch.lastLearningMode,
          updatedAt: now().toISOString(),
        });

        await local.save(settings);
        this.$patch(settings);
        this.initialized = true;
        this.persistenceStatus = "local";

        if (userId !== null && cloud !== null) {
          try {
            await cloud.save(userId, settings);
            this.persistenceStatus = "synced";
          } catch (error: unknown) {
            reportError("settings.cloud-save", error);
            this.persistenceStatus = "error";
            this.errorMessage =
              "設定已保存在這台裝置，但暫時無法同步。";
          }
        }
      } catch (error: unknown) {
        reportError("settings.local-save", error);
        this.persistenceStatus = "error";
        this.errorMessage = "無法將設定保存在這台裝置。";
      } finally {
        this.saving = false;
      }
    },
  },
});
