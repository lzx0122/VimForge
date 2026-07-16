import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditorPlayback from "./EditorPlayback.vue";
import ProgressiveHintPanel, {
  type ProgressiveHint,
} from "./ProgressiveHintPanel.vue";

const hints: ProgressiveHint[] = [
  { level: 1, content: "先把目標視為一個文字物件。" },
  { level: 2, content: "使用 Operator 加 Text Object。" },
  { level: 3, content: "從 d 和 i 開始。", commandPreview: "di" },
  { level: 4, content: "刪除雙引號內的內容。", commandPreview: 'di"' },
];

afterEach(() => {
  vi.useRealTimers();
});

describe("ProgressiveHintPanel", () => {
  it("reveals only the next hint level on each request", async () => {
    const wrapper = mount(ProgressiveHintPanel, { props: { hints } });
    const revealButton = wrapper.get('[data-testid="reveal-hint"]');

    expect(revealButton.attributes("aria-expanded")).toBe("false");
    expect(wrapper.text()).not.toContain("先把目標視為一個文字物件");

    await revealButton.trigger("click");

    expect(wrapper.text()).toContain("提示 1");
    expect(wrapper.text()).toContain("先把目標視為一個文字物件");
    expect(wrapper.find('[data-hint-level="2"]').exists()).toBe(false);
    expect(revealButton.attributes("aria-expanded")).toBe("true");

    await revealButton.trigger("click");

    expect(wrapper.find('[data-hint-level="2"]').exists()).toBe(true);
    expect(wrapper.find('[data-hint-level="3"]').exists()).toBe(false);
  });

  it("records each newly reached highest level without allowing a jump", async () => {
    const wrapper = mount(ProgressiveHintPanel, { props: { hints } });

    for (let level = 1; level <= 4; level += 1) {
      await wrapper.get('[data-testid="reveal-hint"]').trigger("click");
      expect(wrapper.find(`[data-hint-level="${level}"]`).exists()).toBe(true);
    }

    expect(wrapper.emitted("highestLevelChanged")).toEqual([
      [1],
      [2],
      [3],
      [4],
    ]);
    expect(wrapper.find('[data-testid="reveal-hint"]').exists()).toBe(false);
  });

  it("stops when the next sequential level is missing", async () => {
    const wrapper = mount(ProgressiveHintPanel, {
      props: {
        hints: [hints[0], hints[2], hints[3]].filter(
          (hint): hint is ProgressiveHint => hint !== undefined,
        ),
      },
    });

    await wrapper.get('[data-testid="reveal-hint"]').trigger("click");

    expect(wrapper.find('[data-hint-level="1"]').exists()).toBe(true);
    expect(wrapper.find('[data-hint-level="3"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="reveal-hint"]').exists()).toBe(false);
  });

  it("requests a reset only after Level 4 playback completes", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ProgressiveHintPanel, { props: { hints } });

    for (let level = 1; level <= 4; level += 1) {
      await wrapper.get('[data-testid="reveal-hint"]').trigger("click");
    }

    const playback = wrapper.getComponent(EditorPlayback);
    expect(playback.text()).toContain('di"');

    await playback.get('[data-testid="start-playback"]').trigger("click");

    expect(wrapper.emitted("requestReset")).toBeUndefined();
    expect(playback.get('kbd[aria-current="step"]').text()).toBe("d");
    await vi.runAllTimersAsync();

    expect(wrapper.emitted("requestReset")).toHaveLength(1);
    expect(wrapper.emitted("complete")).toBeUndefined();
    expect(playback.emitted("playbackComplete")).toHaveLength(1);
    expect(playback.emitted("complete")).toBeUndefined();
  });
});
