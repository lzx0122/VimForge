import { describe, expect, it } from "vitest";

import type { NormalizedAction } from "../../types";
import {
  createVimActionRecorder,
  keyboardEventToVimKey,
} from "./vim-action-recorder";

describe("createVimActionRecorder", () => {
  it("groups a completed normal-mode command", () => {
    const actions: NormalizedAction[] = [];
    const recorder = createVimActionRecorder((action) => actions.push(action));

    recorder.recordKey("d", "normal");
    recorder.recordKey("i", "normal");
    recorder.recordKey('"', "normal");
    recorder.finishCommand();

    expect(actions).toEqual([{ type: "vim_command", command: 'di"' }]);
  });

  it("records inserted text followed by Escape", () => {
    const actions: NormalizedAction[] = [];
    const recorder = createVimActionRecorder((action) => actions.push(action));

    recorder.recordInsertedText("customerName");
    recorder.recordKey("<Esc>", "insert");
    recorder.finishCommand();

    expect(actions).toEqual([
      { type: "insert_text", text: "customerName", textLength: 12 },
      { type: "mode_change", mode: "normal" },
    ]);
  });

  it("does not replay pending events after clear", () => {
    const actions: NormalizedAction[] = [];
    const recorder = createVimActionRecorder((action) => actions.push(action));

    recorder.recordKey("d", "normal");
    recorder.clear();
    recorder.finishCommand();

    expect(actions).toEqual([]);
  });

  it("records search prompt submissions as semantic search actions", () => {
    const actions: NormalizedAction[] = [];
    const recorder = createVimActionRecorder((action) => actions.push(action));

    recorder.recordKey("/", "normal");
    recorder.beginPrompt("/");
    recorder.recordPromptSubmission("/", "ProcessAsync");
    recorder.recordKey("?", "normal");
    recorder.beginPrompt("?");
    recorder.recordPromptSubmission("?", "API_URL");

    expect(actions).toEqual([
      {
        type: "search",
        query: "ProcessAsync",
        direction: "forward",
      },
      {
        type: "search",
        query: "API_URL",
        direction: "backward",
      },
    ]);
  });

  it("keeps prompt-like characters when Vim does not open a prompt", () => {
    const actions: NormalizedAction[] = [];
    const recorder = createVimActionRecorder((action) => actions.push(action));

    for (const command of ["f:", "T:", "f/", "r?"]) {
      for (const key of command) {
        recorder.recordKey(key, "normal");
      }
      recorder.finishCommand();
    }

    expect(actions).toEqual([
      { type: "vim_command", command: "f:" },
      { type: "vim_command", command: "T:" },
      { type: "vim_command", command: "f/" },
      { type: "vim_command", command: "r?" },
    ]);
  });

  it("records Ex prompt submissions and confirmation choices exactly", () => {
    const actions: NormalizedAction[] = [];
    const recorder = createVimActionRecorder((action) => actions.push(action));

    recorder.recordKey(":", "normal");
    recorder.beginPrompt(":");
    recorder.recordPromptSubmission(":", "%s/debug/trace/gc");
    recorder.recordPromptDecision("y");
    recorder.recordPromptDecision("y");

    expect(actions).toEqual([
      {
        type: "vim_command",
        command: ":%s/debug/trace/gc<Enter>",
      },
      { type: "vim_command", command: "y" },
      { type: "vim_command", command: "y" },
    ]);
  });

  it("strips Vim-owned initial text from Visual Ex prompt submissions", () => {
    const actions: NormalizedAction[] = [];
    const recorder = createVimActionRecorder((action) => actions.push(action));

    recorder.recordKey(":", "visual");
    recorder.beginPrompt(":");
    recorder.recordPromptSubmission(
      ":",
      "'<,'>s/old/new/g",
      "'<,'>",
    );

    expect(actions).toEqual([
      {
        type: "vim_command",
        command: ":s/old/new/g<Enter>",
      },
    ]);
  });
});

describe("keyboardEventToVimKey", () => {
  it.each([
    ["printable keys", new KeyboardEvent("keydown", { key: "w" }), "w"],
    ["Escape", new KeyboardEvent("keydown", { key: "Escape" }), "<Esc>"],
    ["Enter", new KeyboardEvent("keydown", { key: "Enter" }), "<Enter>"],
    ["Backspace", new KeyboardEvent("keydown", { key: "Backspace" }), "<BS>"],
    [
      "Control keys",
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
      "<C-r>",
    ],
  ])("converts %s", (_label, event, expected) => {
    expect(keyboardEventToVimKey(event)).toBe(expected);
  });

  it("ignores modifier-only and browser Meta shortcuts", () => {
    expect(
      keyboardEventToVimKey(new KeyboardEvent("keydown", { key: "Shift" })),
    ).toBeNull();
    expect(
      keyboardEventToVimKey(
        new KeyboardEvent("keydown", { key: "r", metaKey: true }),
      ),
    ).toBeNull();
  });
});
