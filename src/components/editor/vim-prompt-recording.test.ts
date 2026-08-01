import { EditorView } from "@codemirror/view";
import { getCM, Vim } from "@replit/codemirror-vim";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

async function mountEditor(initialContent: string) {
  const wrapper = mount(VimEditor, {
    props: {
      initialContent,
      initialCursor: { line: 0, column: 0 },
      language: "plaintext",
      showLineNumbers: true,
      showKeypresses: true,
    },
    attachTo: document.body,
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

async function openPrompt(
  wrapper: VueWrapper,
  key: "/" | "?" | ":",
) {
  const view = getEditorView(wrapper);
  const codeMirror = getCM(view);
  if (!codeMirror) {
    throw new Error("expected the Vim bridge");
  }

  view.contentDOM.focus();
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
    }),
  );
  await nextTick();

  // The real EditorView handler should open the prompt. The explicit call is
  // only a jsdom fallback, matching the existing VimEditor runtime tests.
  if (!wrapper.find(".cm-vim-panel input").exists()) {
    Vim.handleKey(codeMirror, key, "user");
    await nextTick();
  }

  const input = wrapper.get(".cm-vim-panel input").element;
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("expected Vim prompt input");
  }
  return input;
}

function submitPrompt(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      // CodeMirror Vim's dialog submission checks the legacy `keyCode`
      // field, which a constructed KeyboardEvent does not derive from
      // `key` automatically.
      keyCode: 13,
      which: 13,
    } as KeyboardEventInit),
  );
}

function pressPromptKey(input: HTMLInputElement, key: string) {
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
    }),
  );
}

describe("Vim prompt action recording", () => {
  it("keeps ':' as the literal target of f: without opening an Ex prompt", async () => {
    const wrapper = await mountEditor("key: value");
    try {
      const view = getEditorView(wrapper);
      const codeMirror = getCM(view);
      if (!codeMirror) {
        throw new Error("expected the Vim bridge");
      }
      view.contentDOM.focus();

      // A single real dispatch is enough to drive CodeMirror Vim's own
      // keydown handling; also calling Vim.handleKey would process each
      // key twice and corrupt this two-key "f:" sequence.
      for (const key of ["f", ":"]) {
        view.contentDOM.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key,
          }),
        );
        await nextTick();
      }

      expect(wrapper.find(".cm-vim-panel input").exists()).toBe(false);
      expect(wrapper.emitted("actionRecorded")).toEqual([
        [{ type: "vim_command", command: "f:" }],
      ]);
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps ':' as the literal target of T: without opening an Ex prompt", async () => {
    const wrapper = await mountEditor("key: value");
    try {
      const view = getEditorView(wrapper);
      const codeMirror = getCM(view);
      if (!codeMirror) {
        throw new Error("expected the Vim bridge");
      }
      view.dispatch({ selection: { anchor: view.state.doc.length - 1 } });
      view.contentDOM.focus();

      // A single real dispatch is enough to drive CodeMirror Vim's own
      // keydown handling; also calling Vim.handleKey would process each
      // key twice and corrupt this two-key "T:" sequence.
      for (const key of ["T", ":"]) {
        view.contentDOM.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key,
          }),
        );
        await nextTick();
      }

      expect(wrapper.find(".cm-vim-panel input").exists()).toBe(false);
      expect(wrapper.emitted("actionRecorded")).toEqual([
        [{ type: "vim_command", command: "T:" }],
      ]);
    } finally {
      wrapper.unmount();
    }
  });

  it("records a real / search as a semantic search action", async () => {
    const wrapper = await mountEditor("alpha\nProcessAsync\nomega");
    try {
      const input = await openPrompt(wrapper, "/");
      submitPrompt(input, "ProcessAsync");
      await nextTick();

      expect(wrapper.emitted("actionRecorded")).toEqual([
        [
          {
            type: "search",
            query: "ProcessAsync",
            direction: "forward",
          },
        ],
      ]);
    } finally {
      wrapper.unmount();
    }
  });

  it("records :s///gc and its y confirmations without Enter", async () => {
    const wrapper = await mountEditor("debug debug");
    try {
      const input = await openPrompt(wrapper, ":");
      submitPrompt(input, "%s/debug/trace/gc");
      await nextTick();

      let confirmInput = wrapper.get(".cm-vim-panel input").element;
      if (!(confirmInput instanceof HTMLInputElement)) {
        throw new Error("expected substitute confirmation input");
      }
      pressPromptKey(confirmInput, "y");
      await nextTick();

      confirmInput = wrapper.get(".cm-vim-panel input").element;
      if (!(confirmInput instanceof HTMLInputElement)) {
        throw new Error("expected substitute confirmation input");
      }
      pressPromptKey(confirmInput, "y");
      await nextTick();

      expect(wrapper.emitted("actionRecorded")).toEqual([
        [{ type: "vim_command", command: ":%s/debug/trace/gc<Enter>" }],
        [{ type: "vim_command", command: "y" }],
        [{ type: "vim_command", command: "y" }],
      ]);
      expect(getEditorView(wrapper).state.doc.toString()).toBe("trace trace");
    } finally {
      wrapper.unmount();
    }
  });

  it("normalizes the Visual Ex auto-range to learner-entered input", async () => {
    const wrapper = await mountEditor("old one\nold two\nold three");
    try {
      const view = getEditorView(wrapper);
      const codeMirror = getCM(view);
      if (!codeMirror) {
        throw new Error("expected the Vim bridge");
      }
      view.contentDOM.focus();

      // A single real dispatch is enough to drive CodeMirror Vim's own
      // keydown handling; also calling Vim.handleKey would process each
      // key twice, which cancels Visual mode right back out.
      for (const key of ["V", "j"]) {
        view.contentDOM.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key,
          }),
        );
        await nextTick();
      }
      // jsdom has no real layout engine, so CodeMirror's line-height-based
      // vertical motion cannot resolve "j" to the next visual line here.
      // Correct the selection to what real "j" would have produced (line 0
      // through the end of line 1); this preserves vim's visualMode and its
      // '<,'> marks, which are derived from the live CM6 selection.
      view.dispatch({ selection: { anchor: 0, head: 15 } });

      const input = await openPrompt(wrapper, ":");
      expect(input.value).toBe("'<,'>");
      input.value += "s/old/new/g";
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          // CodeMirror Vim's dialog submission checks the legacy `keyCode`
          // field, which a constructed KeyboardEvent does not derive from
          // `key` automatically.
          keyCode: 13,
          which: 13,
        } as KeyboardEventInit),
      );
      await nextTick();

      expect(wrapper.emitted("actionRecorded")).toEqual([
        [{ type: "vim_command", command: "V" }],
        [{ type: "vim_command", command: "j" }],
        [{ type: "vim_command", command: ":s/old/new/g<Enter>" }],
      ]);
      expect(getEditorView(wrapper).state.doc.toString()).toBe(
        "new one\nnew two\nold three",
      );
    } finally {
      wrapper.unmount();
    }
  });
});
