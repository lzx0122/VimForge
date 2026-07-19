<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";

import QuestionCountSelector from "../../practice/components/QuestionCountSelector.vue";
import type { QuestionCount } from "../../../types/learning";
import DailyReviewSummary from "../components/DailyReviewSummary.vue";
import WeakSkillList from "../components/WeakSkillList.vue";

withDefaults(defineProps<{
  hasLearningHistory?: boolean;
  dueCount?: number;
  weakSkills?: readonly {
    id: string;
    name: string;
    masteryLevel: number;
    dueCount: number;
  }[];
}>(), {
  hasLearningHistory: false,
  dueCount: 0,
  weakSkills: () => [],
});

const questionCount = ref<QuestionCount>(10);
</script>

<template>
  <section class="page-section">
    <h1>今日複習</h1>
    <p>優先安排到期、錯題與主要弱項，再加入熟悉內容抽查。</p>
  </section>

  <section
    v-if="!hasLearningHistory"
    class="empty-review-state"
  >
    <h2>尚無練習紀錄</h2>
    <p>先完成基礎題組，系統就能依照你的表現安排每日複習。</p>
    <RouterLink
      class="primary-link"
      :to="{ path: '/practice/setup', query: { mode: 'beginner' } }"
    >
      開始基礎題組
    </RouterLink>
  </section>

  <div
    v-else
    class="daily-review-layout"
  >
    <DailyReviewSummary
      :due-count="dueCount"
      :question-count="questionCount"
    />
    <QuestionCountSelector v-model="questionCount" />
    <WeakSkillList :skills="weakSkills" />
    <RouterLink
      class="primary-link"
      :to="{
        path: '/practice/setup',
        query: {
          mode: 'memory_review',
          source: 'daily_review',
          count: questionCount,
        },
      }"
    >
      建立今日複習
    </RouterLink>
  </div>
</template>

<style scoped>
.daily-review-layout,
.empty-review-state {
  display: grid;
  gap: 1.5rem;
  max-width: 52rem;
}

.empty-review-state {
  justify-items: start;
  padding: 1.5rem;
  border: 1px solid #374151;
  border-radius: 1rem;
  background: #1f2937;
}

.empty-review-state h2,
.empty-review-state p {
  margin: 0;
}

.empty-review-state h2 {
  color: #f9fafb;
}
</style>
