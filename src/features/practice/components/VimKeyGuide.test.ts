import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import VimKeyGuide from "./VimKeyGuide.vue";

describe("VimKeyGuide", () => {
  it("is collapsed by default and only lists used keys after opening", async () => {
    const wrapper = mount(VimKeyGuide, {
      props: {
        actions: [
          { type: "vim_command", command: "ciw" },
          { type: "insert_text", text: "name", textLength: 4 },
          { type: "mode_change", mode: "normal" },
        ],
      },
    });

    const details = wrapper.get('[data-testid="vim-key-guide"]');
    expect(details.attributes("open")).toBeUndefined();
    expect(details.get("summary").text()).toBe("本題按鍵解說");

    await details.get("summary").trigger("click");

    expect(
      details.findAll('[data-testid="vim-key-explanation"]').map((item) => item.text()),
    ).toEqual([
      "c修改操作",
      "i進入 Insert Mode",
      "w移動到下一個單字開頭",
      "Esc回到 Normal Mode",
    ]);
    expect(details.text()).not.toContain("u：復原上一個變更");
  });

  it("shows a message when the attempt has no Vim keys", () => {
    const wrapper = mount(VimKeyGuide, { props: { actions: [] } });

    expect(wrapper.text()).toContain("本題沒有可解說的 Vim 按鍵。");
  });
});
