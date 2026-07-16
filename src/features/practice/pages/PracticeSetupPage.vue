<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";

import type {
  LearningMode,
  QuestionCount,
} from "../../../types";
import PracticeSourceSelector, {
  type PracticeSource,
} from "../components/PracticeSourceSelector.vue";
import QuestionCountSelector from "../components/QuestionCountSelector.vue";
import TopicSelector from "../components/TopicSelector.vue";

const route = useRoute();
const questionCount = ref<QuestionCount>(10);
const practiceSource = ref<PracticeSource>("daily_review");
const selectedTopics = ref<string[]>([]);

const mode = computed<LearningMode>(() => {
  const queryMode = route.query.mode;

  if (queryMode === "memory_review" || queryMode === "efficiency") {
    return queryMode;
  }

  return "beginner";
});
</script>

<template>
  <section class="page-section">
    <h1>練習設定</h1>
    <p>依照這次的學習目標選擇練習內容。</p>
  </section>

  <section
    v-if="mode === 'beginner'"
    class="setup-panel"
  >
    <h2>從課程單元開始</h2>
    <p>從概念、引導操作與自主挑戰逐步練習。</p>
    <RouterLink
      class="primary-link"
      to="/courses"
    >
      選擇課程單元
    </RouterLink>
  </section>

  <section
    v-else-if="mode === 'memory_review'"
    class="setup-panel"
  >
    <QuestionCountSelector v-model="questionCount" />
    <PracticeSourceSelector v-model="practiceSource" />
    <div v-if="practiceSource === 'topic_practice'">
      <h2>指定主題</h2>
      <TopicSelector
        v-model="selectedTopics"
        required
      />
    </div>
  </section>

  <section
    v-else
    class="setup-panel"
  >
    <QuestionCountSelector v-model="questionCount" />
    <h2>可選主題</h2>
    <p>未選主題時，系統會從效率進階內容安排題目。</p>
    <TopicSelector v-model="selectedTopics" />
  </section>
</template>
