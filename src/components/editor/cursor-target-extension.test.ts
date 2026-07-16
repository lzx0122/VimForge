import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import type { CursorMatchRule } from "../../types";
import {
  CURSOR_TARGET_CLASS,
  CURSOR_TARGET_EOL_CLASS,
  cursorTargetExtension,
} from "./cursor-target-extension";

const views: EditorView[] = [];

function mountTargetEditor(
  content: string,
  target: CursorMatchRule,
): { parent: HTMLDivElement; view: EditorView } {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: content,
      extensions: [cursorTargetExtension(target)],
    }),
  });
  views.push(view);
  return { parent, view };
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

describe("cursorTargetExtension", () => {
  it("does not render a target for an ignored cursor rule", () => {
    const { parent } = mountTargetEditor("abc", { type: "ignore" });

    expect(parent.querySelector(`.${CURSOR_TARGET_CLASS}`)).toBeNull();
    expect(parent.querySelector(`.${CURSOR_TARGET_EOL_CLASS}`)).toBeNull();
  });

  it("marks the exact target character", () => {
    const { parent } = mountTargetEditor("abc", {
      type: "exact",
      line: 0,
      column: 1,
    });

    const target = parent.querySelector(`.${CURSOR_TARGET_CLASS}`);
    expect(target).not.toBeNull();
    expect(target?.textContent).toBe("b");
    expect(target?.getAttribute("aria-label")).toBe("目標游標位置");
  });

  it("renders an end-of-line target without changing document text", () => {
    const { parent, view } = mountTargetEditor("abc", {
      type: "exact",
      line: 0,
      column: 3,
    });

    expect(parent.querySelector(`.${CURSOR_TARGET_EOL_CLASS}`)).not.toBeNull();
    expect(view.state.doc.toString()).toBe("abc");
  });

  it("marks every accepted position in a same-line range", () => {
    const { parent } = mountTargetEditor("abcd", {
      type: "range",
      start: { line: 0, column: 1 },
      end: { line: 0, column: 3 },
    });

    expect(
      Array.from(parent.querySelectorAll(`.${CURSOR_TARGET_CLASS}`)).map(
        (element) => element.textContent,
      ),
    ).toEqual(["b", "c", "d"]);
  });

  it("marks multiline ranges and clamps presentation-only out-of-bounds positions", () => {
    const { parent } = mountTargetEditor("a\nbc\nde", {
      type: "range",
      start: { line: -1, column: 0 },
      end: { line: 99, column: 99 },
    });

    expect(
      parent.querySelectorAll(
        `.${CURSOR_TARGET_CLASS}:not(.${CURSOR_TARGET_EOL_CLASS})`,
      ),
    ).toHaveLength(5);
    expect(parent.querySelectorAll(`.${CURSOR_TARGET_EOL_CLASS}`)).toHaveLength(
      3,
    );
  });

  it("rebuilds target offsets when the document changes", () => {
    const { parent, view } = mountTargetEditor("abc", {
      type: "exact",
      line: 0,
      column: 1,
    });

    expect(parent.querySelector(`.${CURSOR_TARGET_CLASS}`)?.textContent).toBe(
      "b",
    );

    view.dispatch({ changes: { from: 0, to: 3, insert: "x" } });

    expect(
      parent.querySelector(
        `.${CURSOR_TARGET_CLASS}:not(.${CURSOR_TARGET_EOL_CLASS})`,
      ),
    ).toBeNull();
    expect(parent.querySelector(`.${CURSOR_TARGET_EOL_CLASS}`)).not.toBeNull();
  });
});
