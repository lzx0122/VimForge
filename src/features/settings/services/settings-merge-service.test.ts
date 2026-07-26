import { describe, expect, it, vi } from "vitest";

import type { LocalSettings } from "../../../infrastructure/indexed-db/settings-repository";
import { mergeCloudSettings } from "./settings-merge-service";

function local(overrides: Partial<LocalSettings> = {}): LocalSettings {
  return {
    editorFontSize: 16,
    showLineNumbers: true,
    showKeypresses: true,
    soundEnabled: false,
    preferredQuestionCount: 10,
    lastLearningMode: null,
    updatedAt: "2026-07-15T08:00:00.000Z",
    ...overrides,
  };
}

function cloud(overrides: Partial<LocalSettings> = {}): LocalSettings {
  return {
    editorFontSize: 20,
    showLineNumbers: false,
    showKeypresses: false,
    soundEnabled: false,
    preferredQuestionCount: 20,
    lastLearningMode: "efficiency",
    updatedAt: "2026-07-16T08:00:00.000Z",
    ...overrides,
  };
}

describe("mergeCloudSettings", () => {
  describe("basic merge rules", () => {
    it("keeps defaults and writes nothing when neither local nor cloud settings exist", async () => {
      const localGet = vi.fn(async () => null);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => null);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: true,
      });

      expect(result).toEqual({ settings: null, source: "none" });
      expect(localSave).not.toHaveBeenCalled();
      expect(cloudSave).not.toHaveBeenCalled();
    });

    it("uploads local settings to the cloud when only local exists", async () => {
      const localSettings = local();
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => null);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(result).toEqual({ settings: localSettings, source: "local" });
      expect(cloudSave).toHaveBeenCalledWith("user-1", localSettings);
      expect(localSave).not.toHaveBeenCalled();
    });

    it("saves cloud settings locally when only cloud exists", async () => {
      const cloudSettings = cloud();
      const localGet = vi.fn(async () => null);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: false,
      });

      expect(result).toEqual({ settings: cloudSettings, source: "cloud" });
      expect(localSave).toHaveBeenCalledWith(cloudSettings);
      expect(cloudSave).not.toHaveBeenCalled();
    });

    it("saves cloud settings locally when cloud has a strictly newer valid timestamp", async () => {
      const localSettings = local({ updatedAt: "2026-07-15T08:00:00.000Z" });
      const cloudSettings = cloud({ updatedAt: "2026-07-16T08:00:00.000Z" });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(result).toEqual({ settings: cloudSettings, source: "cloud" });
      expect(localSave).toHaveBeenCalledWith(cloudSettings);
      expect(cloudSave).not.toHaveBeenCalled();
    });

    it("uploads local settings when local has a strictly newer valid timestamp", async () => {
      const localSettings = local({ updatedAt: "2026-07-17T08:00:00.000Z" });
      const cloudSettings = cloud({ updatedAt: "2026-07-16T08:00:00.000Z" });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(result).toEqual({ settings: localSettings, source: "local" });
      expect(cloudSave).toHaveBeenCalledWith("user-1", localSettings);
      expect(localSave).not.toHaveBeenCalled();
    });

    it("keeps local without writing when timestamps are equal", async () => {
      const timestamp = "2026-07-16T08:00:00.000Z";
      const localSettings = local({ updatedAt: timestamp });
      const cloudSettings = cloud({ updatedAt: timestamp });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(result).toEqual({ settings: localSettings, source: "local" });
      expect(localSave).not.toHaveBeenCalled();
      expect(cloudSave).not.toHaveBeenCalled();
    });

    it("uploads local settings when the cloud timestamp is invalid and local's is valid", async () => {
      const localSettings = local({ updatedAt: "2026-07-16T08:00:00.000Z" });
      const cloudSettings = cloud({ updatedAt: "not-a-timestamp" });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(result).toEqual({ settings: localSettings, source: "local" });
      expect(cloudSave).toHaveBeenCalledWith("user-1", localSettings);
      expect(localSave).not.toHaveBeenCalled();
    });

    it("saves cloud settings locally when the local timestamp is invalid and cloud's is valid", async () => {
      const localSettings = local({ updatedAt: "not-a-timestamp" });
      const cloudSettings = cloud({ updatedAt: "2026-07-16T08:00:00.000Z" });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(result).toEqual({ settings: cloudSettings, source: "cloud" });
      expect(localSave).toHaveBeenCalledWith(cloudSettings);
      expect(cloudSave).not.toHaveBeenCalled();
    });

    it("keeps local without writing when both timestamps are invalid", async () => {
      const localSettings = local({ updatedAt: "garbage" });
      const cloudSettings = cloud({ updatedAt: "also-garbage" });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(result).toEqual({ settings: localSettings, source: "local" });
      expect(localSave).not.toHaveBeenCalled();
      expect(cloudSave).not.toHaveBeenCalled();
    });
  });

  describe("compare-and-swap", () => {
    it("applies cloud settings and re-reads local once when cloud initially wins", async () => {
      const localSettings = local({ updatedAt: "2026-07-15T08:00:00.000Z" });
      const cloudSettings = cloud({ updatedAt: "2026-07-16T08:00:00.000Z" });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: localSettings.soundEnabled,
      });

      expect(localGet).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ settings: cloudSettings, source: "cloud" });
      expect(localSave).toHaveBeenCalledWith(cloudSettings);
      expect(cloudSave).not.toHaveBeenCalled();
    });

    it("recomputes and uploads the latest local when local changes while the cloud read is pending", async () => {
      const staleLocal = local({ updatedAt: "2026-07-15T08:00:00.000Z" });
      const freshLocal = local({
        updatedAt: "2026-07-17T08:00:00.000Z",
        editorFontSize: 22,
      });
      const cloudSettings = cloud({ updatedAt: "2026-07-16T08:00:00.000Z" });
      const localGet = vi
        .fn<() => Promise<LocalSettings | null>>()
        .mockResolvedValueOnce(staleLocal)
        .mockResolvedValueOnce(freshLocal);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: freshLocal.soundEnabled,
      });

      expect(result).toEqual({ settings: freshLocal, source: "local" });
      expect(cloudSave).toHaveBeenCalledWith("user-1", freshLocal);
      expect(localSave).not.toHaveBeenCalled();
    });

    it("preserves a concurrent local sound change during the cloud request", async () => {
      const staleLocal = local({
        updatedAt: "2026-07-15T08:00:00.000Z",
        soundEnabled: false,
      });
      const freshLocal = local({
        updatedAt: "2026-07-17T08:00:00.000Z",
        soundEnabled: true,
      });
      const cloudSettings = cloud({
        updatedAt: "2026-07-16T08:00:00.000Z",
        soundEnabled: false,
      });

      const localGet = vi
        .fn<() => Promise<LocalSettings | null>>()
        .mockResolvedValueOnce(staleLocal)
        .mockResolvedValueOnce(freshLocal);

      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: {
          get: localGet,
          save: localSave,
        },
        cloud: {
          get: cloudGet,
          save: cloudSave,
        },
        preserveSoundEnabled: false,
      });

      expect(result).toEqual({
        settings: freshLocal,
        source: "local",
      });
      expect(cloudSave).toHaveBeenCalledWith("user-1", freshLocal);
    });
  });

  describe("failure propagation", () => {
    it("propagates a cloud read failure without saving anything locally", async () => {
      const localGet = vi.fn(async () => local());
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => {
        throw new Error("cloud unavailable");
      });
      const cloudSave = vi.fn(async () => undefined);

      await expect(
        mergeCloudSettings({
          userId: "user-1",
          local: { get: localGet, save: localSave },
          cloud: { get: cloudGet, save: cloudSave },
          preserveSoundEnabled: true,
        }),
      ).rejects.toThrow("cloud unavailable");

      expect(localSave).not.toHaveBeenCalled();
      expect(cloudSave).not.toHaveBeenCalled();
    });

    it("propagates a local save failure without uploading anything to the cloud", async () => {
      const localSettings = local({ updatedAt: "2026-07-15T08:00:00.000Z" });
      const cloudSettings = cloud({ updatedAt: "2026-07-16T08:00:00.000Z" });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => {
        throw new Error("indexeddb unavailable");
      });
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      await expect(
        mergeCloudSettings({
          userId: "user-1",
          local: { get: localGet, save: localSave },
          cloud: { get: cloudGet, save: cloudSave },
          preserveSoundEnabled: localSettings.soundEnabled,
        }),
      ).rejects.toThrow("indexeddb unavailable");

      expect(cloudSave).not.toHaveBeenCalled();
    });
  });

  describe("sound preference isolation", () => {
    it("prefers a real local record's soundEnabled over the cloud value and a stale caller fallback", async () => {
      const localSettings = local({
        updatedAt: "2026-07-17T08:00:00.000Z",
        soundEnabled: true,
      });
      const cloudSettings = cloud({
        updatedAt: "2026-07-16T08:00:00.000Z",
        soundEnabled: false,
      });
      const localGet = vi.fn(async () => localSettings);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: false,
      });

      expect(result.settings?.soundEnabled).toBe(true);
    });

    it("uses the caller's fallback soundEnabled only when no local record exists", async () => {
      const cloudSettings = cloud({ soundEnabled: false });
      const localGet = vi.fn(async () => null);
      const localSave = vi.fn(async () => undefined);
      const cloudGet = vi.fn(async () => cloudSettings);
      const cloudSave = vi.fn(async () => undefined);

      const result = await mergeCloudSettings({
        userId: "user-1",
        local: { get: localGet, save: localSave },
        cloud: { get: cloudGet, save: cloudSave },
        preserveSoundEnabled: true,
      });

      expect(result.settings?.soundEnabled).toBe(true);
    });
  });
});
