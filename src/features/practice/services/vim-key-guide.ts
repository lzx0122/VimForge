import type { NormalizedAction } from "../../../types";

export interface VimKeyExplanation {
  key: string;
  description: string;
}

const KEY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  a: "在游標後進入 Insert Mode",
  A: "在行尾進入 Insert Mode",
  b: "移動到上一個單字開頭",
  B: "移動到上一個大單字開頭",
  c: "修改操作",
  d: "刪除操作",
  e: "移動到單字結尾",
  E: "移動到大單字結尾",
  f: "跳到行內指定字元",
  F: "反向跳到行內指定字元",
  h: "向左移動",
  i: "進入 Insert Mode",
  j: "向下移動",
  k: "向上移動",
  l: "向右移動",
  n: "跳到下一個搜尋結果",
  N: "跳到上一個搜尋結果",
  o: "在下一行開啟 Insert Mode",
  O: "在上一行開啟 Insert Mode",
  p: "在游標後貼上",
  P: "在游標前貼上",
  r: "取代一個字元",
  t: "跳到指定字元前一格",
  T: "反向跳到指定字元後一格",
  u: "復原上一個變更",
  v: "進入 Visual Mode",
  V: "選取整行並進入 Visual Mode",
  w: "移動到下一個單字開頭",
  W: "移動到下一個大單字開頭",
  x: "刪除游標下的字元",
  X: "刪除游標前的字元",
  y: "複製操作",
  "0": "移動到行首",
  "^": "移動到第一個非空白字元",
  $: "移動到行尾",
  "/": "向前搜尋",
  "?": "向後搜尋",
  "*": "搜尋游標下的單字",
  "#": "反向搜尋游標下的單字",
  ";": "重複上一個行內跳轉",
  ",": "反向重複上一個行內跳轉",
  Enter: "送出搜尋",
  Esc: "回到 Normal Mode",
};

const TOKEN_PATTERN = /<[^>]+>|./gu;

function normalizeToken(token: string): string {
  if (token === "<Esc>") {
    return "Esc";
  }

  if (token === "<Enter>") {
    return "Enter";
  }

  return token;
}

function addExplanation(
  result: VimKeyExplanation[],
  seen: Set<string>,
  key: string,
): void {
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  result.push({
    key,
    description: KEY_DESCRIPTIONS[key] ?? "本題使用的 Vim 按鍵",
  });
}

function addCommandTokens(
  result: VimKeyExplanation[],
  seen: Set<string>,
  command: string,
): void {
  for (const token of command.match(TOKEN_PATTERN) ?? []) {
    addExplanation(result, seen, normalizeToken(token));
  }
}

export function explainUsedVimKeys(
  actions: readonly NormalizedAction[],
): VimKeyExplanation[] {
  const result: VimKeyExplanation[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    switch (action.type) {
      case "vim_command":
        addCommandTokens(result, seen, action.command);
        break;
      case "mode_change":
        if (action.mode === "normal") {
          addExplanation(result, seen, "Esc");
        }
        break;
      case "undo":
        addExplanation(result, seen, "u");
        break;
      case "search":
        addExplanation(result, seen, action.direction === "forward" ? "/" : "?");
        addExplanation(result, seen, "Enter");
        break;
      case "insert_text":
      case "reset":
        break;
    }
  }

  return result;
}
