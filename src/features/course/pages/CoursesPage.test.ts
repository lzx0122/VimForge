import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseUnitSummary } from "../repositories/course-repository";

const { listPublishedUnits } = vi.hoisted(() => ({
  listPublishedUnits: vi.fn(),
}));

vi.mock("../../../infrastructure/supabase/supabase-course-repository", () => ({
  SupabaseCourseRepository: vi.fn().mockImplementation(() => ({
    listPublishedUnits,
  })),
}));

import CoursesPage from "./CoursesPage.vue";

function unit(overrides: Partial<CourseUnitSummary> = {}): CourseUnitSummary {
  return {
    id: "unit-1",
    slug: "text-objects",
    title: "文字物件",
    description: "精準操作文字範圍。",
    difficulty: "advanced",
    estimatedMinutes: 28,
    displayOrder: 8,
    exerciseCount: 12,
    primarySkills: [
      {
        id: "skill-1",
        slug: "quote-object",
        name: "引號文字物件",
        category: "text_object",
        primary: true,
        displayOrder: 1,
      },
    ],
    ...overrides,
  };
}

async function mountCoursesPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/courses", component: CoursesPage },
      {
        path: "/courses/:unitSlug",
        name: "course-unit",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push("/courses");
  await router.isReady();

  return mount(CoursesPage, {
    global: { plugins: [router] },
  });
}

describe("CoursesPage", () => {
  beforeEach(() => {
    listPublishedUnits.mockReset();
  });

  it("shows a loading state before the repository resolves", async () => {
    listPublishedUnits.mockReturnValue(new Promise(() => {}));

    const wrapper = await mountCoursesPage();

    expect(wrapper.text()).toContain("正在載入課程…");
    expect(wrapper.findAll('[data-testid="course-unit-card"]')).toHaveLength(0);
  });

  it("renders published units with description, difficulty, time, exercise count, and primary skill badges", async () => {
    listPublishedUnits.mockResolvedValue([unit()]);

    const wrapper = await mountCoursesPage();
    await flushPromises();

    const cards = wrapper.findAll('[data-testid="course-unit-card"]');
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.text()).toContain("文字物件");
    expect(card.text()).toContain("精準操作文字範圍。");
    expect(card.text()).toContain("28");
    expect(card.text()).toContain("12 題");
    expect(card.text()).toContain("高階");
    expect(card.findAll(".course-unit-skills li")).toHaveLength(1);
    expect(card.get(".course-unit-skills").text()).toContain("引號文字物件");
    expect(card.get("a").attributes("href")).toBe("/courses/text-objects");
  });

  it("shows an empty state when there are no published units", async () => {
    listPublishedUnits.mockResolvedValue([]);

    const wrapper = await mountCoursesPage();
    await flushPromises();

    expect(wrapper.text()).toContain("目前沒有已發布的課程單元。");
    expect(wrapper.findAll('[data-testid="course-unit-card"]')).toHaveLength(0);
  });

  it("shows a retryable error state when loading fails, and recovers on retry", async () => {
    listPublishedUnits.mockRejectedValueOnce(new Error("network down"));

    const wrapper = await mountCoursesPage();
    await flushPromises();

    expect(wrapper.text()).toContain("暫時無法載入課程內容，請稍後重試。");
    expect(wrapper.findAll('[data-testid="course-unit-card"]')).toHaveLength(0);

    listPublishedUnits.mockResolvedValueOnce([unit()]);
    await wrapper.get('[data-testid="courses-retry"]').trigger("click");
    await flushPromises();

    expect(wrapper.findAll('[data-testid="course-unit-card"]')).toHaveLength(1);
    expect(wrapper.text()).not.toContain("暫時無法載入課程內容，請稍後重試。");
  });
});
