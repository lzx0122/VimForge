import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import LearningModeGrid from "./LearningModeGrid.vue";

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      {
        path: "/practice/setup",
        name: "practice-setup",
        component: { template: "<div />" },
      },
    ],
  });
}

describe("LearningModeGrid", () => {
  it("displays all three learning mode cards", async () => {
    const router = createTestRouter();
    await router.push("/");
    await router.isReady();

    const wrapper = mount(LearningModeGrid, {
      global: { plugins: [router] },
    });

    expect(wrapper.text()).toContain("從零開始");
    expect(wrapper.text()).toContain("記憶複習");
    expect(wrapper.text()).toContain("效率進階");
    expect(wrapper.findAll("button")).toHaveLength(3);
  });

  it("uses keyboard-operable buttons for every mode", async () => {
    const router = createTestRouter();
    await router.push("/");
    await router.isReady();

    const wrapper = mount(LearningModeGrid, {
      global: { plugins: [router] },
    });

    for (const button of wrapper.findAll("button")) {
      expect(button.attributes("type")).toBe("button");
      expect(button.attributes("disabled")).toBeUndefined();
    }
  });

  it("navigates to practice setup when a mode is selected with Enter", async () => {
    const router = createTestRouter();
    await router.push("/");
    await router.isReady();
    const wrapper = mount(LearningModeGrid, {
      global: { plugins: [router] },
    });

    await wrapper
      .get('[data-mode="memory_review"] button')
      .trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("practice-setup");
    expect(router.currentRoute.value.query).toEqual({
      mode: "memory_review",
    });
  });
});
