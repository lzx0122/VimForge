import type { Extension } from "@codemirror/state";

import type {
  CursorPosition,
  CursorMatchRule,
  NormalizedAction,
  SupportedLanguage,
  VimMode,
} from "../../types";

export interface VimEditorProps {
  initialContent: string;
  initialCursor: CursorPosition;
  language: SupportedLanguage;
  showLineNumbers: boolean;
  showKeypresses: boolean;
  autoFocus?: boolean;
  readOnly?: boolean;
  cursorTarget?: CursorMatchRule;
}

export interface VimEditorEmits {
  contentChanged: [content: string];
  cursorChanged: [cursor: CursorPosition];
  modeChanged: [mode: VimMode];
  actionRecorded: [action: NormalizedAction];
  editorReady: [];
}

export function orderEditorExtensions(
  vimExtension: Extension,
  remainingExtensions: readonly Extension[],
): Extension[] {
  return [vimExtension, ...remainingExtensions];
}
