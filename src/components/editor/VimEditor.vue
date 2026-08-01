<script setup lang="ts">
import { minimalSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
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
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { VimMode } from "../../types";
import { createEditorState } from "./create-editor-state";
import EditorFocusNotice from "./EditorFocusNotice.vue";
import {
  orderEditorExtensions,
  type VimEditorEmits,
  type VimEditorProps,
} from "./editor-types";
import { cursorTargetExtension } from "./cursor-target-extension";
import { formatKeyboardEvent } from "./keyboard-display";
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
const readOnlyCompartment = new Compartment();

type VimPromptPrefix = "/" | "?" | ":";
type VimPromptDecision = "y" | "n" | "a" | "l" | "q";

function readOnlyExtensions(readOnly: boolean): Extension[] {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
  ];
}
let vimModeHandler: ((event: unknown) => void) | null = null;
let vimCommandDoneHandler: (() => void) | null = null;
let vimDialogHandler: (() => void) | null = null;
let stopReadOnlyWatch: (() => void) | null = null;
let disposed = false;
let pendingPromptPrefix: VimPromptPrefix | null = null;
let promptInput: HTMLInputElement | null = null;
let promptKeydownHandler: ((event: KeyboardEvent) => void) | null = null;

const actionRecorder = createVimActionRecorder((action) => {
  emit("actionRecorded", action);
});

function isPromptPrefix(
  key: string | null,
  mode: VimMode,
): key is VimPromptPrefix {
  return (
    (mode === "normal" || mode === "visual") &&
    (key === "/" || key === "?" || key === ":")
  );
}

function isPromptDecision(key: string | null): key is VimPromptDecision {
  return key === "y" || key === "n" || key === "a" || key === "l" || key === "q";
}

function detachPromptInputListener(): void {
  if (promptInput && promptKeydownHandler) {
    promptInput.removeEventListener("keydown", promptKeydownHandler, true);
  }
  promptInput = null;
  promptKeydownHandler = null;
}

function attachPromptInputListener(
  promptPrefix: VimPromptPrefix | null,
): void {
  detachPromptInputListener();

  const dialog = vimBridge?.state.dialog;
  if (!(dialog instanceof HTMLElement)) {
    return;
  }

  const input = dialog.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const promptInitialValue = input.value;
  promptInput = input;
  promptKeydownHandler = (event: KeyboardEvent) => {
    if (!(props.readOnly ?? false)) {
      const display = formatKeyboardEvent(event);
      if (display !== null) {
        emit("keyPressed", display);
      }
    }

    // Capture runs before CodeMirror Vim's own prompt handler. That is
    // important for Enter: the runtime closes the prompt and may emit
    // vim-command-done during the same keydown.
    if (promptPrefix !== null) {
      if (event.key === "Enter") {
        actionRecorder.recordPromptSubmission(
          promptPrefix,
          input.value,
          promptInitialValue,
        );
      }
      return;
    }

    // :s///c opens a second prompt without a new / ? : trigger. Record the
    // confirmation choices as exact actions; Enter is not part of this Vim
    // prompt protocol.
    const key = keyboardEventToVimKey(event);
    if (isPromptDecision(key)) {
      actionRecorder.recordPromptDecision(key);
    }
  };
  input.addEventListener("keydown", promptKeydownHandler, true);
}

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
      const vimKey = keyboardEventToVimKey(event);
      actionRecorder.recordKey(vimKey, currentMode.value);
      if (isPromptPrefix(vimKey, currentMode.value)) {
        // This is only a candidate. Characters such as ":" are also valid
        // literal arguments in commands like f:, T:, and r:. A real Vim
        // dialog event below is authoritative about whether this key opened
        // a prompt.
        pendingPromptPrefix = vimKey;
      }

      if (!(props.readOnly ?? false)) {
        const display = formatKeyboardEvent(event);
        if (display !== null) {
          emit("keyPressed", display);
        }
      }
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
    readOnlyCompartment.of(readOnlyExtensions(props.readOnly ?? false)),
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
      // Literal f:/T:/f?/r: commands never open a dialog. Clear any stale
      // candidate once Vim confirms that the command completed normally.
      pendingPromptPrefix = null;
    };
    vimBridge.on("vim-command-done", vimCommandDoneHandler);
    vimDialogHandler = () => {
      const promptPrefix = pendingPromptPrefix;
      const dialogOpened = vimBridge?.state.dialog instanceof HTMLElement;

      if (dialogOpened && promptPrefix !== null) {
        // The dialog event is authoritative: only now do we know that the
        // last / ? : key opened a prompt instead of being a literal argument
        // to commands such as f:, T:, f/, or r?.
        actionRecorder.beginPrompt(promptPrefix);
        pendingPromptPrefix = null;
      }

      // CodeMirror Vim signals "dialog" from showDialog() before openDialog()
      // applies options.value (Visual ':' pre-fills "'<,'>"). Defer one
      // microtask so the prompt input contains its final Vim-owned initial
      // value before we snapshot it for normalization.
      queueMicrotask(() => {
        if (!disposed) {
          attachPromptInputListener(promptPrefix);
        }
      });
    };
    vimBridge.on("dialog", vimDialogHandler);
  }
  if (props.autoFocus && !(props.readOnly ?? false)) {
    view.focus();
  }
  stopReadOnlyWatch = watch(
    () => props.readOnly ?? false,
    (readOnly) => {
      editorView?.dispatch({
        effects: readOnlyCompartment.reconfigure(readOnlyExtensions(readOnly)),
      });
    },
  );
  emit("modeChanged", currentMode.value);
  emit("editorReady");
});

onBeforeUnmount(() => {
  disposed = true;
  stopReadOnlyWatch?.();
  stopReadOnlyWatch = null;
  if (vimBridge && vimModeHandler) {
    vimBridge.off("vim-mode-change", vimModeHandler);
  }
  if (vimBridge && vimCommandDoneHandler) {
    vimBridge.off("vim-command-done", vimCommandDoneHandler);
  }
  if (vimBridge && vimDialogHandler) {
    vimBridge.off("dialog", vimDialogHandler);
  }
  detachPromptInputListener();
  actionRecorder.clear();
  pendingPromptPrefix = null;
  vimModeHandler = null;
  vimCommandDoneHandler = null;
  vimDialogHandler = null;
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
