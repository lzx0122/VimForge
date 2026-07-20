<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import { AttemptRepository } from "../../../infrastructure/indexed-db/attempt-repository";
import { openVimForgeDatabase } from "../../../infrastructure/indexed-db/database";
import { ExerciseReviewRepository } from "../../../infrastructure/indexed-db/exercise-review-repository";
import { SkillMasteryRepository } from "../../../infrastructure/indexed-db/skill-mastery-repository";
import { SupabasePracticeCandidateRepository } from "../../../infrastructure/supabase/supabase-practice-candidate-repository";
import type { QuestionCount } from "../../../types/learning";
import QuestionCountSelector from "../../practice/components/QuestionCountSelector.vue";
import DailyReviewSummary from "../components/DailyReviewSummary.vue";
import WeakSkillList from "../components/WeakSkillList.vue";
import {
  ReviewSummaryService,
  type ReviewSummary,
} from "../services/review-summary-service";

type ReviewLoadState = "loading" | "loaded" | "empty" | "error";

const loadState = ref<ReviewLoadState>("loading");
const summary = ref<ReviewSummary | null>(null);
const questionCount = ref<QuestionCount>(10);

async function loadSummary(): Promise<void> {
  loadState.value = "loading";
  try {
    const database = await openVimForgeDatabase();
    let result: ReviewSummary;
    try {
      const service = new ReviewSummaryService(
        new SupabasePracticeCandidateRepository(),
        new AttemptRepository(database),
        new SkillMasteryRepository(database),
        new ExerciseReviewRepository(database),
      );
      result = await service.getSummary();
    } finally {
      database.close();
    }
    summary.value = result;
    loadState.value = result.hasLearningHistory ? "loaded" : "empty";
  } catch {
    loadState.value = "error";
  }
}

onMounted(() => {
  void loadSummary();
});
</script>

<template>
  <section class="page-section">
    <h1>今日複習</h1>
    <p>優先安排到期、錯題與主要弱項，再加入熟悉內容抽查。</p>
  </section>

  <p v-if="loadState === 'loading'">
    正在載入複習資料…
  </p>

  <section
    v-else-if="loadState === 'empty'"
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
    v-else-if="loadState === 'error'"
    role="alert"
    class="review-error"
  >
    <p>暫時無法讀取複習資料，請稍後重試。</p>
    <button
      type="button"
      data-testid="review-retry"
      @click="loadSummary"
    >
      重試
    </button>
  </div>

  <div
    v-else-if="summary !== null"
    class="daily-review-layout"
  >
    <DailyReviewSummary
      :due-count="summary.dueCount"
      :question-count="questionCount"
    />
    <QuestionCountSelector v-model="questionCount" />
    <WeakSkillList :skills="summary.weakSkills" />
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

.empty-review-state,
.review-error {
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

.review-error {
  display: grid;
  gap: 0.75rem;
  max-width: 52rem;
}

.review-error p {
  margin: 0;
  color: #fca5a5;
}
</style>
