import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseUnitDetail } from "../repositories/course-repository";
import type { PracticeSession } from "../../../types/session";

const { getPublishedUnitBySlug, listPublishedExercises, save, openDatabase } =
  vi.hoisted(() => ({
    getPublishedUnitBySlug: vi.fn(),
    listPublishedExercises: vi.fn(),
    save: vi.fn<(session: PracticeSession, attemptDraft?: null) => Promise<void>>(),
    openDatabase: vi.fn(async () => ({ close: vi.fn() })),
  }));

vi.mock("../../../infrastructure/supabase/supabase-course-repository", () => ({
  SupabaseCourseRepository: vi.fn().mockImplementation(() => ({
    getPublishedUnitBySlug,
  })),
}));

vi.mock("../../../infrastructure/supabase/supabase-exercise-repository", () => ({
  SupabaseExerciseRepository: vi.fn().mockImplementation(() => ({
    listPublishedExercises,
  })),
}));

vi.mock("../../../infrastructure/indexed-db/database", () => ({
  openVimForgeDatabase: openDatabase,
}));

vi.mock("../../../infrastructure/indexed-db/session-repository", () => ({
  SessionRepository: vi.fn().mockImplementation(() => ({
    save,
  })),
}));

import CourseUnitPage from "./CourseUnitPage.vue";

function unitDetail(overrides: Partial<CourseUnitDetail> = {}): CourseUnitDetail {
  return {
    id: "unit-1",
    slug: "text-objects",
    title: "文字物件",
    description: "精準操作文字範圍。",
    difficulty: "advanced",
    estimatedMinutes: 28,
    displayOrder: 8,
    exerciseCount: 2,
    skills: [
      {
        id: "skill-1",
        slug: "quote-object",
        name: "引號文字物件",
        category: "text_object",
        primary: true,
        displayOrder: 1,
      },
    ],
    exercises: [
      {
        id: "exercise-1",
        slug: "text-objects-01",
        title: "練習一",
        exerciseType: "guided",
        difficulty: "advanced",
        displayOrder: 1,
      },
      {
        id: "exercise-2",
        slug: "text-objects-02",
        title: "練習二",
        exerciseType: "challenge",
        difficulty: "advanced",
        displayOrder: 2,
      },
    ],
    ...overrides,
  };
}

async function mountCourseUnitPage(slug = "text-objects") {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/courses/:unitSlug",
        name: "course-unit",
        component: CourseUnitPage,
      },
      { path: "/courses", name: "courses", component: { template: "<div />" } },
      {
        path: "/practice/:sessionId",
        name: "practice",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push(`/courses/${slug}`);
  await router.isReady();

  const wrapper = mount(CourseUnitPage, {
    global: { plugins: [router] },
  });
  return { wrapper, router };
}

describe("CourseUnitPage", () => {
  beforeEach(() => {
    getPublishedUnitBySlug.mockReset();
    listPublishedExercises.mockReset();
    save.mockReset().mockResolvedValue(undefined);
    openDatabase.mockReset().mockResolvedValue({ close: vi.fn() });
  });

  it("shows a loading state before the unit resolves", async () => {
    getPublishedUnitBySlug.mockReturnValue(new Promise(() => {}));

    const { wrapper } = await mountCourseUnitPage();

    expect(wrapper.text()).toContain("正在載入單元內容…");
  });

  it("shows unit detail with title, description, difficulty, time, skills, and exercise type counts", async () => {
    getPublishedUnitBySlug.mockResolvedValue(unitDetail());

    const { wrapper } = await mountCourseUnitPage();
    await flushPromises();

    expect(wrapper.text()).toContain("文字物件");
    expect(wrapper.text()).toContain("精準操作文字範圍。");
    expect(wrapper.text()).toContain("高階");
    expect(wrapper.text()).toContain("28");
    expect(wrapper.get(".course-unit-skills").text()).toContain("引號文字物件");
    const typeCounts = wrapper.get('[data-testid="exercise-type-counts"]');
    expect(typeCounts.text()).toContain("引導：1");
    expect(typeCounts.text()).toContain("挑戰：1");
    expect(wrapper.get("button").text()).toBe("開始本單元");
  });

  it("shows a missing-unit state for an unknown or unpublished slug", async () => {
    getPublishedUnitBySlug.mockResolvedValue(null);

    const { wrapper } = await mountCourseUnitPage("does-not-exist");
    await flushPromises();

    expect(wrapper.text()).toContain("找不到這個課程單元");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("shows an empty state when the unit has no published exercises", async () => {
    getPublishedUnitBySlug.mockResolvedValue(unitDetail({ exerciseCount: 0, exercises: [] }));

    const { wrapper } = await mountCourseUnitPage();
    await flushPromises();

    expect(wrapper.text()).toContain("此單元目前沒有可練習的題目。");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("shows a retryable read-error state when loading the unit fails", async () => {
    getPublishedUnitBySlug.mockRejectedValueOnce(new Error("network down"));

    const { wrapper } = await mountCourseUnitPage();
    await flushPromises();

    expect(wrapper.text()).toContain("暫時無法載入課程單元，請稍後重試。");

    getPublishedUnitBySlug.mockResolvedValueOnce(unitDetail());
    await wrapper.get('[data-testid="course-unit-retry"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("文字物件");
  });

  it("persists locally before routing to the new practice session", async () => {
    getPublishedUnitBySlug.mockResolvedValue(unitDetail());
    listPublishedExercises.mockResolvedValue([
      { id: "exercise-1" },
      { id: "exercise-2" },
    ]);

    const { wrapper, router } = await mountCourseUnitPage();
    await flushPromises();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(save).toHaveBeenCalledTimes(1);
    const [savedSession] = save.mock.calls[0] ?? [];
    expect(savedSession?.exerciseIds).toEqual(["exercise-1", "exercise-2"]);
    expect(router.currentRoute.value.name).toBe("practice");
    expect(router.currentRoute.value.params.sessionId).toBe(savedSession?.id);
  });

  it("does not route when local persistence fails, and shows a save error", async () => {
    getPublishedUnitBySlug.mockResolvedValue(unitDetail());
    listPublishedExercises.mockResolvedValue([{ id: "exercise-1" }]);
    save.mockRejectedValueOnce(new Error("disk full"));

    const { wrapper, router } = await mountCourseUnitPage();
    await flushPromises();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("無法開始本單元，請確認連線後再試。");
    expect(router.currentRoute.value.name).toBe("course-unit");
  });

  it("ignores a second click while starting is already in progress", async () => {
    getPublishedUnitBySlug.mockResolvedValue(unitDetail());
    let resolveExercises: (value: Array<{ id: string }>) => void = () => {};
    listPublishedExercises.mockReturnValue(
      new Promise((resolve) => {
        resolveExercises = resolve;
      }),
    );

    const { wrapper } = await mountCourseUnitPage();
    await flushPromises();

    const button = wrapper.get("button");
    await button.trigger("click");
    await button.trigger("click");
    resolveExercises([{ id: "exercise-1" }]);
    await flushPromises();

    expect(listPublishedExercises).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
