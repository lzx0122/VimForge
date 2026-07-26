import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSyncStore } from "../../../stores/sync-store";
import type { HomeLearningSummary } from "../services/home-learning-summary-service";

const { getSummary, openDatabase } = vi.hoisted(() => ({
  getSummary: vi.fn(),
  openDatabase: vi.fn(async () => ({ close: vi.fn() })),
}));

vi.mock("../services/home-learning-summary-service", () => ({
  HomeLearningSummaryService: vi.fn().mockImplementation(() => ({
    getSummary,
  })),
}));

vi.mock("../../../infrastructure/indexed-db/database", () => ({
  openVimForgeDatabase: openDatabase,
}));

vi.mock("../../../infrastructure/supabase/supabase-course-repository", () => ({
  SupabaseCourseRepository: vi.fn().mockImplementation(() => ({})),
}));

import HomePage from "./HomePage.vue";

function summary(overrides: Partial<HomeLearningSummary> = {}): HomeLearningSummary {
  return {
    activeSessionId: null,
    dueReviewCount: 0,
    weakestSkill: null,
    ...overrides,
  };
}

async function mountHomePage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: HomePage },
      {
        path: "/practice/setup",
        name: "practice-setup",
        component: { template: "<div />" },
      },
      {
        path: "/practice/:sessionId",
        name: "practice",
        component: { template: "<div />" },
      },
      { path: "/review", name: "review", component: { template: "<div />" } },
    ],
  });
  await router.push("/");
  await router.isReady();

  const wrapper = mount(HomePage, {
    global: { plugins: [router, pinia] },
  });
  const syncStore = useSyncStore();
  return { wrapper, router, syncStore };
}

describe("HomePage", () => {
  beforeEach(() => {
    getSummary.mockReset();
    openDatabase.mockReset().mockResolvedValue({ close: vi.fn() });
  });

  it("keeps all three mode cards visible while the summary is still loading", async () => {
    getSummary.mockReturnValue(new Promise(() => {}));

    const { wrapper } = await mountHomePage();

    expect(wrapper.text()).toContain("從零開始");
    expect(wrapper.text()).toContain("記憶複習");
    expect(wrapper.text()).toContain("效率進階");
    expect(wrapper.findAll("button")).toHaveLength(3);
  });

  it("keeps all three mode cards visible when the summary fails to load", async () => {
    getSummary.mockRejectedValue(new Error("db unavailable"));

    const { wrapper } = await mountHomePage();
    await flushPromises();

    expect(wrapper.findAll("button")).toHaveLength(3);
  });

  it("shows a link to continue the active session", async () => {
    getSummary.mockResolvedValue(summary({ activeSessionId: "session-1" }));

    const { wrapper } = await mountHomePage();
    await flushPromises();

    const link = wrapper.get('a[href="/practice/session-1"]');
    expect(link.text()).toContain("繼續上次練習");
  });

  it("shows the due review count linking to today's review", async () => {
    getSummary.mockResolvedValue(summary({ dueReviewCount: 7 }));

    const { wrapper } = await mountHomePage();
    await flushPromises();

    const link = wrapper.get('a[href="/review"]');
    expect(link.text()).toContain("今日有 7 題待複習");
  });

  it("shows the weakest skill suggestion linking to practice setup", async () => {
    getSummary.mockResolvedValue(
      summary({
        weakestSkill: { skillId: "skill-1", name: "文字物件", masteryLevel: 1 },
      }),
    );

    const { wrapper } = await mountHomePage();
    await flushPromises();

    const link = wrapper.get('a[href="/practice/setup?mode=efficiency"]');
    expect(link.text()).toContain("建議加強：文字物件");
  });

  it("shows no summary section for a learner with no active session, due reviews, or weak skill", async () => {
    getSummary.mockResolvedValue(summary());

    const { wrapper } = await mountHomePage();
    await flushPromises();

    expect(wrapper.find('a[href^="/practice/"]').exists()).toBe(false);
    expect(wrapper.find('a[href="/review"]').exists()).toBe(false);
    expect(wrapper.findAll("button")).toHaveLength(3);
  });

  describe("cloud hydration refresh", () => {
    it("reloads the summary when localLearningStateRevision increases", async () => {
      getSummary.mockResolvedValueOnce(summary());
      const { wrapper, syncStore } = await mountHomePage();
      await flushPromises();

      expect(getSummary).toHaveBeenCalledTimes(1);

      getSummary.mockResolvedValueOnce(summary({ dueReviewCount: 3 }));
      syncStore.localLearningStateRevision = 1;
      await flushPromises();

      expect(getSummary).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain("今日有 3 題待複習");
    });

    it("ignores an older request that resolves after a newer one", async () => {
      let resolveFirst!: (value: HomeLearningSummary) => void;
      let resolveSecond!: (value: HomeLearningSummary) => void;
      getSummary.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );
      const { wrapper, syncStore } = await mountHomePage();
      await flushPromises();

      getSummary.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
      syncStore.localLearningStateRevision = 1;
      await flushPromises();

      resolveSecond(summary({ dueReviewCount: 9 }));
      await flushPromises();
      resolveFirst(summary({ dueReviewCount: 1 }));
      await flushPromises();

      expect(wrapper.text()).toContain("今日有 9 題待複習");
      expect(wrapper.text()).not.toContain("今日有 1 題待複習");
    });

    it("stops reloading after the page unmounts", async () => {
      getSummary.mockResolvedValueOnce(summary());
      const { wrapper, syncStore } = await mountHomePage();
      await flushPromises();

      expect(getSummary).toHaveBeenCalledTimes(1);

      wrapper.unmount();
      getSummary.mockResolvedValueOnce(summary({ dueReviewCount: 5 }));
      syncStore.localLearningStateRevision = 1;
      await flushPromises();

      expect(getSummary).toHaveBeenCalledTimes(1);
    });
  });
});
