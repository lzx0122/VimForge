<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import { openVimForgeDatabase } from "../../../infrastructure/indexed-db/database";
import { SupabaseCourseRepository } from "../../../infrastructure/supabase/supabase-course-repository";
import RecentAttempts from "../components/RecentAttempts.vue";
import SkillMasteryList from "../components/SkillMasteryList.vue";
import UnitProgressGrid from "../components/UnitProgressGrid.vue";
import {
  ProgressQueryService,
  type ProgressDashboard,
} from "../services/progress-query-service";

type ProgressLoadState = "loading" | "loaded" | "empty" | "error";

const loadState = ref<ProgressLoadState>("loading");
const dashboard = ref<ProgressDashboard | null>(null);

async function loadDashboard(): Promise<void> {
  loadState.value = "loading";
  try {
    const database = await openVimForgeDatabase();
    let loadedDashboard: ProgressDashboard;
    try {
      const service = new ProgressQueryService(
        database,
        new SupabaseCourseRepository(),
      );
      loadedDashboard = await service.getDashboard();
    } finally {
      database.close();
    }
    dashboard.value = loadedDashboard;
    loadState.value = loadedDashboard.hasLearningHistory ? "loaded" : "empty";
  } catch {
    loadState.value = "error";
  }
}

onMounted(() => {
  void loadDashboard();
});
</script>

<template>
  <section class="page-section">
    <h1>學習進度</h1>
    <p>查看長期技能熟練、課程完成度與需要再次練習的內容。</p>
  </section>

  <p v-if="loadState === 'loading'">
    正在載入學習進度…
  </p>

  <div
    v-else-if="loadState === 'error'"
    role="alert"
    class="progress-error"
  >
    <p>暫時無法載入學習進度，請稍後重試。</p>
    <button
      type="button"
      data-testid="progress-retry"
      @click="loadDashboard"
    >
      重試
    </button>
  </div>

  <section
    v-else-if="loadState === 'empty'"
    class="empty-progress-state"
  >
    <h2>尚無學習紀錄</h2>
    <p>完成第一個課程練習後，這裡會整理你的熟練度與錯題。</p>
    <RouterLink
      class="primary-link"
      to="/courses"
    >
      前往課程
    </RouterLink>
  </section>

  <div
    v-else-if="dashboard !== null"
    class="progress-dashboard"
  >
    <aside class="due-review-card">
      <div>
        <strong data-testid="due-review-count">{{ dashboard.dueReviewCount }}</strong>
        <span>題待複習</span>
      </div>
      <RouterLink to="/review">
        查看今日複習
      </RouterLink>
    </aside>
    <SkillMasteryList :skills="dashboard.skills" />
    <UnitProgressGrid :units="dashboard.units" />
    <RecentAttempts :attempts="dashboard.recentAttempts" />
  </div>
</template>

<style scoped>
.progress-dashboard,
.empty-progress-state {
  display: grid;
  gap: 1.5rem;
  max-width: 60rem;
}

.empty-progress-state,
.progress-error {
  justify-items: start;
  padding: 1.5rem;
  border: 1px solid #374151;
  border-radius: 1rem;
  background: #1f2937;
}

.empty-progress-state h2,
.empty-progress-state p {
  margin: 0;
}

.progress-error {
  display: grid;
  gap: 0.75rem;
  max-width: 52rem;
}

.progress-error p {
  margin: 0;
  color: #fca5a5;
}

.due-review-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border: 1px solid #4ade80;
  border-radius: 1rem;
  background: #052e16;
}

.due-review-card div {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.due-review-card strong {
  color: #86efac;
  font-size: 2rem;
}
</style>
