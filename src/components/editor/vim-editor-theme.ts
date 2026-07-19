import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const VIM_EDITOR_COLORS = {
  background: "#171b23",
  foreground: "#d8dee9",
  comment: "#6f8582",
  keyword: "#78dcca",
  function: "#7aa2f7",
  literal: "#a6e35b",
  punctuation: "#c678dd",
  lineNumber: "#7c8088",
  activeLineNumber: "#edf0f5",
  cursor: "#45d6b0",
} as const;

const surfaceTheme = EditorView.theme(
  {
    "&": {
      color: VIM_EDITOR_COLORS.foreground,
      backgroundColor: VIM_EDITOR_COLORS.background,
    },
    ".cm-content": {
      caretColor: VIM_EDITOR_COLORS.cursor,
    },
    ".cm-gutters": {
      color: VIM_EDITOR_COLORS.lineNumber,
      backgroundColor: VIM_EDITOR_COLORS.background,
      borderRightColor: "rgba(216, 222, 233, 0.12)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ".cm-activeLineGutter": {
      color: VIM_EDITOR_COLORS.activeLineNumber,
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: VIM_EDITOR_COLORS.cursor,
    },
    ".cm-fat-cursor": {
      color: VIM_EDITOR_COLORS.background,
      background: `${VIM_EDITOR_COLORS.cursor} !important`,
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(69, 214, 176, 0.24)",
    },
  },
  { dark: true },
);

const syntaxTheme = HighlightStyle.define([
  {
    tag: tags.comment,
    color: VIM_EDITOR_COLORS.comment,
  },
  {
    tag: [
      tags.keyword,
      tags.typeName,
      tags.operator,
      tags.operatorKeyword,
    ],
    color: VIM_EDITOR_COLORS.keyword,
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.definition(tags.function(tags.variableName)),
      tags.propertyName,
    ],
    color: VIM_EDITOR_COLORS.function,
  },
  {
    tag: [tags.string, tags.number, tags.bool, tags.null],
    color: VIM_EDITOR_COLORS.literal,
  },
  {
    tag: [tags.bracket, tags.punctuation, tags.separator],
    color: VIM_EDITOR_COLORS.punctuation,
  },
]);

export const vimEditorTheme: readonly Extension[] = [
  surfaceTheme,
  syntaxHighlighting(syntaxTheme),
];
