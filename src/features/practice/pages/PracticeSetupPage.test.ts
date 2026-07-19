import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import PracticeSetupPage from "./PracticeSetupPage.vue";

async function mountSetupPage(mode: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/practice/setup",
        name: "practice-setup",
        component: PracticeSetupPage,
      },
      { path: "/courses", name: "courses", component: { template: "<div />" } },
    ],
  });
  await router.push({
    name: "practice-setup",
    query: { mode },
  });
  await router.isReady();

  return mount(PracticeSetupPage, {
    global: { plugins: [createPinia(), router] },
  });
}

describe("PracticeSetupPage", () => {
  it("shows 5, 10, and 20 questions with 10 selected by default", async () => {
    const wrapper = await mountSetupPage("memory_review");
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
  });

  it("offers daily review and topic practice for memory review", async () => {
    const wrapper = await mountSetupPage("memory_review");

    expect(wrapper.text()).toContain("今日複習");
    expect(wrapper.text()).toContain("指定主題");
    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(false);

    await wrapper.get('input[value="topic_practice"]').setValue();

    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "至少選擇一個主題",
    );

    await wrapper.get('input[value="search"]').setValue();
    await wrapper.get('input[value="text-objects"]').setValue();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('input[value="search"]').element).toMatchObject({
      checked: true,
    });
    expect(wrapper.get('input[value="text-objects"]').element).toMatchObject({
      checked: true,
    });
  });

  it("shows question count and optional topics for efficiency mode", async () => {
    const wrapper = await mountSetupPage("efficiency");

    expect(wrapper.find('[data-testid="question-count-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="practice-source-selector"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("可選主題");
  });

  it("offers course units without forcing a question count for beginners", async () => {
    const wrapper = await mountSetupPage("beginner");

    expect(wrapper.find('[data-testid="question-count-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="practice-source-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(false);
    expect(wrapper.get('a[href="/courses"]').text()).toContain("選擇課程單元");
  });
});
