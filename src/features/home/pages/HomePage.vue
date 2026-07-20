<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import { openVimForgeDatabase } from "../../../infrastructure/indexed-db/database";
import { ExerciseReviewRepository } from "../../../infrastructure/indexed-db/exercise-review-repository";
import { SessionRepository } from "../../../infrastructure/indexed-db/session-repository";
import { SkillMasteryRepository } from "../../../infrastructure/indexed-db/skill-mastery-repository";
import { reportError } from "../../../infrastructure/monitoring/error-reporter";
import { SupabaseCourseRepository } from "../../../infrastructure/supabase/supabase-course-repository";
import LearningModeGrid from "../components/LearningModeGrid.vue";
import {
  HomeLearningSummaryService,
  type HomeLearningSummary,
} from "../services/home-learning-summary-service";

type SummaryLoadState = "loading" | "loaded" | "error";

const loadState = ref<SummaryLoadState>("loading");
const summary = ref<HomeLearningSummary | null>(null);

const hasSummaryContent = computed(
  () =>
    summary.value !== null &&
    (summary.value.activeSessionId !== null ||
      summary.value.dueReviewCount > 0 ||
      summary.value.weakestSkill !== null),
);

async function loadSummary(): Promise<void> {
  loadState.value = "loading";
  try {
    const database = await openVimForgeDatabase();
    let loadedSummary: HomeLearningSummary;
    try {
      const service = new HomeLearningSummaryService(
        new SessionRepository(database),
        new ExerciseReviewRepository(database),
        new SkillMasteryRepository(database),
        new SupabaseCourseRepository(),
      );
      loadedSummary = await service.getSummary();
    } finally {
      database.close();
    }
    summary.value = loadedSummary;
    loadState.value = "loaded";
  } catch (error: unknown) {
    reportError("home.load-summary", error);
    loadState.value = "error";
  }
}

onMounted(() => {
  void loadSummary();
});
</script>

<template>
  <section class="page-section">
    <p class="eyebrow">
      Vim muscle-memory training
    </p>
    <h1>Vim Practice</h1>
    <p>在真實程式碼情境中，反覆練習高效率的 Vim 操作。</p>
  </section>

  <section
    v-if="loadState === 'loaded' && hasSummaryContent"
    class="learning-summary"
    aria-labelledby="learning-summary-heading"
  >
    <h2 id="learning-summary-heading">
      學習狀態
    </h2>
    <div class="learning-summary-cards">
      <RouterLink
        v-if="summary?.activeSessionId !== null && summary?.activeSessionId !== undefined"
        class="summary-card"
        :to="{ name: 'practice', params: { sessionId: summary.activeSessionId } }"
      >
        繼續上次練習
      </RouterLink>
      <RouterLink
        v-if="summary !== null && summary.dueReviewCount > 0"
        class="summary-card"
        to="/review"
      >
        今日有 {{ summary.dueReviewCount }} 題待複習
      </RouterLink>
      <RouterLink
        v-if="summary?.weakestSkill !== null && summary?.weakestSkill !== undefined"
        class="summary-card"
        :to="{ path: '/practice/setup', query: { mode: 'efficiency' } }"
      >
        建議加強：{{ summary.weakestSkill.name }}
      </RouterLink>
    </div>
  </section>

  <LearningModeGrid />
</template>

<style scoped>
.learning-summary {
  display: grid;
  gap: 1rem;
}

.learning-summary h2 {
  margin: 0;
  color: #f9fafb;
}

.learning-summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 1rem;
}

.summary-card {
  padding: 1rem 1.25rem;
  border: 1px solid #374151;
  border-radius: 1rem;
  background: #1f2937;
  color: #f9fafb;
  text-decoration: none;
  font-weight: 600;
}

.summary-card:hover {
  border-color: #4ade80;
}
</style>
