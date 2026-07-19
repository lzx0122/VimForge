<script setup lang="ts">
import type { LearningMode } from "../../../types";

const props = defineProps<{
  mode: LearningMode;
  title: string;
  description: string;
  actionLabel: string;
}>();

const emit = defineEmits<{
  select: [mode: LearningMode];
}>();

function selectMode() {
  emit("select", props.mode);
}
</script>

<template>
  <article
    class="learning-mode-card"
    :data-mode="mode"
  >
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <button
      type="button"
      @click="selectMode"
      @keydown.enter.prevent="selectMode"
      @keydown.space.prevent="selectMode"
    >
      {{ actionLabel }}
    </button>
  </article>
</template>
