import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import ReviewPage from "./ReviewPage.vue";

interface ReviewPageFixture {
  hasLearningHistory?: boolean;
  dueCount?: number;
  weakSkills?: readonly {
    id: string;
    name: string;
    masteryLevel: number;
    dueCount: number;
  }[];
}

const learningSummary = {
  hasLearningHistory: true,
  dueCount: 7,
  weakSkills: [
    {
      id: "text-objects",
      name: "文字物件",
      masteryLevel: 2,
      dueCount: 4,
    },
    {
      id: "line-find",
      name: "行內搜尋",
      masteryLevel: 1,
      dueCount: 3,
    },
  ],
} as const;

async function mountReviewPage(
  props: ReviewPageFixture = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/review", name: "review", component: ReviewPage },
      {
        path: "/practice/setup",
        name: "practice-setup",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push("/review");
  await router.isReady();

  return mount(ReviewPage, {
    props,
    global: { plugins: [router] },
  });
}

describe("ReviewPage", () => {
  it("shows the due count and primary weak skills", async () => {
    const wrapper = await mountReviewPage(learningSummary);

    expect(wrapper.get('[data-testid="due-count"]').text()).toBe("7");
    expect(wrapper.get('[aria-labelledby="weak-skills-title"]').text()).toContain(
      "文字物件",
    );
    expect(wrapper.get('[aria-labelledby="weak-skills-title"]').text()).toContain(
      "行內搜尋",
    );
    expect(wrapper.text()).toContain("熟練度 2 / 5");
  });

  it("offers 5, 10, and 20 questions with 10 selected by default", async () => {
    const wrapper = await mountReviewPage(learningSummary);
    const selector = wrapper.get('[data-testid="question-count-selector"]');
    const inputs = selector.findAll('input[type="radio"]');

    expect(inputs.map((input) => input.attributes("value"))).toEqual([
      "5",
      "10",
      "20",
    ]);
    expect(selector.get('input[value="10"]').element).toMatchObject({
      checked: true,
    });

    await selector.get('input[value="20"]').setValue();

    expect(selector.get('input[value="20"]').element).toMatchObject({
      checked: true,
    });
    expect(wrapper.get('[data-testid="selected-review-count"]').text()).toBe(
      "20",
    );
  });

  it("recommends a beginner course when there is no learning history", async () => {
    const wrapper = await mountReviewPage({
      hasLearningHistory: false,
      dueCount: 0,
      weakSkills: [],
    });

    expect(wrapper.text()).toContain("尚無練習紀錄");
    expect(wrapper.text()).toContain("基礎題組");
    expect(wrapper.get('a[href="/practice/setup?mode=beginner"]').text()).toContain(
      "開始基礎題組",
    );
    expect(wrapper.find('[data-testid="question-count-selector"]').exists()).toBe(
      false,
    );
  });
});
