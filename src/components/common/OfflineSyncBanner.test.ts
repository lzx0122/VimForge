import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../../stores/auth-store";
import { useSyncStore } from "../../stores/sync-store";
import OfflineSyncBanner from "./OfflineSyncBanner.vue";

async function mountBanner() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore();
  const syncStore = useSyncStore();
  authStore.$patch({ initialized: true });
  vi.spyOn(syncStore, "initialize").mockResolvedValue(undefined);
  vi.spyOn(authStore, "initialize").mockResolvedValue(undefined);
  vi.spyOn(syncStore, "setAuthenticated").mockResolvedValue(undefined);
  const syncAndHydrate = vi
    .spyOn(syncStore, "syncAndHydrate")
    .mockResolvedValue(undefined);
  const wrapper = mount(OfflineSyncBanner, {
    global: { plugins: [pinia] },
  });
  await flushPromises();

  return { authStore, syncStore, syncAndHydrate, wrapper };
}

describe("OfflineSyncBanner", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders nothing when there is nothing to report", async () => {
    const { wrapper } = await mountBanner();

    expect(wrapper.find(".offline-sync-banner").exists()).toBe(false);
  });

  it("renders the pending message with a working retry button when authenticated", async () => {
    const { authStore, syncStore, wrapper, syncAndHydrate } =
      await mountBanner();
    authStore.$patch({ session: { user: { id: "user-1" } } as never });
    syncStore.pendingCount = 4;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("尚有 4 筆紀錄等待同步。");
    const button = wrapper.get("button");

    await button.trigger("click");
    expect(syncAndHydrate).toHaveBeenCalled();
  });

  it("renders the offline message with a retry button when authenticated", async () => {
    const { authStore, syncStore, wrapper } = await mountBanner();
    authStore.$patch({ session: { user: { id: "user-1" } } as never });
    syncStore.online = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("目前離線，紀錄已保存在這台裝置。");
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("renders the hydration error message with a retry button when authenticated", async () => {
    const { authStore, syncStore, wrapper } = await mountBanner();
    authStore.$patch({ session: { user: { id: "user-1" } } as never });
    syncStore.hydrationErrorMessage = "雲端進度暫時無法恢復，本機資料仍可使用。";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain(
      "雲端進度暫時無法恢復，本機資料仍可使用。",
    );
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("renders the hydrating message without a retry button", async () => {
    const { authStore, syncStore, wrapper } = await mountBanner();
    authStore.$patch({ session: { user: { id: "user-1" } } as never });
    syncStore.hydrating = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("正在恢復帳號學習進度…");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("renders the account conflict message without a retry button", async () => {
    const { authStore, syncStore, wrapper } = await mountBanner();
    authStore.$patch({ session: { user: { id: "user-1" } } as never });
    syncStore.accountConflictMessage =
      "此瀏覽器已有其他帳號的本機學習資料，已停止同步。";
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain(
      "此瀏覽器已有其他帳號的本機學習資料，已停止同步。",
    );
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("shows exactly one message even when multiple conditions apply", async () => {
    const { authStore, syncStore, wrapper } = await mountBanner();
    authStore.$patch({ session: { user: { id: "user-1" } } as never });
    syncStore.accountConflictMessage =
      "此瀏覽器已有其他帳號的本機學習資料，已停止同步。";
    syncStore.hydrating = true;
    syncStore.online = false;
    syncStore.pendingCount = 3;
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".offline-sync-banner")).toHaveLength(1);
    expect(wrapper.text()).toContain(
      "此瀏覽器已有其他帳號的本機學習資料，已停止同步。",
    );
    expect(wrapper.text()).not.toContain("正在恢復帳號學習進度…");
    expect(wrapper.text()).not.toContain("目前離線，紀錄已保存在這台裝置。");
    expect(wrapper.text()).not.toContain("尚有 3 筆紀錄等待同步。");
  });

  it("hides the retry button for a guest even while pending", async () => {
    const { syncStore, wrapper } = await mountBanner();
    syncStore.pendingCount = 2;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("尚有 2 筆紀錄等待同步。");
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
