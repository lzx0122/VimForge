import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticeSession } from "../../../types/session";
import type { PracticeSessionResult } from "../services/session-result-service";

const { getResult, restart, openDatabase } = vi.hoisted(() => ({
  getResult: vi.fn(),
  restart: vi.fn(),
  openDatabase: vi.fn(async () => ({ close: vi.fn() })),
}));

vi.mock("../services/session-result-service", () => ({
  SessionResultService: vi.fn().mockImplementation(() => ({
    getResult,
    restart,
  })),
}));

vi.mock("../../../infrastructure/indexed-db/database", () => ({
  openVimForgeDatabase: openDatabase,
}));

import PracticeResultPage from "./PracticeResultPage.vue";

function result(
  overrides: Partial<PracticeSessionResult> = {},
): PracticeSessionResult {
  return {
    sessionId: "session-1",
    learningMode: "memory_review",
    totalExercises: 3,
    completedExercises: 2,
    skippedExercises: 1,
    averageAccuracy: 88,
    averageSpeed: 76,
    totalDurationMs: 95_000,
    skillChanges: [
      {
        skillId: "skill-1",
        previousScore: 40,
        nextScore: 63,
        previousLevel: 2,
        nextLevel: 3,
      },
    ],
    exerciseResults: [
      {
        exerciseId: "exercise-1",
        completed: true,
        accuracyScore: 90,
        speedScore: 80,
        durationMs: 40_000,
        highestHintLevel: 1,
        performanceQuality: 4,
        needsPractice: false,
      },
      {
        exerciseId: "exercise-2",
        completed: true,
        accuracyScore: 86,
        speedScore: 72,
        durationMs: 35_000,
        highestHintLevel: 0,
        performanceQuality: 3,
        needsPractice: false,
      },
      {
        exerciseId: "exercise-3",
        completed: false,
        accuracyScore: 0,
        speedScore: 0,
        durationMs: 20_000,
        highestHintLevel: 3,
        performanceQuality: 0,
        needsPractice: true,
      },
    ],
    ...overrides,
  };
}

function restartedSession(): PracticeSession {
  return {
    id: "session-2",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 5,
    actualCount: 3,
    status: "active",
    currentIndex: 0,
    exerciseIds: ["exercise-1", "exercise-2", "exercise-3"],
    selectedSkillIds: [],
    startedAt: "2026-07-21T09:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-21T09:00:00.000Z",
  };
}

async function mountResultPage(sessionId = "session-1") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/practice/:sessionId/result",
        name: "practice-result",
        component: PracticeResultPage,
      },
      {
        path: "/practice/:sessionId",
        name: "practice",
        component: { template: "<div />" },
      },
      { path: "/review", name: "review", component: { template: "<div />" } },
      {
        path: "/progress",
        name: "progress",
        component: { template: "<div />" },
      },
      { path: "/", name: "home", component: { template: "<div />" } },
    ],
  });
  await router.push({ name: "practice-result", params: { sessionId } });
  await router.isReady();

  const wrapper = mount(PracticeResultPage, {
    global: { plugins: [createPinia(), router] },
  });
  return { wrapper, router };
}

describe("PracticeResultPage", () => {
  beforeEach(() => {
    getResult.mockReset();
    restart.mockReset();
    openDatabase.mockReset().mockResolvedValue({ close: vi.fn() });
  });

  it("shows a loading state before the result resolves", async () => {
    getResult.mockReturnValue(new Promise(() => {}));

    const { wrapper } = await mountResultPage();

    expect(wrapper.text()).toContain("正在載入練習結果");
  });

  it("shows completion, skipped, averages, total time, and skill changes", async () => {
    getResult.mockResolvedValue(result());

    const { wrapper } = await mountResultPage();
    await flushPromises();

    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain("88");
    expect(wrapper.text()).toContain("76");
    expect(wrapper.text()).toContain("1 分 35 秒");
    expect(wrapper.text()).toContain("2 → 3");
    expect(wrapper.text()).toContain("40 → 63");
  });

  it("renders a completed exercise row with accuracy, speed, duration, hint level, and performance quality", async () => {
    getResult.mockResolvedValue(result());

    const { wrapper } = await mountResultPage();
    await flushPromises();

    const row = wrapper.get('[data-testid="exercise-result-exercise-1"]');
    expect(row.text()).toContain("exercise-1");
    expect(row.text()).toContain("已完成");
    expect(row.text()).toContain("90");
    expect(row.text()).toContain("80");
    expect(row.text()).toContain("0 分 40 秒");
    expect(row.text()).toContain("1");
    expect(row.text()).toContain("4");
  });

  it("renders a skipped exercise row with its skipped state, hint level, and performance quality", async () => {
    getResult.mockResolvedValue(result());

    const { wrapper } = await mountResultPage();
    await flushPromises();

    const row = wrapper.get('[data-testid="exercise-result-exercise-3"]');
    expect(row.text()).toContain("exercise-3");
    expect(row.text()).toContain("已略過");
    expect(row.text()).toContain("3");
  });

  it("shows a needs-practice list derived from each exercise result's needsPractice flag", async () => {
    getResult.mockResolvedValue(result());

    const { wrapper } = await mountResultPage();
    await flushPromises();

    const needsPractice = wrapper.get('[data-testid="needs-practice-list"]');
    expect(needsPractice.text()).toContain("exercise-3");
    expect(needsPractice.text()).not.toContain("exercise-1");
  });

  it("shows an empty state when no result exists for the session", async () => {
    getResult.mockResolvedValue(null);

    const { wrapper } = await mountResultPage();
    await flushPromises();

    expect(wrapper.text()).toContain("找不到這個題組的結果");
  });

  it("shows a retryable error state when loading the result fails", async () => {
    getResult.mockRejectedValueOnce(new Error("db unavailable"));

    const { wrapper } = await mountResultPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "暫時無法載入練習結果，請稍後重試。",
    );

    getResult.mockResolvedValueOnce(result());
    await wrapper.get('[data-testid="result-retry"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("88");
  });

  it("restarts the session through the service and navigates to the new practice session", async () => {
    getResult.mockResolvedValue(result());
    restart.mockResolvedValue(restartedSession());

    const { wrapper, router } = await mountResultPage();
    await flushPromises();

    await wrapper.get('[data-testid="restart-session"]').trigger("click");
    await flushPromises();

    expect(restart).toHaveBeenCalledWith("session-1");
    expect(router.currentRoute.value.name).toBe("practice");
    expect(router.currentRoute.value.params.sessionId).toBe("session-2");
  });

  it("navigates only after the restart promise resolves", async () => {
    getResult.mockResolvedValue(result());
    let resolveRestart: (session: PracticeSession) => void = () => {};
    restart.mockReturnValue(
      new Promise((resolve) => {
        resolveRestart = resolve;
      }),
    );

    const { wrapper, router } = await mountResultPage();
    await flushPromises();

    await wrapper.get('[data-testid="restart-session"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("practice-result");

    resolveRestart(restartedSession());
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("practice");
  });

  it("shows a visible error and does not navigate when restart is rejected", async () => {
    getResult.mockResolvedValue(result());
    restart.mockRejectedValueOnce(new Error("disk full"));

    const { wrapper, router } = await mountResultPage();
    await flushPromises();

    await wrapper.get('[data-testid="restart-session"]').trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("practice-result");
    expect(wrapper.get('[data-testid="restart-error"]').text()).toContain(
      "暫時無法重新開始這個題組，請稍後重試。",
    );
  });

  it("calls restart only once when the button is clicked twice while the first call is pending", async () => {
    getResult.mockResolvedValue(result());
    restart.mockReturnValue(new Promise(() => {}));

    const { wrapper } = await mountResultPage();
    await flushPromises();

    const button = wrapper.get('[data-testid="restart-session"]');
    const firstClick = button.trigger("click");
    const secondClick = button.trigger("click");
    await Promise.all([firstClick, secondClick]);
    await flushPromises();

    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("shows the navigation links to progress, review, and home", async () => {
    getResult.mockResolvedValue(result());

    const { wrapper } = await mountResultPage();
    await flushPromises();

    expect(wrapper.get('a[href="/progress"]').text()).toContain(
      "查看學習進度",
    );
    expect(wrapper.get('a[href="/review"]').text()).toContain("前往今日複習");
    expect(wrapper.get('a[href="/"]').text()).toContain("返回首頁");
  });
});
