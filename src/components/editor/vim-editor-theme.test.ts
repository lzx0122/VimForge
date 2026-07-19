import { EditorView } from "@codemirror/view";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import VimEditor from "./VimEditor.vue";

const originalGetClientRects = Range.prototype.getClientRects;

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
});

afterAll(() => {
  if (originalGetClientRects) {
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: originalGetClientRects,
    });
    return;
  }

  Reflect.deleteProperty(Range.prototype, "getClientRects");
});

function getEditorView(wrapper: VueWrapper): EditorView {
  const editorElement = wrapper.get(".cm-editor").element;
  if (!(editorElement instanceof HTMLElement)) {
    throw new Error("expected CodeMirror editor element");
  }

  const view = EditorView.findFromDOM(editorElement);
  if (!view) {
    throw new Error("expected an initialized EditorView");
  }

  return view;
}

function token(wrapper: VueWrapper, text: string): HTMLElement {
  const match = wrapper
    .findAll(".cm-content span")
    .map((candidate) => candidate.element)
    .find(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.textContent === text,
    );

  if (!match) {
    throw new Error(`expected highlighted token: ${text}`);
  }

  return match;
}

function styleFixture(view: EditorView, className: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  view.dom.append(element);
  return element;
}

function styleRulesContaining(text: string): string[] {
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((rule) => rule.includes(text));
}

describe("VimForge CodeMirror theme", () => {
  it("applies the approved editor surface and syntax palette", async () => {
    const wrapper = mount(VimEditor, {
      props: {
        initialContent: [
          "// greeting target",
          "function setGreeting(greeting: string) {",
          "  const count = 1;",
          "  return greeting + 'hello';",
          "}",
        ].join("\n"),
        initialCursor: { line: 1, column: 9 },
        language: "typescript",
        showLineNumbers: true,
        showKeypresses: true,
        autoFocus: true,
      },
      attachTo: document.body,
    });
    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find(".cm-editor").exists()).toBe(true);
    });
    await vi.waitFor(() => {
      expect(
        wrapper
          .findAll(".cm-content span")
          .some((candidate) => candidate.text() === "'hello'"),
      ).toBe(true);
    });

    try {
      const view = getEditorView(wrapper);

      expect(getComputedStyle(view.dom).backgroundColor).toBe("rgb(23, 27, 35)");
      expect(getComputedStyle(view.dom).color).toBe("rgb(216, 222, 233)");
      expect(getComputedStyle(token(wrapper, "// greeting target")).color).toBe(
        "rgb(111, 133, 130)",
      );
      expect(getComputedStyle(token(wrapper, "function")).color).toBe(
        "rgb(120, 220, 202)",
      );
      expect(getComputedStyle(token(wrapper, "setGreeting")).color).toBe(
        "rgb(122, 162, 247)",
      );
      expect(getComputedStyle(token(wrapper, "'hello'")).color).toBe(
        "rgb(166, 227, 91)",
      );
      expect(getComputedStyle(wrapper.get(".cm-gutters").element).color).toBe(
        "rgb(124, 128, 136)",
      );
      const activeLine = styleFixture(view, "cm-activeLine");
      const activeLineGutter = styleFixture(view, "cm-activeLineGutter");
      const thinCursor = styleFixture(view, "cm-cursor");
      const fatCursor = styleFixture(view, "cm-fat-cursor");
      const selection = styleFixture(view, "cm-selectionBackground");
      view.dom.classList.add("cm-focused");

      expect(getComputedStyle(activeLine).backgroundColor).toBe(
        "rgba(255, 255, 255, 0.035)",
      );
      expect(getComputedStyle(activeLineGutter).color).toBe(
        "rgb(237, 240, 245)",
      );
      expect(getComputedStyle(thinCursor).borderLeftColor).toBe(
        "rgb(69, 214, 176)",
      );
      expect(fatCursor.classList).toContain("cm-fat-cursor");
      expect(styleRulesContaining(".cm-fat-cursor")).toContainEqual(
        expect.stringContaining("background: #45d6b0 !important"),
      );
      expect(getComputedStyle(selection).backgroundColor).toBe(
        "rgba(69, 214, 176, 0.24)",
      );
    } finally {
      wrapper.unmount();
    }
  });
});
