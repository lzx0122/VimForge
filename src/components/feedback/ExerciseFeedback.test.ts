import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import type { NormalizedAction } from "../../types";
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
  userSequence: "hliciwcustomerName<Esc>",
  recommendedSequence: "ciwcustomerName<Esc>",
  improvementReason: "起始游標已位於變數名稱內，因此不需要先按 ww。",
  actualKeystrokeCount: 6,
  recommendedKeystrokeCount: 3,
  recommendedActions: [
    { type: "vim_command", command: "ciw" },
    { type: "insert_text", text: "customerName", textLength: 12 },
    { type: "mode_change", mode: "normal" },
  ] satisfies NormalizedAction[],
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

  it("explains the meaning and calculation of all three metrics", () => {
    const wrapper = mount(ExerciseFeedback, { props: defaultProps });

    expect(wrapper.text()).toContain(
      "準確：是否一次到位；Undo、重新開始與提示會扣分，按鍵較多不會重複扣分。",
    );
    expect(wrapper.text()).toContain(
      "速度：按鍵精簡度 60% 加上完成時間 40%，並依學習模式提供時間寬限。",
    );
    expect(wrapper.text()).toContain(
      "熟練：跨題目、跨時間累積的 0–5 長期程度，不是單題分數。",
    );

    const details = wrapper.get("details");
    expect(details.get("summary").text()).toBe("查看計算方式");
    expect(details.text()).toContain("一般誤操作 -5");
    expect(details.text()).toContain("Undo -3");
    expect(details.text()).toContain("重新開始 -12");
    expect(details.text()).toContain("最高提示：Level 1 -3、Level 2 -8、Level 3 -15、Level 4 -30");
    expect(details.text()).toContain("按鍵精簡度 60% + 時間效率 40%");
    expect(details.text()).toContain("beginner ×2.0、memory_review ×1.3、efficiency ×1.0");
    expect(details.text()).toContain("0 未學習");
    expect(details.text()).toContain("5 已掌握");
  });

  it("emits requestNext from the next exercise button", async () => {
    const wrapper = mount(ExerciseFeedback, { props: defaultProps });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("requestNext")).toHaveLength(1);
  });

  it("renders a collapsed key guide containing only expected solution keys", () => {
    const wrapper = mount(ExerciseFeedback, { props: defaultProps });
    const guide = wrapper.get('[data-testid="vim-key-guide"]');

    expect(guide.attributes("open")).toBeUndefined();
    expect(guide.text()).toContain("本題按鍵解說");
    expect(guide.text()).toContain("c");
    expect(guide.text()).toContain("w");
    expect(guide.text()).toContain("Esc");
    expect(guide.text()).not.toContain("h：向左移動");
    expect(guide.text()).not.toContain("l：向右移動");
    expect(guide.text()).not.toContain("u：復原上一個變更");
  });
});
