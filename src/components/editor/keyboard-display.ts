const IGNORED_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

const SPECIAL_KEY_DISPLAY: Readonly<Record<string, string>> = {
  Escape: "<Esc>",
  Enter: "<Enter>",
  Backspace: "<Backspace>",
  Delete: "<Delete>",
  Tab: "<Tab>",
  ArrowUp: "<Up>",
  ArrowDown: "<Down>",
  ArrowLeft: "<Left>",
  ArrowRight: "<Right>",
};

export function formatKeyboardEvent(event: KeyboardEvent): string | null {
  if (IGNORED_KEYS.has(event.key)) {
    return null;
  }

  const baseKey = SPECIAL_KEY_DISPLAY[event.key] ?? event.key;
  const displayKey =
    event.shiftKey && baseKey.length === 1 ? baseKey.toLowerCase() : baseKey;

  const modifiers: string[] = [];
  if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.metaKey) {
    modifiers.push("Meta");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }

  if (modifiers.length === 0) {
    return displayKey;
  }

  return `${modifiers.join("-")}-${displayKey}`;
}
