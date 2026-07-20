import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProgressDashboard } from "../services/progress-query-service";

const { getDashboard, openDatabase } = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  openDatabase: vi.fn(async () => ({ close: vi.fn() })),
}));

vi.mock("../services/progress-query-service", () => ({
  ProgressQueryService: vi.fn().mockImplementation(() => ({
    getDashboard,
  })),
}));

vi.mock("../../../infrastructure/indexed-db/database", () => ({
  openVimForgeDatabase: openDatabase,
}));

vi.mock("../../../infrastructure/supabase/supabase-course-repository", () => ({
  SupabaseCourseRepository: vi.fn().mockImplementation(() => ({})),
}));

import ProgressPage from "./ProgressPage.vue";

function dashboard(overrides: Partial<ProgressDashboard> = {}): ProgressDashboard {
  return {
    hasLearningHistory: true,
    dueReviewCount: 12,
    skills: [
      {
        id: "basic-motion",
        name: "基礎移動",
        masteryLevel: 5,
        masteryScore: 91,
      },
      {
        id: "text-objects",
        name: "文字物件",
        masteryLevel: 0,
        masteryScore: 8,
      },
    ],
    units: [
      {
        id: "unit-movement",
        slug: "basic-cursor-movement",
        title: "基礎游標移動",
        completedExercises: 8,
        totalExercises: 8,
      },
      {
        id: "unit-text-objects",
        slug: "text-objects",
        title: "文字物件",
        completedExercises: 4,
        totalExercises: 14,
      },
    ],
    recentAttempts: [
      {
        id: "attempt-error",
        exerciseTitle: "修改引號內容",
        completed: false,
        accuracyScore: 0,
        occurredAt: "2026-07-16T08:00:00.000Z",
        errorSummary: null,
      },
      {
        id: "attempt-success",
        exerciseTitle: "跳到下一個單字",
        completed: true,
        accuracyScore: 96,
        occurredAt: "2026-07-16T07:30:00.000Z",
        errorSummary: null,
      },
    ],
    ...overrides,
  };
}

async function mountProgressPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/progress", name: "progress", component: ProgressPage },
      { path: "/courses", name: "courses", component: { template: "<div />" } },
      {
        path: "/courses/:unitSlug",
        name: "course-unit",
        component: { template: "<div />" },
      },
      { path: "/review", name: "review", component: { template: "<div />" } },
    ],
  });
  await router.push("/progress");
  await router.isReady();

  return mount(ProgressPage, {
    global: { plugins: [router] },
  });
}

describe("ProgressPage", () => {
  beforeEach(() => {
    getDashboard.mockReset();
    openDatabase.mockReset().mockResolvedValue({ close: vi.fn() });
  });

  it("shows a loading state before the dashboard resolves", async () => {
    getDashboard.mockReturnValue(new Promise(() => {}));

    const wrapper = await mountProgressPage();

    expect(wrapper.text()).toContain("正在載入學習進度");
  });

  it("shows skill mastery from Level 0 through Level 5 and due reviews", async () => {
    getDashboard.mockResolvedValue(dashboard());

    const wrapper = await mountProgressPage();
    await flushPromises();

    expect(wrapper.text()).toContain("基礎移動");
    expect(wrapper.text()).toContain("Level 5 / 5");
    expect(wrapper.text()).toContain("文字物件");
    expect(wrapper.text()).toContain("Level 0 / 5");
    expect(wrapper.get('[data-testid="due-review-count"]').text()).toBe("12");
    expect(wrapper.findAll('progress[max="5"]')).toHaveLength(2);
  });

  it("shows unit completion and recent errors", async () => {
    getDashboard.mockResolvedValue(dashboard());

    const wrapper = await mountProgressPage();
    await flushPromises();

    expect(wrapper.get('[data-unit-slug="basic-cursor-movement"]').text()).toContain(
      "8 / 8 題",
    );
    expect(wrapper.get('[data-unit-slug="text-objects"]').text()).toContain(
      "4 / 14 題",
    );
    expect(wrapper.get('[data-attempt-id="attempt-error"]').text()).toContain(
      "未完成",
    );
    expect(wrapper.get('[data-attempt-id="attempt-success"]').text()).toContain(
      "準確 96",
    );
  });

  it("does not introduce XP or rankings", async () => {
    getDashboard.mockResolvedValue(dashboard());

    const wrapper = await mountProgressPage();
    await flushPromises();

    expect(wrapper.text()).not.toMatch(/XP|排名/);
  });

  it("shows an honest empty state without fabricated progress when there is no learning history", async () => {
    getDashboard.mockResolvedValue(
      dashboard({
        hasLearningHistory: false,
        dueReviewCount: 0,
        skills: [],
        units: [],
        recentAttempts: [],
      }),
    );

    const wrapper = await mountProgressPage();
    await flushPromises();

    expect(wrapper.text()).toContain("尚無學習紀錄");
    expect(wrapper.get('a[href="/courses"]').text()).toContain("前往課程");
    expect(wrapper.find('[data-testid="due-review-count"]').exists()).toBe(
      false,
    );
  });

  it("shows a retryable error state when loading fails, and recovers on retry", async () => {
    getDashboard.mockRejectedValueOnce(new Error("db unavailable"));

    const wrapper = await mountProgressPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "暫時無法載入學習進度，請稍後重試。",
    );

    getDashboard.mockResolvedValueOnce(dashboard());
    await wrapper.get('[data-testid="progress-retry"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("基礎移動");
  });
});
