<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import { openVimForgeDatabase } from "../../../infrastructure/indexed-db/database";
import { SessionRepository } from "../../../infrastructure/indexed-db/session-repository";
import { reportError } from "../../../infrastructure/monitoring/error-reporter";
import { SupabaseExerciseRepository } from "../../../infrastructure/supabase/supabase-exercise-repository";
import { usePracticeStore } from "../../../stores/practice-store";
import type {
  LearningMode,
  QuestionCount,
} from "../../../types";
import type { PracticeSelectionType } from "../../../types/session";
import PracticeSourceSelector, {
  type PracticeSource,
} from "../components/PracticeSourceSelector.vue";
import QuestionCountSelector from "../components/QuestionCountSelector.vue";
import TopicSelector from "../components/TopicSelector.vue";
import { PracticeSessionStarter } from "../services/practice-session-starter";

const route = useRoute();
const router = useRouter();
const practiceStore = usePracticeStore();
const questionCount = ref<QuestionCount>(
  route.query.count === "5" ? 5 : route.query.count === "20" ? 20 : 10,
);
const practiceSource = ref<PracticeSource>(
  route.query.source === "topic_practice"
    ? "topic_practice"
    : "daily_review",
);
const selectedTopics = ref<string[]>([]);
const isStarting = ref(false);
const startError = ref<string | null>(null);

const mode = computed<LearningMode>(() => {
  const queryMode = route.query.mode;

  if (queryMode === "memory_review" || queryMode === "efficiency") {
    return queryMode;
  }

  return "beginner";
});

const canStart = computed(
  () =>
    mode.value !== "beginner" &&
    (practiceSource.value !== "topic_practice" || selectedTopics.value.length > 0),
);

function selectionType(): PracticeSelectionType {
  if (mode.value === "memory_review") {
    return practiceSource.value;
  }
  return selectedTopics.value.length > 0
    ? "topic_practice"
    : "weakness_practice";
}

async function startPractice(): Promise<void> {
  if (!canStart.value || isStarting.value) {
    return;
  }

  isStarting.value = true;
  startError.value = null;
  try {
    const exerciseRepository = new SupabaseExerciseRepository();
    const exercises = await exerciseRepository.listPublishedExercises({
      learningMode: mode.value,
      limit: questionCount.value,
    });
    if (exercises.length === 0) {
      startError.value = "目前沒有符合條件的公開題目，請稍後再試。";
      return;
    }

    const database = await openVimForgeDatabase();
    let session;
    try {
      const starter = new PracticeSessionStarter(
        new SessionRepository(database),
        practiceStore,
      );
      session = await starter.start({
        learningMode: mode.value,
        selectionType: selectionType(),
        requestedCount: questionCount.value,
        exerciseIds: exercises.map((exercise) => exercise.id),
        selectedSkillIds: selectedTopics.value,
      });
    } finally {
      database.close();
    }
    await router.push({
      name: "practice",
      params: { sessionId: session.id },
    });
  } catch (error: unknown) {
    reportError("practice.create-session", error);
    startError.value = "無法建立題組，請確認連線後再試。";
  } finally {
    isStarting.value = false;
  }
}
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

  <section
    v-if="mode !== 'beginner'"
    class="start-practice-panel"
  >
    <button
      type="button"
      :disabled="!canStart || isStarting"
      @click="startPractice"
    >
      {{ isStarting ? "正在建立題組…" : "開始練習" }}
    </button>
    <p
      v-if="startError"
      role="alert"
    >
      {{ startError }}
    </p>
  </section>
</template>

<style scoped>
.start-practice-panel {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.start-practice-panel button {
  padding: 0.75rem 1rem;
  border: 0;
  border-radius: 0.6rem;
  color: #052e16;
  background: #4ade80;
  cursor: pointer;
  font-weight: 800;
}

.start-practice-panel button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.start-practice-panel p {
  margin: 0;
  color: #fca5a5;
}
</style>
