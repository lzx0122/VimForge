import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import { STATIC_COURSE_UNITS } from "../data/static-units";
import CoursesPage from "./CoursesPage.vue";

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
  it("contains the ten specified units totaling 100 exercises", () => {
    expect(STATIC_COURSE_UNITS).toHaveLength(10);
    expect(
      STATIC_COURSE_UNITS.reduce(
        (total, unit) => total + unit.exerciseCount,
        0,
      ),
    ).toBe(100);
  });

  it("renders an operable link for every course unit", async () => {
    const wrapper = await mountCoursesPage();
    const cards = wrapper.findAll('[data-testid="course-unit-card"]');

    expect(cards).toHaveLength(10);
    for (const card of cards) {
      const link = card.get("a");
      expect(link.attributes("href")).toMatch(/^\/courses\/[a-z-]+$/);
      expect(link.attributes("aria-disabled")).toBeUndefined();
    }
    expect(wrapper.text()).not.toContain("鎖定");
  });

  it("allows direct access to text objects with only a prerequisite suggestion", async () => {
    const wrapper = await mountCoursesPage();
    const textObjectsCard = wrapper.get('[data-unit="text-objects"]');

    expect(textObjectsCard.get("a").attributes("href")).toBe(
      "/courses/text-objects",
    );
    expect(textObjectsCard.text()).toContain("建議先熟悉");
  });
});
