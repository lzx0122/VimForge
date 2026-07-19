import type { NormalizedAction } from "../../types";

const MODE_LABELS = {
  insert: "<Insert>",
  visual: "<Visual>",
  replace: "<Replace>",
  command: "<Command>",
} as const;

function formatAction(action: NormalizedAction): string {
  switch (action.type) {
    case "vim_command":
      return action.command;
    case "insert_text":
      return action.text;
    case "mode_change":
      return action.mode === "normal" ? "<Esc>" : MODE_LABELS[action.mode];
    case "undo":
      return "u";
    case "reset":
      return "<Reset>";
    case "search":
      return `${action.direction === "forward" ? "/" : "?"}${action.query}<Enter>`;
  }
}

export function formatActionSequence(
  actions: readonly NormalizedAction[],
): string {
  if (actions.length === 0) {
    return "—";
  }

  return actions.map(formatAction).join("");
}
