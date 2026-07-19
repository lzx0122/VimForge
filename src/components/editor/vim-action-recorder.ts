import type { NormalizedAction, VimMode } from "../../types";
import {
  normalizeCommandInput,
  type CommandInputEvent,
} from "../../domain/exercise/command-normalizer";

export interface VimActionRecorder {
  recordKey(key: string | null, mode: VimMode): void;
  recordInsertedText(text: string): void;
  finishCommand(): void;
  clear(): void;
}

const SPECIAL_KEYS: Readonly<Record<string, string>> = {
  Escape: "<Esc>",
  Enter: "<Enter>",
  Backspace: "<BS>",
  Delete: "<Del>",
  ArrowLeft: "<Left>",
  ArrowRight: "<Right>",
  ArrowUp: "<Up>",
  ArrowDown: "<Down>",
  Tab: "<Tab>",
};

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

function modifierPrefix(event: KeyboardEvent): string {
  if (event.ctrlKey) {
    return "C";
  }
  if (event.altKey) {
    return "A";
  }
  return "";
}

export function keyboardEventToVimKey(event: KeyboardEvent): string | null {
  if (event.metaKey || MODIFIER_KEYS.has(event.key)) {
    return null;
  }

  const modifier = modifierPrefix(event);
  if (modifier) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    return `<${modifier}-${key}>`;
  }

  return SPECIAL_KEYS[event.key] ?? (event.key.length > 0 ? event.key : null);
}

export function createVimActionRecorder(
  onAction: (action: NormalizedAction) => void,
): VimActionRecorder {
  let pendingEvents: CommandInputEvent[] = [];

  return {
    recordKey(key, mode) {
      pendingEvents.push({ type: "handleKey", key, mode });
    },
    recordInsertedText(text) {
      if (text.length > 0) {
        pendingEvents.push({ type: "text", text });
      }
    },
    finishCommand() {
      if (pendingEvents.length === 0) {
        return;
      }

      pendingEvents.push({ type: "command_done" });
      const actions = normalizeCommandInput(pendingEvents);
      pendingEvents = [];
      actions.forEach(onAction);
    },
    clear() {
      pendingEvents = [];
    },
  };
}
