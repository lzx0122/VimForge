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
import VimModeBadge from "./VimModeBadge.vue";
import {
  orderEditorExtensions,
  type VimEditorEmits,
  type VimEditorProps,
} from "./editor-types";
import { loadLanguageExtension } from "./language-loader";
import { vimEditorTheme } from "./vim-editor-theme";

const props = defineProps<VimEditorProps>();
const emit = defineEmits<VimEditorEmits>();

const editorHost = ref<HTMLElement | null>(null);
const currentMode = ref<VimMode>("normal");
const isFocused = ref(false);
let editorView: EditorView | null = null;
let vimBridge: CodeMirror | null = null;
let vimModeHandler: ((event: unknown) => void) | null = null;
let disposed = false;

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
  const remainingExtensions: Extension[] = [
    minimalSetup,
    ...(props.showLineNumbers ? [lineNumbers()] : []),
    languageExtension,
    ...vimEditorTheme,
    EditorState.readOnly.of(props.readOnly ?? false),
    EditorView.editable.of(!(props.readOnly ?? false)),
    focusHandlers,
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
  vimModeHandler = null;
  vimBridge = null;
  editorView?.destroy();
  editorView = null;
});
</script>

<template>
  <section class="vim-editor-shell">
    <div class="vim-editor-status">
      <VimModeBadge :mode="currentMode" />
      <EditorFocusNotice :is-focused="isFocused" />
    </div>
    <div
      ref="editorHost"
      class="vim-editor"
      :data-show-keypresses="showKeypresses"
    />
  </section>
</template>
