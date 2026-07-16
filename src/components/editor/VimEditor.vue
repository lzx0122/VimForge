<script setup lang="ts">
import { minimalSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";
import {
  getCM,
  vim,
  type CodeMirror,
} from "@replit/codemirror-vim";
import { onBeforeUnmount, onMounted, ref } from "vue";

import type { VimMode } from "../../types";
import { createEditorState } from "./create-editor-state";
import EditorFocusNotice from "./EditorFocusNotice.vue";
import {
  orderEditorExtensions,
  type VimEditorEmits,
  type VimEditorProps,
} from "./editor-types";
import { cursorTargetExtension } from "./cursor-target-extension";
import { loadLanguageExtension } from "./language-loader";
import {
  createVimActionRecorder,
  keyboardEventToVimKey,
} from "./vim-action-recorder";
import { vimEditorTheme } from "./vim-editor-theme";

const props = defineProps<VimEditorProps>();
const emit = defineEmits<VimEditorEmits>();

const editorHost = ref<HTMLElement | null>(null);
const currentMode = ref<VimMode>("normal");
const isFocused = ref(false);
let editorView: EditorView | null = null;
let vimBridge: CodeMirror | null = null;
let vimModeHandler: ((event: unknown) => void) | null = null;
let vimCommandDoneHandler: (() => void) | null = null;
let disposed = false;
const actionRecorder = createVimActionRecorder((action) => {
  emit("actionRecorded", action);
});

function cursorPosition(update: ViewUpdate) {
  const head = update.state.selection.main.head;
  const line = update.state.doc.lineAt(head);

  return {
    line: line.number - 1,
    column: head - line.from,
  };
}

function modeFromEvent(event: unknown): VimMode | null {
  if (typeof event !== "object" || event === null || !("mode" in event)) {
    return null;
  }

  const { mode } = event;
  if (
    mode === "normal" ||
    mode === "insert" ||
    mode === "visual" ||
    mode === "replace" ||
    mode === "command"
  ) {
    return mode;
  }

  return null;
}

onMounted(async () => {
  const languageExtension = await loadLanguageExtension(props.language);

  if (disposed || !editorHost.value) {
    return;
  }

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      emit("contentChanged", update.state.doc.toString());
      if (currentMode.value === "insert" || currentMode.value === "replace") {
        let insertedText = "";
        update.changes.iterChanges(
          (_fromA, _toA, _fromB, _toB, inserted) => {
            insertedText += inserted.toString();
          },
        );
        actionRecorder.recordInsertedText(insertedText);
      }
    }
    if (update.selectionSet) {
      emit("cursorChanged", cursorPosition(update));
    }
  });
  const focusHandlers = EditorView.domEventHandlers({
    focus: () => {
      isFocused.value = true;
      return false;
    },
    blur: () => {
      isFocused.value = false;
      return false;
    },
  });
  const keyObservers = EditorView.domEventObservers({
    keydown: (event) => {
      actionRecorder.recordKey(
        keyboardEventToVimKey(event),
        currentMode.value,
      );
    },
  });
  const remainingExtensions: Extension[] = [
    minimalSetup,
    ...(props.showLineNumbers ? [lineNumbers()] : []),
    languageExtension,
    ...vimEditorTheme,
    ...(props.cursorTarget && props.cursorTarget.type !== "ignore"
      ? [cursorTargetExtension(props.cursorTarget)]
      : []),
    EditorState.readOnly.of(props.readOnly ?? false),
    EditorView.editable.of(!(props.readOnly ?? false)),
    focusHandlers,
    keyObservers,
    updateListener,
  ];
  const state = createEditorState({
    initialContent: props.initialContent,
    initialCursor: props.initialCursor,
    extensions: orderEditorExtensions(vim(), remainingExtensions),
  });

  const view = new EditorView({
    parent: editorHost.value,
    state,
  });
  editorView = view;
  vimBridge = getCM(view);
  if (vimBridge) {
    vimModeHandler = (event: unknown) => {
      const mode = modeFromEvent(event);
      if (!mode) {
        return;
      }

      currentMode.value = mode;
      emit("modeChanged", mode);
    };
    vimBridge.on("vim-mode-change", vimModeHandler);
    vimCommandDoneHandler = () => {
      actionRecorder.finishCommand();
    };
    vimBridge.on("vim-command-done", vimCommandDoneHandler);
  }
  if (props.autoFocus && !(props.readOnly ?? false)) {
    view.focus();
  }
  emit("modeChanged", currentMode.value);
  emit("editorReady");
});

onBeforeUnmount(() => {
  disposed = true;
  if (vimBridge && vimModeHandler) {
    vimBridge.off("vim-mode-change", vimModeHandler);
  }
  if (vimBridge && vimCommandDoneHandler) {
    vimBridge.off("vim-command-done", vimCommandDoneHandler);
  }
  actionRecorder.clear();
  vimModeHandler = null;
  vimCommandDoneHandler = null;
  vimBridge = null;
  editorView?.destroy();
  editorView = null;
});
</script>

<template>
  <section class="vim-editor-shell">
    <EditorFocusNotice
      class="editor-focus-notice-overlay"
      :is-focused="isFocused"
    />
    <div
      ref="editorHost"
      class="vim-editor"
      :data-show-keypresses="showKeypresses"
    />
  </section>
</template>

<style scoped>
.vim-editor-shell {
  position: relative;
}

.editor-focus-notice-overlay {
  position: absolute;
  z-index: 3;
  top: 0.65rem;
  right: 0.75rem;
  padding: 0.25rem 0.45rem;
  border-radius: 0.35rem;
  background: rgb(23 27 35 / 88%);
  pointer-events: none;
}
</style>
