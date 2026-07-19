import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import type { VimMode } from "../../types";
import VimModeBadge from "./VimModeBadge.vue";

describe("VimModeBadge", () => {
  it.each<{
    mode: VimMode;
    label: string;
  }>([
    { mode: "normal", label: "Normal" },
    { mode: "insert", label: "Insert" },
    { mode: "visual", label: "Visual" },
  ])("shows $label for $mode mode", ({ mode, label }) => {
    const wrapper = mount(VimModeBadge, {
      props: { mode },
    });

    expect(wrapper.text()).toBe(label);
    expect(wrapper.attributes("data-mode")).toBe(mode);
  });
});
