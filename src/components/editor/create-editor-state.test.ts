import { history, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { getCM, vim, Vim } from "@replit/codemirror-vim";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import VimEditor from "./VimEditor.vue";
import { createEditorState } from "./create-editor-state";

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

afterEach(() => {
  Vim.resetVimGlobalState_();
  vi.restoreAllMocks();
});

describe("createEditorState", () => {
  it("initializes content and a clamped cursor in a fresh state", () => {
    const state = createEditorState({
      initialContent: "alpha\nbeta",
      initialCursor: { line: 1, column: 99 },
      extensions: [],
    });

    expect(state.doc.toString()).toBe("alpha\nbeta");
    expect(state.selection.main.head).toBe(10);
  });

  it("does not carry undo history into the next state", () => {
    const options = {
      initialContent: "alpha",
      initialCursor: { line: 0, column: 0 },
      extensions: [history()],
    } as const;
    const changedState = createEditorState(options).update({
      changes: { from: 0, insert: "x" },
    }).state;

    expect(undoDepth(changedState)).toBe(1);

    const nextState = createEditorState(options);

    expect(undoDepth(nextState)).toBe(0);
  });

  it("clears search, Visual mode, and a pending operator for the next view", () => {
    const options = {
      initialContent: "alpha beta alpha",
      initialCursor: { line: 0, column: 0 },
      extensions: [vim()],
    } as const;
    const firstView = new EditorView({ state: createEditorState(options) });
    let nextView: EditorView | null = null;

    try {
      const firstBridge = getCM(firstView);
      if (!firstBridge?.state.vim) {
        throw new Error("expected the first Vim bridge");
      }

      Vim.handleKey(firstBridge, "v", "user");
      expect(firstBridge.state.vim.visualMode).toBe(true);

      Vim.handleKey(firstBridge, "<Esc>", "user");
      Vim.handleKey(firstBridge, "d", "user");
      expect(firstBridge.state.vim.inputState.operator).toBe("delete");

      Vim.handleKey(firstBridge, "<Esc>", "user");
      Vim.handleKey(firstBridge, "*", "user");
      expect(
        Vim.getVimGlobalState_().searchHistoryController.historyBuffer,
      ).not.toHaveLength(0);

      nextView = new EditorView({ state: createEditorState(options) });
      const nextBridge = getCM(nextView);
      if (!nextBridge?.state.vim) {
        throw new Error("expected the next Vim bridge");
      }

      expect(nextBridge.state.vim.visualMode).toBe(false);
      expect(nextBridge.state.vim.inputState.operator).toBeNull();
      expect(
        Vim.getVimGlobalState_().searchHistoryController.historyBuffer,
      ).toHaveLength(0);
    } finally {
      nextView?.destroy();
      firstView.destroy();
    }
  });

  it("destroys the old view when the keyed exercise ID changes", async () => {
    const exerciseId = ref("exercise-one");
    const destroySpy = vi.spyOn(EditorView.prototype, "destroy");
    const Harness = defineComponent({
      components: { VimEditor },
      setup() {
        return { exerciseId };
      },
      template: `
        <VimEditor
          :key="exerciseId"
          initial-content="alpha"
          :initial-cursor="{ line: 0, column: 0 }"
          language="plaintext"
          :show-line-numbers="true"
          :show-keypresses="true"
        />
      `,
    });
    const wrapper = mount(Harness);

    try {
      await flushPromises();
      const firstEditor = wrapper.get(".cm-editor").element;

      exerciseId.value = "exercise-two";
      await nextTick();
      await flushPromises();

      expect(destroySpy).toHaveBeenCalledOnce();
      expect(wrapper.get(".cm-editor").element).not.toBe(firstEditor);
    } finally {
      wrapper.unmount();
    }
  });
});
