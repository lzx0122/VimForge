<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import { openVimForgeDatabase } from "../../../infrastructure/indexed-db/database";
import { reportError } from "../../../infrastructure/monitoring/error-reporter";
import { usePracticeStore } from "../../../stores/practice-store";
import {
  SessionResultService,
  type PracticeSessionResult,
} from "../services/session-result-service";

type ResultLoadState = "loading" | "loaded" | "empty" | "error";

const route = useRoute();
const router = useRouter();
const practiceStore = usePracticeStore();

const sessionId = computed(() => String(route.params.sessionId));
const loadState = ref<ResultLoadState>("loading");
const result = ref<PracticeSessionResult | null>(null);
const isRestarting = ref(false);

const needsPracticeExerciseIds = computed<string[]>(() =>
  (result.value?.exerciseResults ?? [])
    .filter((exerciseResult) => !exerciseResult.completed)
    .map((exerciseResult) => exerciseResult.exerciseId),
);

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${seconds} 秒`;
}

async function loadResult(): Promise<void> {
  loadState.value = "loading";
  try {
    const database = await openVimForgeDatabase();
    let loadedResult: PracticeSessionResult | null;
    try {
      const service = new SessionResultService(database);
      loadedResult = await service.getResult(sessionId.value);
    } finally {
      database.close();
    }
    result.value = loadedResult;
    loadState.value = loadedResult === null ? "empty" : "loaded";
  } catch (error: unknown) {
    reportError("practice-result.load-result", error);
    loadState.value = "error";
  }
}

async function restartSession(): Promise<void> {
  isRestarting.value = true;
  try {
    const database = await openVimForgeDatabase();
    let restarted;
    try {
      const service = new SessionResultService(database);
      restarted = await service.restart(sessionId.value);
    } finally {
      database.close();
    }
    practiceStore.restoreSession(restarted, null);
    await router.push({
      name: "practice",
      params: { sessionId: restarted.id },
    });
  } catch (error: unknown) {
    reportError("practice-result.restart-session", error);
  } finally {
    isRestarting.value = false;
  }
}

onMounted(() => {
  void loadResult();
});
</script>

<template>
  <section class="page-section">
    <h1>練習結果</h1>
    <p>題組：{{ sessionId }}</p>
  </section>

  <p v-if="loadState === 'loading'">
    正在載入練習結果…
  </p>

  <div
    v-else-if="loadState === 'error'"
    role="alert"
    class="result-error"
  >
    <p>暫時無法載入練習結果，請稍後重試。</p>
    <button
      type="button"
      data-testid="result-retry"
      @click="loadResult"
    >
      重試
    </button>
  </div>

  <section
    v-else-if="loadState === 'empty'"
    class="empty-result-state"
  >
    <h2>找不到這個題組的結果</h2>
    <p>這個題組還沒有完成紀錄，或紀錄已經被清除。</p>
    <RouterLink
      class="primary-link"
      :to="{ name: 'home' }"
    >
      返回首頁
    </RouterLink>
  </section>

  <div
    v-else-if="result !== null"
    class="result-summary"
  >
    <dl class="result-stats">
      <div>
        <dt>完成題數</dt>
        <dd>{{ result.completedExercises }} / {{ result.totalExercises }}</dd>
      </div>
      <div>
        <dt>略過題數</dt>
        <dd>{{ result.skippedExercises }}</dd>
      </div>
      <div>
        <dt>平均正確率</dt>
        <dd>
          {{ result.averageAccuracy === null ? "—" : `${result.averageAccuracy.toFixed(0)}%` }}
        </dd>
      </div>
      <div>
        <dt>平均速度</dt>
        <dd>
          {{ result.averageSpeed === null ? "—" : `${result.averageSpeed.toFixed(0)}%` }}
        </dd>
      </div>
      <div>
        <dt>總花費時間</dt>
        <dd>{{ formatDuration(result.totalDurationMs) }}</dd>
      </div>
    </dl>

    <section
      v-if="result.skillChanges.length > 0"
      class="skill-changes"
    >
      <h2>技能變化</h2>
      <ul>
        <li
          v-for="change in result.skillChanges"
          :key="change.skillId"
        >
          {{ change.skillId }}：{{ change.previousLevel }} →
          {{ change.nextLevel }}（{{ change.previousScore }} →
          {{ change.nextScore }}）
        </li>
      </ul>
    </section>

    <section
      v-if="needsPracticeExerciseIds.length > 0"
      class="needs-practice"
      data-testid="needs-practice-list"
    >
      <h2>建議再加強</h2>
      <ul>
        <li
          v-for="exerciseId in needsPracticeExerciseIds"
          :key="exerciseId"
        >
          {{ exerciseId }}
        </li>
      </ul>
    </section>

    <div class="result-actions">
      <button
        type="button"
        data-testid="restart-session"
        :disabled="isRestarting"
        @click="restartSession"
      >
        再練本題組
      </button>
      <RouterLink
        class="primary-link"
        :to="{ name: 'progress' }"
      >
        查看學習進度
      </RouterLink>
      <RouterLink
        class="primary-link"
        :to="{ name: 'review' }"
      >
        前往今日複習
      </RouterLink>
      <RouterLink
        class="primary-link"
        :to="{ name: 'home' }"
      >
        返回首頁
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.result-summary,
.empty-result-state {
  display: grid;
  gap: 1.5rem;
  max-width: 52rem;
}

.empty-result-state,
.result-error {
  justify-items: start;
  padding: 1.5rem;
  border: 1px solid #374151;
  border-radius: 1rem;
  background: #1f2937;
}

.empty-result-state h2,
.empty-result-state p {
  margin: 0;
  color: #f9fafb;
}

.result-error {
  display: grid;
  gap: 0.75rem;
  max-width: 52rem;
}

.result-error p {
  margin: 0;
  color: #fca5a5;
}

.result-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 1rem;
  margin: 0;
}

.result-stats dt {
  color: #9ca3af;
  font-size: 0.875rem;
}

.result-stats dd {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #f9fafb;
}

.skill-changes ul,
.needs-practice ul {
  margin: 0;
  padding-left: 1.25rem;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}
</style>
