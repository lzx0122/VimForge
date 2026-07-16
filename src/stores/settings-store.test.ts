import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalSettings } from "../infrastructure/indexed-db/settings-repository";
import {
  DEFAULT_SETTINGS,
  useSettingsStore,
  type CloudSettingsRepository,
  type LocalSettingsRepository,
} from "./settings-store";

const savedSettings: LocalSettings = {
  editorFontSize: 20,
  showLineNumbers: false,
  showKeypresses: true,
  soundEnabled: true,
  preferredQuestionCount: 20,
  lastLearningMode: "efficiency",
  updatedAt: "2026-07-16T08:00:00.000Z",
};

function createLocalRepository(
  initialSettings: LocalSettings | null = null,
): LocalSettingsRepository {
  return {
    get: vi.fn(async () => initialSettings),
    save: vi.fn(async () => undefined),
  };
}

function createCloudRepository(): CloudSettingsRepository {
  return {
    save: vi.fn(async () => undefined),
  };
}

describe("settings store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("restores guest settings from IndexedDB", async () => {
    const local = createLocalRepository(savedSettings);
    const store = useSettingsStore();

    await store.initialize(local);

    expect(store.$state).toMatchObject({
      ...savedSettings,
      initialized: true,
      persistenceStatus: "local",
    });
    expect(local.get).toHaveBeenCalledOnce();
  });

  it("uses the MVP defaults when no local settings exist", async () => {
    const store = useSettingsStore();

    await store.initialize(createLocalRepository());

    expect(store.$state).toMatchObject(DEFAULT_SETTINGS);
    expect(store.preferredQuestionCount).toBe(10);
  });

  it("clamps the font size and saves guest changes only to IndexedDB", async () => {
    const local = createLocalRepository();
    const cloud = createCloudRepository();
    const store = useSettingsStore();

    await store.updateSettings(
      { editorFontSize: 99, showLineNumbers: false },
      {
        local,
        cloud,
        userId: null,
        now: () => new Date("2026-07-16T09:00:00.000Z"),
      },
    );

    expect(local.save).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      editorFontSize: 28,
      showLineNumbers: false,
      updatedAt: "2026-07-16T09:00:00.000Z",
    });
    expect(cloud.save).not.toHaveBeenCalled();
    expect(store.persistenceStatus).toBe("local");
  });

  it("persists locally before syncing authenticated settings", async () => {
    const calls: string[] = [];
    const local: LocalSettingsRepository = {
      get: vi.fn(async () => null),
      save: vi.fn(async () => {
        calls.push("local");
      }),
    };
    const cloud: CloudSettingsRepository = {
      save: vi.fn(async () => {
        calls.push("cloud");
      }),
    };
    const store = useSettingsStore();

    await store.updateSettings(
      {
        showKeypresses: false,
        soundEnabled: true,
        preferredQuestionCount: 5,
      },
      {
        local,
        cloud,
        userId: "user-1",
        now: () => new Date("2026-07-16T10:00:00.000Z"),
      },
    );

    expect(calls).toEqual(["local", "cloud"]);
    expect(cloud.save).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        showKeypresses: false,
        soundEnabled: true,
        preferredQuestionCount: 5,
      }),
    );
    expect(store.persistenceStatus).toBe("synced");
  });

  it("keeps local settings when cloud synchronization fails", async () => {
    const local = createLocalRepository();
    const cloud: CloudSettingsRepository = {
      save: vi.fn(async () => {
        throw new Error("cloud unavailable");
      }),
    };
    const store = useSettingsStore();

    await store.updateSettings(
      { soundEnabled: true },
      {
        local,
        cloud,
        userId: "user-1",
        now: () => new Date("2026-07-16T11:00:00.000Z"),
      },
    );

    expect(local.save).toHaveBeenCalledOnce();
    expect(store.soundEnabled).toBe(true);
    expect(store.persistenceStatus).toBe("error");
    expect(store.errorMessage).toBe("設定已保存在這台裝置，但暫時無法同步。");
  });

  it("restores the saving state when local persistence fails", async () => {
    const local: LocalSettingsRepository = {
      get: vi.fn(async () => null),
      save: vi.fn(async () => {
        throw new Error("IndexedDB unavailable");
      }),
    };
    const store = useSettingsStore();

    await store.updateSettings(
      { editorFontSize: 24 },
      { local, userId: null },
    );

    expect(store.saving).toBe(false);
    expect(store.editorFontSize).toBe(DEFAULT_SETTINGS.editorFontSize);
    expect(store.persistenceStatus).toBe("error");
    expect(store.errorMessage).toBe("無法將設定保存在這台裝置。");
  });
});
