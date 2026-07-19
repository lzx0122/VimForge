import { describe, expect, it } from "vitest";

import {
  normalizeCommandInput,
  type CommandInputEvent,
} from "./command-normalizer";

function normalKeys(...keys: string[]): CommandInputEvent[] {
  return keys.map((key) => ({
    type: "handleKey",
    key,
    mode: "normal",
  }));
}

describe("normalizeCommandInput", () => {
  it('combines d i " into the di" Vim command', () => {
    expect(normalizeCommandInput(normalKeys("d", "i", '"'))).toEqual([
      { type: "vim_command", command: 'di"' },
    ]);
  });

  it("combines a count, operator, and motion into the equivalent command", () => {
    expect(normalizeCommandInput(normalKeys("2", "d", "w"))).toEqual([
      { type: "vim_command", command: "2dw" },
    ]);
  });

  it("merges consecutive Insert mode text events", () => {
    const events: CommandInputEvent[] = [
      { type: "mode_change", mode: "insert" },
      { type: "text", text: "customer" },
      { type: "text", text: "Name" },
    ];

    expect(normalizeCommandInput(events)).toEqual([
      { type: "mode_change", mode: "insert" },
      { type: "insert_text", text: "customerName", textLength: 12 },
    ]);
  });

  it("turns Escape into a Normal mode change without duplicating its runtime event", () => {
    const events: CommandInputEvent[] = [
      { type: "handleKey", key: "<Esc>", mode: "insert" },
      { type: "mode_change", mode: "normal" },
    ];

    expect(normalizeCommandInput(events)).toEqual([
      { type: "mode_change", mode: "normal" },
    ]);
  });

  it("ignores browser DOM events and unhandled Vim keys", () => {
    const events: CommandInputEvent[] = [
      { type: "keydown", key: "Meta" },
      { type: "keydown", key: "r" },
      { type: "keyup", key: "r" },
      { type: "handleKey", key: null, mode: "normal" },
      { type: "compositionstart" },
      { type: "compositionend" },
    ];

    expect(normalizeCommandInput(events)).toEqual([]);
  });

  it("preserves command boundaries and semantic actions", () => {
    const events: CommandInputEvent[] = [
      ...normalKeys("w"),
      { type: "command_done" },
      ...normalKeys("d", "w"),
      { type: "command_done" },
      { type: "undo" },
      { type: "search", query: "value", direction: "forward" },
      { type: "reset" },
    ];

    expect(normalizeCommandInput(events)).toEqual([
      { type: "vim_command", command: "w" },
      { type: "vim_command", command: "dw" },
      { type: "undo" },
      { type: "search", query: "value", direction: "forward" },
      { type: "reset" },
    ]);
  });
});
