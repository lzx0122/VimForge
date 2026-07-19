<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import { AttemptRepository } from "../../../infrastructure/indexed-db/attempt-repository";
import { openVimForgeDatabase } from "../../../infrastructure/indexed-db/database";
import { SessionRepository } from "../../../infrastructure/indexed-db/session-repository";
import { reportError } from "../../../infrastructure/monitoring/error-reporter";
import { SupabasePracticeCandidateRepository } from "../../../infrastructure/supabase/supabase-practice-candidate-repository";
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
import { PracticeSelectionService } from "../services/practice-selection-service";
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
const infoMessage = ref<string | null>(null);

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

function selectionType(): Exclude<PracticeSelectionType, "course"> {
  if (mode.value === "memory_review") {
    return practiceSource.value;
  }
  return selectedTopics.value.length > 0
    ? "topic_practice"
    : "weakness_practice";
}

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptySelectionMessage(
  currentSelectionType: PracticeSelectionType,
): string {
  if (currentSelectionType === "topic_practice") {
    return "目前選取的主題尚無可用題目，請選擇其他主題。";
  }
  if (currentSelectionType === "daily_review") {
    return "無法讀取學習紀錄，暫時不能建立今日複習。";
  }
  return "無法建立題組，請確認連線後再試。";
}

async function startPractice(): Promise<void> {
  if (!canStart.value || isStarting.value) {
    return;
  }

  isStarting.value = true;
  startError.value = null;
  infoMessage.value = null;
  try {
    const currentMode = mode.value;
    const currentSelectionType = selectionType();
    const database = await openVimForgeDatabase();
    try {
      const selectionService = new PracticeSelectionService(
        new SupabasePracticeCandidateRepository(),
        new AttemptRepository(database),
      );
      const selection = await selectionService.select({
        learningMode: currentMode,
        selectionType: currentSelectionType,
        questionCount: questionCount.value,
        selectedTopicSlugs: selectedTopics.value,
        localDate: todayLocalDate(),
      });

      if (selection.actualCount === 0) {
        startError.value = emptySelectionMessage(currentSelectionType);
        return;
      }

      if (
        !selection.personalized &&
        currentSelectionType === "weakness_practice"
      ) {
        infoMessage.value = "尚無個人練習資料，本次先安排一般效率題目。";
      } else if (selection.actualCount < questionCount.value) {
        infoMessage.value = `目前符合條件的題目共有 ${selection.actualCount} 題，本次將安排全部可用題目。`;
      }

      const starter = new PracticeSessionStarter(
        new SessionRepository(database),
        practiceStore,
      );
      const session = await starter.start({
        learningMode: currentMode,
        selectionType: currentSelectionType,
        requestedCount: questionCount.value,
        exerciseIds: selection.exerciseIds,
        selectedSkillIds: selection.selectedSkillIds,
      });
      await router.push({
        name: "practice",
        params: { sessionId: session.id },
      });
    } finally {
      database.close();
    }
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
      v-if="infoMessage"
      class="start-practice-info"
    >
      {{ infoMessage }}
    </p>
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

.start-practice-info {
  color: #a3a3a3;
}
</style>
