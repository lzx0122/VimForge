import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

import type { CursorMatchRule, CursorPosition } from "../../types";

export const CURSOR_TARGET_CLASS = "cm-cursor-target";
export const CURSOR_TARGET_EOL_CLASS = "cm-cursor-target-eol";

const TARGET_ARIA_LABEL = "目標游標位置";

class CursorTargetWidget extends WidgetType {
  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = `${CURSOR_TARGET_CLASS} ${CURSOR_TARGET_EOL_CLASS}`;
    element.setAttribute("aria-label", TARGET_ARIA_LABEL);
    return element;
  }

  eq(other: WidgetType): boolean {
    return other instanceof CursorTargetWidget;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function clampPosition(
  doc: EditorView["state"]["doc"],
  position: CursorPosition,
): CursorPosition {
  const line = Math.min(Math.max(position.line, 0), doc.lines - 1);
  const lineLength = doc.line(line + 1).length;

  return {
    line,
    column: Math.min(Math.max(position.column, 0), lineLength),
  };
}

function comparePositions(left: CursorPosition, right: CursorPosition): number {
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  return left.column - right.column;
}

function targetRange(
  doc: EditorView["state"]["doc"],
  target: Exclude<CursorMatchRule, { type: "ignore" }>,
): { start: CursorPosition; end: CursorPosition } {
  if (target.type === "exact") {
    const position = clampPosition(doc, target);
    return { start: position, end: position };
  }

  const start = clampPosition(doc, target.start);
  const end = clampPosition(doc, target.end);
  return comparePositions(start, end) <= 0
    ? { start, end }
    : { start: end, end: start };
}

function buildDecorations(
  doc: EditorView["state"]["doc"],
  target: CursorMatchRule,
): DecorationSet {
  if (target.type === "ignore") {
    return Decoration.none;
  }

  const { start, end } = targetRange(doc, target);
  const builder = new RangeSetBuilder<Decoration>();

  for (let lineNumber = start.line; lineNumber <= end.line; lineNumber += 1) {
    const line = doc.line(lineNumber + 1);
    const firstColumn = lineNumber === start.line ? start.column : 0;
    const lastColumn = lineNumber === end.line ? end.column : line.length;

    for (
      let column = firstColumn;
      column <= lastColumn;
      column += 1
    ) {
      const from = line.from + column;
      if (column === line.length) {
        builder.add(
          from,
          from,
          Decoration.widget({
            widget: new CursorTargetWidget(),
            side: 1,
          }),
        );
        continue;
      }

      builder.add(
        from,
        from + 1,
        Decoration.mark({
          class: CURSOR_TARGET_CLASS,
          attributes: { "aria-label": TARGET_ARIA_LABEL },
        }),
      );
    }
  }

  return builder.finish();
}

const targetTheme = EditorView.theme({
  ".cm-cursor-target": {
    border: "1px solid rgba(250, 204, 21, 0.92)",
    backgroundColor: "rgba(250, 204, 21, 0.16)",
    borderRadius: "2px",
    boxSizing: "border-box",
  },
  ".cm-cursor-target-eol": {
    position: "absolute",
    width: "0.72em",
    height: "1.25em",
    pointerEvents: "none",
  },
});

export function cursorTargetExtension(target: CursorMatchRule): Extension {
  class CursorTargetViewPlugin {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state.doc, target);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.state.doc, target);
      }
    }
  }

  return [
    ViewPlugin.fromClass(CursorTargetViewPlugin, {
      decorations: (value) => value.decorations,
    }),
    targetTheme,
  ];
}
