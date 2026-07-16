import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ExerciseFeedback, {
  type ExerciseFeedbackProps,
} from "./ExerciseFeedback.vue";

const defaultProps: ExerciseFeedbackProps = {
  completed: true,
  learningMode: "memory_review",
  accuracyScore: 100,
  speedScore: 78,
  previousMasteryLevel: 2,
  nextMasteryLevel: 3,
  userSequence: "wwciwcustomerName<Esc>",
  recommendedSequence: "ciwcustomerName<Esc>",
  improvementReason: "起始游標已位於變數名稱內，因此不需要先按 ww。",
  actualKeystrokeCount: 6,
  recommendedKeystrokeCount: 3,
};

describe("ExerciseFeedback", () => {
  it("renders completion, accuracy, speed, mastery, and solutions in order", () => {
    const wrapper = mount(ExerciseFeedback, { props: defaultProps });
    const sections = wrapper
      .findAll("[data-feedback-section]")
      .map((section) => section.attributes("data-feedback-section"));

    expect(sections).toEqual([
      "completion",
      "accuracy",
      "speed",
      "mastery",
      "solutions",
    ]);
    expect(wrapper.text()).toContain("完成！");
    expect(wrapper.text()).toContain("準確");
    expect(wrapper.text()).toContain("速度");
    expect(wrapper.text()).toContain("熟練");
    expect(wrapper.text()).toContain(defaultProps.userSequence);
    expect(wrapper.text()).toContain(defaultProps.recommendedSequence);
    expect(wrapper.text()).toContain(defaultProps.improvementReason);
  });

  it("de-emphasizes speed for beginner mode", () => {
    const wrapper = mount(ExerciseFeedback, {
      props: { ...defaultProps, learningMode: "beginner" },
    });
    const speedSection = wrapper.get('[data-feedback-section="speed"]');

    expect(speedSection.classes()).toContain("is-subdued");
    expect(speedSection.text()).toContain("速度（參考）");
    expect(
      speedSection.get('[data-testid="metric-card"]').attributes("aria-label"),
    ).toContain("速度（參考）");
    expect(wrapper.find('[data-testid="keystroke-gap"]').exists()).toBe(false);
  });

  it("shows the keystroke gap in efficiency mode", () => {
    const wrapper = mount(ExerciseFeedback, {
      props: { ...defaultProps, learningMode: "efficiency" },
    });
    const gap = wrapper.get('[data-testid="keystroke-gap"]');

    expect(gap.text()).toContain("按鍵差距：+3");
    expect(gap.text()).toContain("實際 6 / 推薦 3");
    expect(wrapper.get('[data-feedback-section="speed"]').classes()).not.toContain(
      "is-subdued",
    );
  });

  it("provides textual accessibility labels for every metric", () => {
    const wrapper = mount(ExerciseFeedback, { props: defaultProps });
    const metricLabels = wrapper
      .findAll('[data-testid="metric-card"]')
      .map((card) => card.attributes("aria-label"));

    expect(metricLabels).toEqual([
      "準確：100 分，一次完成",
      "速度：78 分，流暢",
      "熟練：2 到 3，熟悉",
    ]);
    expect(wrapper.get('[role="status"]').text()).toContain("完成");
    expect(wrapper.get("article").attributes("aria-labelledby")).toBe(
      "exercise-feedback-title",
    );
    expect(wrapper.get("button").attributes("type")).toBe("button");
  });

  it("emits requestNext from the next exercise button", async () => {
    const wrapper = mount(ExerciseFeedback, { props: defaultProps });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("requestNext")).toHaveLength(1);
  });
});
