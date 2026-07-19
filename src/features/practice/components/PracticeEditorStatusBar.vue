<script setup lang="ts">
import { computed } from "vue";

import VimModeBadge from "../../../components/editor/VimModeBadge.vue";
import type { VimMode } from "../../../types";

interface Props {
  mode: VimMode;
  elapsedSeconds: number;
  restartDisabled: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  requestRestart: [];
}>();

function formatElapsedTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

const formattedElapsedTime = computed(() =>
  formatElapsedTime(props.elapsedSeconds),
);
</script>

<template>
  <footer
    class="practice-editor-status-bar"
    :data-mode="mode"
  >
    <div class="practice-editor-mode-segment">
      <VimModeBadge :mode="mode" />
    </div>

    <div class="practice-editor-controls">
      <span
        class="practice-editor-timer"
        title="已練習時間"
      >
        <span aria-hidden="true">◷</span>
        <output aria-label="已練習時間">{{ formattedElapsedTime }}</output>
      </span>

      <button
        type="button"
        class="practice-editor-restart"
        aria-label="重新開始本題"
        :disabled="restartDisabled"
        @click="emit('requestRestart')"
      >
        <span aria-hidden="true">↻</span>
        restart
      </button>
    </div>
  </footer>
</template>

<style scoped>
.practice-editor-status-bar {
  --mode-background: #7aa2f7;
  --mode-foreground: #111722;

  display: flex;
  min-height: 3rem;
  align-items: stretch;
  justify-content: space-between;
  overflow: hidden;
  border-top: 1px solid rgb(216 222 233 / 12%);
  color: #d8dee9;
  background: #171b23;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.practice-editor-status-bar[data-mode="insert"] {
  --mode-background: #78dcca;
}

.practice-editor-status-bar[data-mode="visual"] {
  --mode-background: #c678dd;
}

.practice-editor-status-bar[data-mode="replace"] {
  --mode-background: #ff8f7b;
}

.practice-editor-status-bar[data-mode="command"] {
  --mode-background: #e7b75b;
}

.practice-editor-mode-segment {
  display: flex;
  min-width: 8.5rem;
  align-items: center;
  padding: 0.5rem 2.15rem 0.5rem 1rem;
  background: var(--mode-background);
  clip-path: polygon(0 0, calc(100% - 1.35rem) 0, 100% 50%, calc(100% - 1.35rem) 100%, 0 100%);
}

.practice-editor-mode-segment :deep(.vim-mode-badge) {
  padding: 0;
  border: 0;
  color: var(--mode-foreground);
  font-size: 0.9rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.practice-editor-controls,
.practice-editor-timer,
.practice-editor-restart {
  display: flex;
  align-items: center;
}

.practice-editor-controls {
  min-width: 0;
  gap: 1.25rem;
  padding: 0.45rem 1rem;
}

.practice-editor-timer,
.practice-editor-restart {
  gap: 0.45rem;
}

.practice-editor-timer {
  white-space: nowrap;
  color: #d8dee9;
  font-variant-numeric: tabular-nums;
}

.practice-editor-restart {
  padding: 0.35rem 0.45rem;
  border: 0;
  border-radius: 0.35rem;
  color: #c7cedb;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.practice-editor-restart:hover:not(:disabled) {
  color: #ffffff;
  background: rgb(216 222 233 / 8%);
}

.practice-editor-restart:focus-visible {
  outline: 2px solid #45d6b0;
  outline-offset: 2px;
}

.practice-editor-restart:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 40rem) {
  .practice-editor-mode-segment {
    min-width: 7rem;
    padding-right: 1.75rem;
    padding-left: 0.75rem;
  }

  .practice-editor-controls {
    gap: 0.55rem;
    padding-right: 0.6rem;
    padding-left: 0.4rem;
  }

  .practice-editor-restart {
    font-size: 0.8rem;
  }
}
</style>
