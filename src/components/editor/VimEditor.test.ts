import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM, Vim } from "@replit/codemirror-vim";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import {
  afterEach,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

const { watchStopSpies } = vi.hoisted(() => ({
  watchStopSpies: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return {
    ...actual,
    watch: vi.fn((...args: Parameters<typeof actual.watch>) => {
      const stop = actual.watch(...args);
      const stopSpy = vi.fn(stop);
      watchStopSpies.push(stopSpy);
      return stopSpy;
    }),
  };
});

import type { CursorMatchRule, NormalizedAction } from "../../types";
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

async function mountEditor(attachTo?: HTMLElement) {
  const wrapper = mount(VimEditor, {
    props: defaultProps,
    ...(attachTo ? { attachTo } : {}),
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

beforeEach(() => {
  watchStopSpies.length = 0;
});

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
    expectTypeOf<VimEditorEmits["keyPressed"]>().toEqualTypeOf<
      [display: string]
    >();
    expectTypeOf<VimEditorProps["cursorTarget"]>().toEqualTypeOf<
      CursorMatchRule | undefined
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

  it("autofocuses an editable view without moving its initial cursor", async () => {
    const wrapper = mount(VimEditor, {
      props: {
        ...defaultProps,
        autoFocus: true,
      },
      attachTo: document.body,
    });
    await flushPromises();

    try {
      const view = getEditorView(wrapper);
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);

      expect(document.activeElement).toBe(view.contentDOM);
      expect({
        line: cursorLine.number - 1,
        column: view.state.selection.main.head - cursorLine.from,
      }).toEqual(defaultProps.initialCursor);
    } finally {
      wrapper.unmount();
    }
  });

  it("does not autofocus a readonly view", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const wrapper = mount(VimEditor, {
      props: {
        ...defaultProps,
        autoFocus: true,
        readOnly: true,
      },
      attachTo: document.body,
    });
    await flushPromises();

    try {
      expect(document.activeElement).toBe(outside);
    } finally {
      wrapper.unmount();
      outside.remove();
    }
  });

  it("becomes read-only reactively when the readOnly prop changes after mount", async () => {
    const wrapper = await mountEditor();
    const view = getEditorView(wrapper);

    expect(view.state.readOnly).toBe(false);
    expect(view.contentDOM.getAttribute("contenteditable")).not.toBe("false");

    await wrapper.setProps({ readOnly: true });

    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");

    await wrapper.setProps({ readOnly: false });

    expect(view.state.readOnly).toBe(false);
    expect(view.contentDOM.getAttribute("contenteditable")).not.toBe("false");

    wrapper.unmount();
  });

  it("stops the readOnly watcher on unmount instead of leaking it", async () => {
    const wrapper = await mountEditor();

    expect(watchStopSpies).toHaveLength(1);
    const [stopSpy] = watchStopSpies;

    wrapper.unmount();

    expect(stopSpy).toHaveBeenCalledTimes(1);
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

  it("renders the configured cursor target without moving the initial cursor", async () => {
    const target: CursorMatchRule = {
      type: "exact",
      line: 0,
      column: 1,
    };
    const wrapper = mount(VimEditor, {
      props: {
        ...defaultProps,
        cursorTarget: target,
      },
      attachTo: document.body,
    });
    await flushPromises();

    try {
      const view = getEditorView(wrapper);
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);

      expect(wrapper.find(".cm-cursor-target").text()).toBe("o");
      expect({
        line: cursorLine.number - 1,
        column: view.state.selection.main.head - cursorLine.from,
      }).toEqual(defaultProps.initialCursor);
    } finally {
      wrapper.unmount();
    }
  });

  it("destroys the EditorView when unmounted", async () => {
    const destroySpy = vi.spyOn(EditorView.prototype, "destroy");
    const wrapper = await mountEditor();

    wrapper.unmount();

    expect(destroySpy).toHaveBeenCalledOnce();
  });

  it("emits mode changes from the real Vim runtime", async () => {
    const wrapper = await mountEditor();
    const view = getEditorView(wrapper);
    const codeMirror = getCM(view);
    if (!codeMirror) {
      throw new Error("expected the Vim bridge");
    }

    Vim.handleKey(codeMirror, "i", "user");

    expect(wrapper.emitted("modeChanged")?.at(-1)).toEqual(["insert"]);

    Vim.handleKey(codeMirror, "<Esc>", "user");

    expect(wrapper.emitted("modeChanged")?.at(-1)).toEqual(["normal"]);
    wrapper.unmount();
  });

  it("emits normalized actions from real Vim keyboard input", async () => {
    const wrapper = await mountEditor(document.body);
    const view = getEditorView(wrapper);
    const codeMirror = getCM(view);
    if (!codeMirror) {
      throw new Error("expected the Vim bridge");
    }
    view.contentDOM.focus();

    for (const key of ["i", "x", "Escape"]) {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key,
        }),
      );
      Vim.handleKey(codeMirror, key === "Escape" ? "<Esc>" : key, "user");
      if (key === "x") {
        const head = view.state.selection.main.head;
        view.dispatch({
          changes: { from: head, insert: "x" },
          selection: { anchor: head + 1 },
        });
      }
      await nextTick();
    }

    expect(wrapper.emitted("actionRecorded")).toEqual([
      [{ type: "vim_command", command: "i" }],
      [{ type: "insert_text", text: "x", textLength: 1 }],
      [{ type: "mode_change", mode: "normal" }],
    ]);

    wrapper.unmount();
  });

  it("emits exactly one keyPressed for one dispatched keydown", async () => {
    const wrapper = await mountEditor(document.body);
    const view = getEditorView(wrapper);
    view.contentDOM.focus();

    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "d",
      }),
    );
    await nextTick();

    expect(wrapper.emitted("keyPressed")).toEqual([["d"]]);

    wrapper.unmount();
  });

  it("does not emit keyPressed for a read-only editor", async () => {
    const wrapper = mount(VimEditor, {
      props: { ...defaultProps, readOnly: true },
      attachTo: document.body,
    });
    await flushPromises();
    const view = getEditorView(wrapper);
    view.contentDOM.focus();

    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "d",
      }),
    );
    await nextTick();

    expect(wrapper.emitted("keyPressed")).toBeUndefined();

    wrapper.unmount();
  });

  it("cleans up the Vim command listener when unmounted", async () => {
    const wrapper = await mountEditor();
    const view = getEditorView(wrapper);
    const codeMirror = getCM(view);
    if (!codeMirror) {
      throw new Error("expected the Vim bridge");
    }

    wrapper.unmount();
    codeMirror.signal("vim-command-done", undefined);

    expect(wrapper.emitted("actionRecorded")).toBeUndefined();
  });

  it("shows a notice only while the editor is unfocused", async () => {
    const wrapper = await mountEditor(document.body);

    try {
      const view = getEditorView(wrapper);

      expect(wrapper.text()).toContain("點擊編輯器以繼續");

      view.contentDOM.focus();
      await nextTick();
      expect(wrapper.text()).not.toContain("點擊編輯器以繼續");

      view.contentDOM.blur();
      await nextTick();
      expect(wrapper.text()).toContain("點擊編輯器以繼續");
      expect(wrapper.get(".editor-focus-notice").classes()).toContain(
        "editor-focus-notice-overlay",
      );
    } finally {
      wrapper.unmount();
    }
  });

  it("leaves mode presentation to the practice footer", async () => {
    const wrapper = await mountEditor();

    expect(wrapper.find(".vim-mode-badge").exists()).toBe(false);
    expect(wrapper.find(".vim-editor-status").exists()).toBe(false);

    wrapper.unmount();
  });
});
