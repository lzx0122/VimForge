<script lang="ts">
import type { LearningMode } from "../../../types";

export interface LearningModeSelection {
  mode: LearningMode;
}
</script>

<script setup lang="ts">
import { useRouter } from "vue-router";

import LearningModeCard from "./LearningModeCard.vue";

interface LearningModeOption {
  mode: LearningMode;
  title: string;
  description: string;
  actionLabel: string;
}

const modeOptions: readonly LearningModeOption[] = [
  {
    mode: "beginner",
    title: "從零開始",
    description: "第一次使用 Vim？從模式切換與基礎移動開始。",
    actionLabel: "開始學習",
  },
  {
    mode: "memory_review",
    title: "記憶複習",
    description: "學過但容易忘記？透過反覆出題建立肌肉記憶。",
    actionLabel: "開始複習",
  },
  {
    mode: "efficiency",
    title: "效率進階",
    description: "已經會 Vim？學習更少按鍵、更有效率的操作方式。",
    actionLabel: "挑戰效率",
  },
];

const router = useRouter();
const emit = defineEmits<{
  selected: [selection: LearningModeSelection];
}>();

async function selectMode(mode: LearningMode) {
  emit("selected", { mode });
  await router.push({
    name: "practice-setup",
    query: { mode },
  });
}
</script>

<template>
  <section aria-labelledby="learning-mode-heading">
    <h2 id="learning-mode-heading">
      選擇學習模式
    </h2>
    <div class="learning-mode-grid">
      <LearningModeCard
        v-for="option in modeOptions"
        :key="option.mode"
        v-bind="option"
        @select="selectMode"
      />
    </div>
  </section>
</template>
