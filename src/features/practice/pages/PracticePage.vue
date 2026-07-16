<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";

import {
  openVimForgeDatabase,
} from "../../../infrastructure/indexed-db/database";
import {
  SessionRepository,
  type ResumeState,
} from "../../../infrastructure/indexed-db/session-repository";
import { usePracticeStore } from "../../../stores/practice-store";
import ResumeSessionDialog from "../components/ResumeSessionDialog.vue";

const route = useRoute();
const practiceStore = usePracticeStore();
const sessionId = computed(() => String(route.params.sessionId));
const isLoading = ref(true);
const isDialogOpen = ref(false);
const loadError = ref<string | null>(null);
const statusMessage = ref<string | null>(null);
const persistedState = ref<ResumeState | null>(null);

let database: IDBDatabase | null = null;
let repository: SessionRepository | null = null;
let isUnmounted = false;

const restoredAttemptContent = computed(
  () => practiceStore.attemptDraft?.currentContent ?? null,
);

function requireResumeState(): ResumeState {
  if (persistedState.value === null) {
    throw new Error("No active practice session is available.");
  }

  return persistedState.value;
}

function requireRepository(): SessionRepository {
  if (repository === null) {
    throw new Error("Practice session storage is unavailable.");
  }

  return repository;
}

function reportActionError(): void {
  loadError.value = "無法更新本機練習進度，請稍後再試。";
}

function resumeSession(): void {
  const state = requireResumeState();
  practiceStore.restoreSession(state.session, state.attemptDraft);
  isDialogOpen.value = false;
  statusMessage.value = state.attemptDraft
    ? "已恢復未完成題目。"
    : "已恢復題組進度。";
}

async function resetAttempt(): Promise<void> {
  try {
    const state = requireResumeState();
    await requireRepository().saveAttemptDraft(state.session.id, null);
    practiceStore.restoreSession(state.session, null);
    persistedState.value = {
      session: state.session,
      attemptDraft: null,
    };
    isDialogOpen.value = false;
    statusMessage.value = "已重設目前題目，可重新開始操作。";
  } catch {
    reportActionError();
  }
}

async function abandonSession(): Promise<void> {
  try {
    const state = requireResumeState();
    practiceStore.restoreSession(state.session, state.attemptDraft);
    const abandonedSession = practiceStore.abandonSession(
      new Date().toISOString(),
    );

    await requireRepository().save(abandonedSession, null);
    practiceStore.resetSession();
    persistedState.value = null;
    isDialogOpen.value = false;
    statusMessage.value =
      "已放棄這個題組，未完成題目不會算失敗。";
  } catch {
    reportActionError();
  }
}

onMounted(async () => {
  try {
    const openedDatabase = await openVimForgeDatabase();

    if (isUnmounted) {
      openedDatabase.close();
      return;
    }

    database = openedDatabase;
    repository = new SessionRepository(openedDatabase);
    const state = await repository.getResumeState(sessionId.value);

    if (state?.session.status === "active") {
      persistedState.value = state;
      isDialogOpen.value = true;
    }
  } catch {
    loadError.value = "無法讀取本機練習進度，請重新整理後再試。";
  } finally {
    isLoading.value = false;
  }
});

onUnmounted(() => {
  isUnmounted = true;
  database?.close();
});
</script>

<template>
  <section class="page-section practice-page">
    <p class="eyebrow">
      Practice
    </p>
    <h1>Vim 練習</h1>
    <p>題組：{{ sessionId }}</p>

    <p
      v-if="isLoading"
      role="status"
    >
      正在讀取本機練習進度…
    </p>
    <p
      v-if="loadError"
      class="error-message"
      role="alert"
    >
      {{ loadError }}
    </p>
    <p
      v-if="statusMessage"
      class="status-message"
      role="status"
    >
      {{ statusMessage }}
    </p>

    <section
      v-if="restoredAttemptContent"
      class="restored-attempt"
      aria-labelledby="restored-attempt-title"
    >
      <h2 id="restored-attempt-title">
        已恢復的題目內容
      </h2>
      <pre data-testid="restored-attempt-content"><code>{{ restoredAttemptContent }}</code></pre>
    </section>

    <RouterLink
      v-if="statusMessage?.startsWith('已放棄')"
      :to="{ name: 'practice-setup' }"
    >
      返回練習設定
    </RouterLink>
  </section>

  <ResumeSessionDialog
    v-if="isDialogOpen && persistedState"
    :has-attempt-draft="persistedState.attemptDraft !== null"
    @resume="resumeSession"
    @reset-attempt="resetAttempt"
    @abandon="abandonSession"
  />
</template>

<style scoped>
.practice-page {
  max-width: 52rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--color-accent, #8ce8b5);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.error-message {
  padding: 0.85rem 1rem;
  border: 1px solid #8f4a43;
  border-radius: 0.65rem;
  color: #ffd8d3;
  background: #3a211f;
}

.status-message {
  padding: 0.85rem 1rem;
  border: 1px solid var(--color-border, #527064);
  border-radius: 0.65rem;
  background: var(--color-surface, #14221c);
}

.restored-attempt {
  margin-top: 1.5rem;
}

.restored-attempt h2 {
  font-size: 1rem;
}

pre {
  overflow-x: auto;
  padding: 1rem;
  border: 1px solid var(--color-border, #527064);
  border-radius: 0.65rem;
  background: #0c1511;
}
</style>
