import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import type { VimMode } from "../../../types";
import PracticeEditorStatusBar from "./PracticeEditorStatusBar.vue";

const defaultProps = {
  mode: "normal" as VimMode,
  elapsedSeconds: 0,
  restartDisabled: false,
};

describe("PracticeEditorStatusBar", () => {
  it.each<{
    mode: VimMode;
    label: string;
  }>([
    { mode: "normal", label: "Normal" },
    { mode: "insert", label: "Insert" },
    { mode: "visual", label: "Visual" },
    { mode: "replace", label: "Replace" },
    { mode: "command", label: "Command" },
  ])("renders the visible $mode mode variant", ({ mode, label }) => {
    const wrapper = mount(PracticeEditorStatusBar, {
      props: { ...defaultProps, mode },
    });

    expect(wrapper.attributes("data-mode")).toBe(mode);
    expect(wrapper.get(".vim-mode-badge").text()).toBe(label);
    expect(wrapper.get(".vim-mode-badge").attributes("data-mode")).toBe(mode);
  });

  it.each([
    { seconds: 0, expected: "00:00" },
    { seconds: 65, expected: "01:05" },
    { seconds: 3_665.9, expected: "61:05" },
    { seconds: -10, expected: "00:00" },
    { seconds: Number.NaN, expected: "00:00" },
  ])("formats $seconds seconds as $expected", ({ seconds, expected }) => {
    const wrapper = mount(PracticeEditorStatusBar, {
      props: { ...defaultProps, elapsedSeconds: seconds },
    });

    const timer = wrapper.get('[aria-label="已練習時間"]');
    expect(timer.text()).toBe(expected);
  });

  it("emits one restart request per enabled activation", async () => {
    const wrapper = mount(PracticeEditorStatusBar, {
      props: defaultProps,
    });

    await wrapper.get('button[aria-label="重新開始本題"]').trigger("click");

    expect(wrapper.emitted("requestRestart")).toHaveLength(1);
  });

  it("disables restart without emitting a request", async () => {
    const wrapper = mount(PracticeEditorStatusBar, {
      props: { ...defaultProps, restartDisabled: true },
    });
    const button = wrapper.get('button[aria-label="重新開始本題"]');

    expect(button.attributes()).toHaveProperty("disabled");
    (button.element as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("requestRestart")).toBeUndefined();
  });
});
