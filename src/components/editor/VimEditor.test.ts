import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import {
  afterEach,
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import type { NormalizedAction } from "../../types";
import VimEditor from "./VimEditor.vue";
import {
  orderEditorExtensions,
  type VimEditorEmits,
  type VimEditorProps,
} from "./editor-types";

const defaultProps: VimEditorProps = {
  initialContent: "const value = 1;\nreturn value;",
  initialCursor: { line: 1, column: 3 },
  language: "plaintext",
  showLineNumbers: true,
  showKeypresses: true,
};

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

async function mountEditor() {
  const wrapper = mount(VimEditor, {
    props: defaultProps,
  });
  await flushPromises();
  return wrapper;
}

function getEditorView(wrapper: VueWrapper) {
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VimEditor contracts", () => {
  it("exposes the specified props and emits types", () => {
    expectTypeOf<VimEditorProps["language"]>().toEqualTypeOf<
      "csharp" | "typescript" | "javascript" | "json" | "html" | "css" | "sql" | "markdown" | "plaintext"
    >();
    expectTypeOf<VimEditorEmits["actionRecorded"]>().toEqualTypeOf<
      [action: NormalizedAction]
    >();
  });

  it("orders the Vim extension before all remaining extensions", () => {
    const vimExtension = EditorState.readOnly.of(false);
    const otherExtension = EditorView.editable.of(true);

    const extensions = orderEditorExtensions(vimExtension, [otherExtension]);

    expect(extensions).toEqual([vimExtension, otherExtension]);
  });
});

describe("VimEditor", () => {
  it("initializes the document and cursor before emitting editorReady", async () => {
    const wrapper = await mountEditor();
    const view = getEditorView(wrapper);
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);

    expect(view.state.doc.toString()).toBe(defaultProps.initialContent);
    expect({
      line: cursorLine.number - 1,
      column: view.state.selection.main.head - cursorLine.from,
    }).toEqual(defaultProps.initialCursor);
    expect(wrapper.emitted("editorReady")).toHaveLength(1);

    wrapper.unmount();
  });

  it("emits content and cursor changes from real editor transactions", async () => {
    const wrapper = await mountEditor();
    const view = getEditorView(wrapper);

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: "alpha\nbeta",
      },
    });
    view.dispatch({
      selection: { anchor: 8 },
    });

    expect(wrapper.emitted("contentChanged")?.at(-1)).toEqual([
      "alpha\nbeta",
    ]);
    expect(wrapper.emitted("cursorChanged")?.at(-1)).toEqual([
      { line: 1, column: 2 },
    ]);

    wrapper.unmount();
  });

  it("destroys the EditorView when unmounted", async () => {
    const destroySpy = vi.spyOn(EditorView.prototype, "destroy");
    const wrapper = await mountEditor();

    wrapper.unmount();

    expect(destroySpy).toHaveBeenCalledOnce();
  });
});
