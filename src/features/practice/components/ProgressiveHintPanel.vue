<script lang="ts">
export interface ProgressiveHint {
  level: 1 | 2 | 3 | 4;
  content: string;
  commandPreview?: string;
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue";

import type { HintLevel } from "../../../types";

const props = defineProps<{
  hints: readonly ProgressiveHint[];
}>();

const emit = defineEmits<{
  highestLevelChanged: [level: HintLevel];
}>();

const highestLevel = ref<HintLevel>(0);
const orderedHints = computed(() =>
  [...props.hints].sort((left, right) => left.level - right.level),
);
const unlockedHints = computed(() =>
  orderedHints.value.filter((hint) => hint.level <= highestLevel.value),
);
const nextHint = computed(() =>
  orderedHints.value.find(
    (hint) => hint.level === highestLevel.value + 1,
  ),
);
const canRevealNext = computed(() => nextHint.value !== undefined);

function revealNextHint() {
  if (!nextHint.value) {
    return;
  }

  highestLevel.value = nextHint.value.level;
  emit("highestLevelChanged", highestLevel.value);
}

</script>

<template>
  <section
    class="progressive-hint-panel"
    aria-labelledby="progressive-hint-title"
  >
    <header class="progressive-hint-header">
      <div>
        <p class="progressive-hint-eyebrow">
          漸進提示
        </p>
        <h2 id="progressive-hint-title">
          需要一點方向？
        </h2>
      </div>
      <span class="progressive-hint-progress">
        已解鎖 {{ highestLevel }} / 4
      </span>
    </header>

    <button
      v-if="canRevealNext"
      type="button"
      class="progressive-hint-button"
      data-testid="reveal-hint"
      :aria-expanded="highestLevel > 0"
      aria-controls="progressive-hint-list"
      @click="revealNextHint"
    >
      顯示提示 {{ nextHint?.level }}
    </button>

    <ol
      v-if="unlockedHints.length > 0"
      id="progressive-hint-list"
      class="progressive-hint-list"
    >
      <li
        v-for="hint in unlockedHints"
        :key="hint.level"
        class="progressive-hint-item"
        :data-hint-level="hint.level"
      >
        <p class="progressive-hint-level">
          提示 {{ hint.level }}
        </p>
        <p class="progressive-hint-content">
          {{ hint.content }}
        </p>
        <code
          v-if="hint.commandPreview && hint.level === 3"
          class="progressive-hint-preview"
        >{{ hint.commandPreview }}</code>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.progressive-hint-panel {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid #374151;
  border-radius: 1rem;
  background: #1f2937;
}

.progressive-hint-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.progressive-hint-eyebrow,
.progressive-hint-level {
  margin: 0 0 0.25rem;
  color: #86efac;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #f9fafb;
  font-size: 1.25rem;
}

.progressive-hint-progress {
  color: #9ca3af;
  font-size: 0.85rem;
  white-space: nowrap;
}

.progressive-hint-button {
  justify-self: start;
  padding: 0.7rem 0.95rem;
  border: 1px solid #4ade80;
  border-radius: 0.6rem;
  color: #86efac;
  background: transparent;
  cursor: pointer;
  font-weight: 800;
}

.progressive-hint-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.progressive-hint-item {
  padding: 1rem;
  border-left: 3px solid #4ade80;
  border-radius: 0.4rem;
  background: #111827;
}

.progressive-hint-content {
  margin: 0;
  color: #d1d5db;
  line-height: 1.6;
}

.progressive-hint-preview {
  display: inline-block;
  margin-top: 0.75rem;
  padding: 0.3rem 0.5rem;
  border-radius: 0.35rem;
  color: #fbbf24;
  background: #1f2937;
  font-size: 1rem;
}

@media (max-width: 40rem) {
  .progressive-hint-header {
    flex-direction: column;
  }
}
</style>
