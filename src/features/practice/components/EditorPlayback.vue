<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

const props = withDefaults(
  defineProps<{
    command: string;
    stepDelayMs?: number;
  }>(),
  {
    stepDelayMs: 300,
  },
);

const emit = defineEmits<{
  playbackComplete: [];
}>();

const commandTokens = computed(
  () => props.command.match(/<[^>]+>|./gu) ?? [],
);
const activeIndex = ref(-1);
const isPlaying = ref(false);
const hasPlayed = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function finishPlayback() {
  clearTimer();
  isPlaying.value = false;
  hasPlayed.value = true;
  emit("playbackComplete");
}

function advancePlayback() {
  const nextIndex = activeIndex.value + 1;
  if (nextIndex >= commandTokens.value.length) {
    finishPlayback();
    return;
  }

  activeIndex.value = nextIndex;
  timer = setTimeout(advancePlayback, props.stepDelayMs);
}

function startPlayback() {
  if (isPlaying.value) {
    return;
  }

  clearTimer();
  activeIndex.value = commandTokens.value.length > 0 ? 0 : -1;
  isPlaying.value = true;

  if (commandTokens.value.length === 0) {
    finishPlayback();
    return;
  }

  timer = setTimeout(advancePlayback, props.stepDelayMs);
}

onBeforeUnmount(clearTimer);
</script>

<template>
  <div class="editor-playback">
    <p class="editor-playback-label">
      完整操作
    </p>
    <div
      class="editor-playback-command"
      aria-live="polite"
      :aria-label="`完整操作：${command}`"
    >
      <kbd
        v-for="(token, index) in commandTokens"
        :key="`${token}-${index}`"
        :class="{ 'is-active': isPlaying && index === activeIndex }"
        :aria-current="isPlaying && index === activeIndex ? 'step' : undefined"
      >{{ token }}</kbd>
    </div>
    <button
      type="button"
      class="editor-playback-button"
      data-testid="start-playback"
      :disabled="isPlaying"
      @click="startPlayback"
    >
      {{ isPlaying ? "播放中…" : hasPlayed ? "再次播放" : "播放操作" }}
    </button>
  </div>
</template>

<style scoped>
.editor-playback {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #4b5563;
  border-radius: 0.75rem;
  background: #111827;
}

.editor-playback-label {
  margin: 0;
  color: #d1d5db;
  font-size: 0.85rem;
  font-weight: 800;
}

.editor-playback-command {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

kbd {
  min-width: 2rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid #6b7280;
  border-radius: 0.35rem;
  color: #f9fafb;
  background: #1f2937;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-align: center;
  transition: border-color 120ms ease, background-color 120ms ease;
}

kbd.is-active {
  border-color: #4ade80;
  color: #052e16;
  background: #4ade80;
}

.editor-playback-button {
  justify-self: start;
  padding: 0.55rem 0.8rem;
  border: 0;
  border-radius: 0.5rem;
  color: #052e16;
  background: #86efac;
  cursor: pointer;
  font-weight: 800;
}

.editor-playback-button:disabled {
  cursor: wait;
  opacity: 0.65;
}
</style>
