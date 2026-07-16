import { EditorState, type Extension } from "@codemirror/state";
import { Vim } from "@replit/codemirror-vim";

import type { CursorPosition } from "../../types";

export interface CreateEditorStateOptions {
  initialContent: string;
  initialCursor: CursorPosition;
  extensions: readonly Extension[];
}

function cursorOffset(content: string, cursor: CursorPosition) {
  const lines = content.split("\n");
  const lineIndex = Math.min(
    Math.max(cursor.line, 0),
    Math.max(lines.length - 1, 0),
  );
  const precedingLength = lines
    .slice(0, lineIndex)
    .reduce((total, line) => total + line.length + 1, 0);
  const lineLength = lines[lineIndex]?.length ?? 0;

  return precedingLength + Math.min(Math.max(cursor.column, 0), lineLength);
}

export function createEditorState({
  initialContent,
  initialCursor,
  extensions,
}: CreateEditorStateOptions) {
  Vim.resetVimGlobalState_();

  return EditorState.create({
    doc: initialContent,
    selection: { anchor: cursorOffset(initialContent, initialCursor) },
    extensions,
  });
}
