import type { NormalizedAction, VimMode } from "../../types";

export type CommandInputEvent =
  | {
      type: "handleKey";
      key: string | null;
      mode: VimMode;
    }
  | { type: "text"; text: string }
  | { type: "mode_change"; mode: VimMode }
  | { type: "command_done" }
  | { type: "undo" }
  | { type: "reset" }
  | {
      type: "search";
      query: string;
      direction: "forward" | "backward";
    }
  | { type: "keydown" | "keyup" | "keypress"; key: string }
  | {
      type: "compositionstart" | "compositionupdate" | "compositionend";
    };

const NORMAL_MODE_KEYS = new Set(["<Esc>", "<C-[>", "<C-c>"]);

export function normalizeCommandInput(
  events: readonly CommandInputEvent[],
): NormalizedAction[] {
  const actions: NormalizedAction[] = [];
  let command = "";
  let insertedText = "";

  function flushCommand() {
    if (!command) {
      return;
    }

    if (command === "u") {
      actions.push({ type: "undo" });
    } else {
      actions.push({ type: "vim_command", command });
    }
    command = "";
  }

  function flushInsertedText() {
    if (!insertedText) {
      return;
    }

    actions.push({
      type: "insert_text",
      text: insertedText,
      textLength: insertedText.length,
    });
    insertedText = "";
  }

  function flushPendingInput() {
    flushCommand();
    flushInsertedText();
  }

  function pushModeChange(mode: VimMode) {
    const previous = actions.at(-1);
    if (previous?.type !== "mode_change" || previous.mode !== mode) {
      actions.push({ type: "mode_change", mode });
    }
  }

  for (const event of events) {
    switch (event.type) {
      case "handleKey":
        if (!event.key) {
          break;
        }
        if (NORMAL_MODE_KEYS.has(event.key)) {
          flushPendingInput();
          pushModeChange("normal");
          break;
        }
        if (event.mode === "insert" || event.mode === "replace") {
          break;
        }
        flushInsertedText();
        command += event.key;
        break;
      case "text":
        flushCommand();
        insertedText += event.text;
        break;
      case "command_done":
        flushPendingInput();
        break;
      case "mode_change":
        flushPendingInput();
        pushModeChange(event.mode);
        break;
      case "undo":
        flushPendingInput();
        actions.push({ type: "undo" });
        break;
      case "reset":
        flushPendingInput();
        actions.push({ type: "reset" });
        break;
      case "search":
        flushPendingInput();
        actions.push({
          type: "search",
          query: event.query,
          direction: event.direction,
        });
        break;
      case "keydown":
      case "keyup":
      case "keypress":
      case "compositionstart":
      case "compositionupdate":
      case "compositionend":
        break;
    }
  }

  flushPendingInput();
  return actions;
}
