import { describe, expect, it } from "vitest";

import { formatKeyboardEvent } from "./keyboard-display";

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("formatKeyboardEvent", () => {
  it("formats an unmodified letter key", () => {
    expect(formatKeyboardEvent(keydown({ key: "d" }))).toBe("d");
  });

  it("formats a shifted letter key as Shift-<lowercase key>", () => {
    expect(
      formatKeyboardEvent(keydown({ key: "G", shiftKey: true })),
    ).toBe("Shift-g");
  });

  it("formats a ctrl-modified key as Ctrl-<key>", () => {
    expect(
      formatKeyboardEvent(keydown({ key: "r", ctrlKey: true })),
    ).toBe("Ctrl-r");
  });

  it("orders combined modifiers as Ctrl-Alt-<key>", () => {
    expect(
      formatKeyboardEvent(
        keydown({ key: "x", ctrlKey: true, altKey: true }),
      ),
    ).toBe("Ctrl-Alt-x");
  });

  it("orders all four modifiers as Ctrl-Alt-Meta-Shift-<key>", () => {
    expect(
      formatKeyboardEvent(
        keydown({
          key: "z",
          ctrlKey: true,
          altKey: true,
          metaKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe("Ctrl-Alt-Meta-Shift-z");
  });

  const specialKeys: Array<[string, string]> = [
    ["Escape", "<Esc>"],
    ["Enter", "<Enter>"],
    ["Backspace", "<Backspace>"],
    ["Delete", "<Delete>"],
    ["Tab", "<Tab>"],
    ["ArrowUp", "<Up>"],
    ["ArrowDown", "<Down>"],
    ["ArrowLeft", "<Left>"],
    ["ArrowRight", "<Right>"],
  ];

  it.each(specialKeys)("formats %s as %s", (key, expected) => {
    expect(formatKeyboardEvent(keydown({ key }))).toBe(expected);
  });

  const modifierOnlyKeys = ["Shift", "Control", "Alt", "Meta"];

  it.each(modifierOnlyKeys)(
    "returns null for a modifier-only %s press",
    (key) => {
      expect(formatKeyboardEvent(keydown({ key }))).toBeNull();
    },
  );
});
