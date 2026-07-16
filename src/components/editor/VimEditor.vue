<script setup lang="ts">
import { minimalSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { onBeforeUnmount, onMounted, ref } from "vue";

import {
  orderEditorExtensions,
  type VimEditorEmits,
  type VimEditorProps,
} from "./editor-types";
import { loadLanguageExtension } from "./language-loader";

const props = defineProps<VimEditorProps>();
const emit = defineEmits<VimEditorEmits>();

const editorHost = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;
let disposed = false;

function cursorOffset(content: string) {
  const lines = content.split("\n");
  const lineIndex = Math.min(
    Math.max(props.initialCursor.line, 0),
    Math.max(lines.length - 1, 0),
  );
  const precedingLength = lines
    .slice(0, lineIndex)
    .reduce((total, line) => total + line.length + 1, 0);
  const lineLength = lines[lineIndex]?.length ?? 0;

  return precedingLength + Math.min(Math.max(props.initialCursor.column, 0), lineLength);
}

function cursorPosition(update: ViewUpdate) {
  const head = update.state.selection.main.head;
  const line = update.state.doc.lineAt(head);

  return {
    line: line.number - 1,
    column: head - line.from,
  };
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
  const remainingExtensions: Extension[] = [
    minimalSetup,
    ...(props.showLineNumbers ? [lineNumbers()] : []),
    languageExtension,
    EditorState.readOnly.of(props.readOnly ?? false),
    EditorView.editable.of(!(props.readOnly ?? false)),
    updateListener,
  ];
  const state = EditorState.create({
    doc: props.initialContent,
    selection: { anchor: cursorOffset(props.initialContent) },
    extensions: orderEditorExtensions(vim(), remainingExtensions),
  });

  editorView = new EditorView({
    parent: editorHost.value,
    state,
  });
  emit("editorReady");
});

onBeforeUnmount(() => {
  disposed = true;
  editorView?.destroy();
  editorView = null;
});
</script>

<template>
  <div
    ref="editorHost"
    class="vim-editor"
    :data-show-keypresses="showKeypresses"
  />
</template>
