<script setup lang="ts">
import { RouterLink } from "vue-router";

import RecentAttempts from "../components/RecentAttempts.vue";
import SkillMasteryList from "../components/SkillMasteryList.vue";
import UnitProgressGrid from "../components/UnitProgressGrid.vue";

withDefaults(defineProps<{
  hasLearningHistory?: boolean;
  dueReviewCount?: number;
  skills?: readonly {
    id: string;
    name: string;
    masteryLevel: 0 | 1 | 2 | 3 | 4 | 5;
    masteryScore: number;
  }[];
  units?: readonly {
    id: string;
    slug: string;
    title: string;
    completedExercises: number;
    totalExercises: number;
  }[];
  recentAttempts?: readonly {
    id: string;
    exerciseTitle: string;
    completed: boolean;
    accuracyScore: number;
    occurredAt: string;
    errorSummary: string | null;
  }[];
}>(), {
  hasLearningHistory: false,
  dueReviewCount: 0,
  skills: () => [],
  units: () => [],
  recentAttempts: () => [],
});
</script>

<template>
  <section class="page-section">
    <h1>學習進度</h1>
    <p>查看長期技能熟練、課程完成度與需要再次練習的內容。</p>
  </section>

  <section
    v-if="!hasLearningHistory"
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
    v-else
    class="progress-dashboard"
  >
    <aside class="due-review-card">
      <div>
        <strong data-testid="due-review-count">{{ dueReviewCount }}</strong>
        <span>題待複習</span>
      </div>
      <RouterLink to="/review">
        查看今日複習
      </RouterLink>
    </aside>
    <SkillMasteryList :skills="skills" />
    <UnitProgressGrid :units="units" />
    <RecentAttempts :attempts="recentAttempts" />
  </div>
</template>

<style scoped>
.progress-dashboard,
.empty-progress-state {
  display: grid;
  gap: 1.5rem;
  max-width: 60rem;
}

.empty-progress-state {
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
