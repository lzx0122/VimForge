import { describe, expect, it } from "vitest";

import type { NormalizedAction } from "../../../types";
import { explainExpectedVimKeys } from "./vim-key-guide";

describe("explainExpectedVimKeys", () => {
  it("returns unique Vim keys in first-use order", () => {
    expect(
      explainExpectedVimKeys([
        { type: "vim_command", command: "ciw" },
        { type: "insert_text", text: "name", textLength: 4 },
        { type: "mode_change", mode: "normal" },
        { type: "undo" },
      ]),
    ).toEqual([
      { key: "c", description: "修改操作" },
      { key: "i", description: "進入 Insert Mode" },
      { key: "w", description: "移動到下一個單字開頭" },
      { key: "Esc", description: "回到 Normal Mode" },
      { key: "u", description: "復原上一個變更" },
    ]);
  });

  it("does not turn inserted program text into Vim key explanations", () => {
    expect(
      explainExpectedVimKeys([
        { type: "insert_text", text: "customerName", textLength: 12 },
      ]),
    ).toEqual([]);
  });

  it("keeps unknown valid command keys as labels without failing", () => {
    expect(
      explainExpectedVimKeys([
        { type: "vim_command", command: "z" },
      ]),
    ).toEqual([{ key: "z", description: "本題使用的 Vim 按鍵" }]);
  });

  it("handles search actions and preserves action input", () => {
    const actions = [
      { type: "search", query: "TODO", direction: "forward" },
    ] satisfies NormalizedAction[];

    expect(explainExpectedVimKeys(actions)).toEqual([
      { key: "/", description: "向前搜尋" },
      { key: "Enter", description: "送出搜尋" },
    ]);
    expect(actions).toEqual([
      { type: "search", query: "TODO", direction: "forward" },
    ]);
  });
});
