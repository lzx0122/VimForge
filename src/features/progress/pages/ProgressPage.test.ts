import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import ProgressPage from "./ProgressPage.vue";

interface ProgressPageFixture {
  hasLearningHistory?: boolean;
  dueReviewCount?: number;
  skills?: readonly {
    id: string;
    name: string;
    masteryLevel: 0 | 1 | 2 | 3 | 4 | 5;
    masteryScore: number;
  }[];
  units?: readonly {
    id: string;
    slug: string;
    title: string;
    completedExercises: number;
    totalExercises: number;
  }[];
  recentAttempts?: readonly {
    id: string;
    exerciseTitle: string;
    completed: boolean;
    accuracyScore: number;
    occurredAt: string;
    errorSummary: string | null;
  }[];
}

const progressSummary = {
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
      errorSummary: "未回到 Normal Mode",
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
} as const;

async function mountProgressPage(props: ProgressPageFixture = {}) {
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
    props,
    global: { plugins: [router] },
  });
}

describe("ProgressPage", () => {
  it("shows skill mastery from Level 0 through Level 5 and due reviews", async () => {
    const wrapper = await mountProgressPage(progressSummary);

    expect(wrapper.text()).toContain("基礎移動");
    expect(wrapper.text()).toContain("Level 5 / 5");
    expect(wrapper.text()).toContain("文字物件");
    expect(wrapper.text()).toContain("Level 0 / 5");
    expect(wrapper.get('[data-testid="due-review-count"]').text()).toBe("12");
    expect(wrapper.findAll('progress[max="5"]')).toHaveLength(2);
  });

  it("shows unit completion and recent errors", async () => {
    const wrapper = await mountProgressPage(progressSummary);

    expect(wrapper.get('[data-unit-slug="basic-cursor-movement"]').text()).toContain(
      "8 / 8 題",
    );
    expect(wrapper.get('[data-unit-slug="text-objects"]').text()).toContain(
      "4 / 14 題",
    );
    expect(wrapper.get('[data-attempt-id="attempt-error"]').text()).toContain(
      "未回到 Normal Mode",
    );
    expect(wrapper.get('[data-attempt-id="attempt-success"]').text()).toContain(
      "準確 96",
    );
  });

  it("does not introduce XP or rankings", async () => {
    const wrapper = await mountProgressPage(progressSummary);

    expect(wrapper.text()).not.toMatch(/XP|排名/);
  });

  it("shows an honest empty state without fabricated progress", async () => {
    const wrapper = await mountProgressPage({
      hasLearningHistory: false,
      dueReviewCount: 0,
      skills: [],
      units: [],
      recentAttempts: [],
    });

    expect(wrapper.text()).toContain("尚無學習紀錄");
    expect(wrapper.get('a[href="/courses"]').text()).toContain("前往課程");
    expect(wrapper.find('[data-testid="due-review-count"]').exists()).toBe(
      false,
    );
  });
});
