import type { Session } from "@supabase/supabase-js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useSyncStore } from "../../stores/sync-store";
import AppBootstrap from "./AppBootstrap.vue";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeSession(userId: string): Session {
  return { user: { id: userId } } as unknown as Session;
}

function mountBootstrap() {
  return mount(AppBootstrap, {
    slots: { default: "<div class=\"bootstrap-child\">child content</div>" },
  });
}

describe("AppBootstrap", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("initializes Settings, Sync, and Auth once", async () => {
    const settingsStore = useSettingsStore();
    const syncStore = useSyncStore();
    const authStore = useAuthStore();
    const settingsInitialize = vi
      .spyOn(settingsStore, "initialize")
      .mockResolvedValue(undefined);
    const syncInitialize = vi
      .spyOn(syncStore, "initialize")
      .mockResolvedValue(undefined);
    const authInitialize = vi
      .spyOn(authStore, "initialize")
      .mockResolvedValue(undefined);
    vi.spyOn(syncStore, "setAuthenticated").mockResolvedValue(undefined);

    mountBootstrap();
    await flushPromises();

    expect(settingsInitialize).toHaveBeenCalledTimes(1);
    expect(syncInitialize).toHaveBeenCalledTimes(1);
    expect(authInitialize).toHaveBeenCalledTimes(1);
  });

  it("does not re-initialize Auth when it is already initialized", async () => {
    const settingsStore = useSettingsStore();
    const syncStore = useSyncStore();
    const authStore = useAuthStore();
    vi.spyOn(settingsStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(syncStore, "initialize").mockResolvedValue(undefined);
    const authInitialize = vi
      .spyOn(authStore, "initialize")
      .mockResolvedValue(undefined);
    vi.spyOn(syncStore, "setAuthenticated").mockResolvedValue(undefined);
    authStore.initialized = true;

    mountBootstrap();
    await flushPromises();

    expect(authInitialize).not.toHaveBeenCalled();
  });

  it("performs initial sync coordination only after Auth has finished initializing", async () => {
    const settingsStore = useSettingsStore();
    const syncStore = useSyncStore();
    const authStore = useAuthStore();
    vi.spyOn(settingsStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(syncStore, "initialize").mockResolvedValue(undefined);
    const setAuthenticated = vi
      .spyOn(syncStore, "setAuthenticated")
      .mockResolvedValue(undefined);

    const deferredAuth = createDeferred<void>();
    vi.spyOn(authStore, "initialize").mockImplementation(
      () => deferredAuth.promise,
    );

    mountBootstrap();
    await flushPromises();

    expect(setAuthenticated).not.toHaveBeenCalled();

    deferredAuth.resolve();
    await flushPromises();

    expect(setAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("invokes coordination exactly once per Auth user-id change", async () => {
    const settingsStore = useSettingsStore();
    const syncStore = useSyncStore();
    const authStore = useAuthStore();
    vi.spyOn(settingsStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(syncStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(authStore, "initialize").mockResolvedValue(undefined);
    const setAuthenticated = vi
      .spyOn(syncStore, "setAuthenticated")
      .mockResolvedValue(undefined);

    mountBootstrap();
    await flushPromises();

    expect(setAuthenticated).toHaveBeenCalledTimes(1);
    expect(setAuthenticated).toHaveBeenNthCalledWith(1, false);

    authStore.session = fakeSession("user-1");
    await flushPromises();

    expect(setAuthenticated).toHaveBeenCalledTimes(2);
    expect(setAuthenticated).toHaveBeenNthCalledWith(2, true);
  });

  it("stops the auth user-id watcher on unmount", async () => {
    const settingsStore = useSettingsStore();
    const syncStore = useSyncStore();
    const authStore = useAuthStore();
    vi.spyOn(settingsStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(syncStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(authStore, "initialize").mockResolvedValue(undefined);
    const setAuthenticated = vi
      .spyOn(syncStore, "setAuthenticated")
      .mockResolvedValue(undefined);

    const wrapper = mountBootstrap();
    await flushPromises();
    expect(setAuthenticated).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    authStore.session = fakeSession("user-2");
    await flushPromises();

    expect(setAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("renders the default slot even when initialization reports an error", async () => {
    const settingsStore = useSettingsStore();
    const syncStore = useSyncStore();
    const authStore = useAuthStore();
    vi.spyOn(settingsStore, "initialize").mockRejectedValue(
      new Error("settings unavailable"),
    );
    vi.spyOn(syncStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(authStore, "initialize").mockResolvedValue(undefined);
    vi.spyOn(syncStore, "setAuthenticated").mockResolvedValue(undefined);

    const wrapper = mountBootstrap();
    await flushPromises();

    expect(wrapper.text()).toContain("child content");
  });
});
