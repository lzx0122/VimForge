import { describe, expect, it } from "vitest";

import { formatActionSequence } from "./action-sequence-formatter";

describe("formatActionSequence", () => {
  it("formats commands, inserted text, and Escape as one readable sequence", () => {
    expect(
      formatActionSequence([
        { type: "vim_command", command: "ciw" },
        { type: "insert_text", text: "customerName", textLength: 12 },
        { type: "mode_change", mode: "normal" },
      ]),
    ).toBe("ciwcustomerName<Esc>");
  });

  it("formats searches, undo, reset, and non-Normal mode changes", () => {
    expect(
      formatActionSequence([
        { type: "search", query: "customer", direction: "forward" },
        { type: "search", query: "legacy", direction: "backward" },
        { type: "undo" },
        { type: "reset" },
        { type: "mode_change", mode: "insert" },
        { type: "mode_change", mode: "visual" },
        { type: "mode_change", mode: "replace" },
        { type: "mode_change", mode: "command" },
      ]),
    ).toBe(
      "/customer<Enter>?legacy<Enter>u<Reset><Insert><Visual><Replace><Command>",
    );
  });

  it("uses an em dash when no actions were recorded", () => {
    expect(formatActionSequence([])).toBe("—");
  });
});
