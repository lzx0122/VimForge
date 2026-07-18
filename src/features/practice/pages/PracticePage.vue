<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import VimEditor from "../../../components/editor/VimEditor.vue";
import ExerciseFeedback from "../../../components/feedback/ExerciseFeedback.vue";
import type { EditorSnapshot } from "../../../domain/exercise/exercise-evaluator";
import {
  openVimForgeDatabase,
} from "../../../infrastructure/indexed-db/database";
import {
  SessionRepository,
  type ResumeState,
} from "../../../infrastructure/indexed-db/session-repository";
import { reportError } from "../../../infrastructure/monitoring/error-reporter";
import { SupabaseExerciseRepository } from "../../../infrastructure/supabase/supabase-exercise-repository";
import { usePracticeStore } from "../../../stores/practice-store";
import { useSyncStore } from "../../../stores/sync-store";
import type {
  AttemptDraft,
  HintLevel,
  NormalizedAction,
} from "../../../types/attempt";
import type { VimMode } from "../../../types/learning";
import type { PracticeSession } from "../../../types/session";
import type { ExerciseRepository, PracticeExercise } from "../repositories/exercise-repository";
import PracticeEditorStatusBar from "../components/PracticeEditorStatusBar.vue";
import ProgressiveHintPanel from "../components/ProgressiveHintPanel.vue";
import ResumeSessionDialog from "../components/ResumeSessionDialog.vue";
import { useAttemptElapsedTime } from "../composables/use-attempt-elapsed-time";
import {
  createAttemptOutcome,
  type AttemptFeedback,
} from "../services/attempt-outcome-service";
import { evaluateAutoCompletion } from "../services/auto-completion-service";
import { scrollFeedbackIntoView } from "../services/feedback-scroll-service";

const route = useRoute();
const router = useRouter();
const practiceStore = usePracticeStore();
const syncStore = useSyncStore();
const sessionId = computed(() => String(route.params.sessionId));
const isLoading = ref(true);
const isExerciseLoading = ref(false);
const isSavingOutcome = ref(false);
const isDialogOpen = ref(false);
const loadError = ref<string | null>(null);
const statusMessage = ref<string | null>(null);
const persistedState = ref<ResumeState | null>(null);
const exercise = ref<PracticeExercise | null>(null);
const snapshot = ref<EditorSnapshot | null>(null);
const unmetMessages = ref<string[]>([]);
const highestHintLevel = ref<HintLevel>(0);
const resetCount = ref(0);
const keystrokeCount = ref(0);
const recordedActions = ref<NormalizedAction[]>([]);
const hasUserInteraction = ref(false);
const editorInstance = ref(0);
const attemptClientId = ref("");
const attemptStartedAt = ref("");
const feedback = ref<AttemptFeedback | null>(null);
const feedbackAnchor = ref<HTMLElement | null>(null);
const isAttemptActive = computed(
  () =>
    exercise.value !== null &&
    snapshot.value !== null &&
    feedback.value === null,
);
const elapsedSeconds = useAttemptElapsedTime(
  attemptStartedAt,
  isAttemptActive,
);

let database: IDBDatabase | null = null;
let repository: SessionRepository | null = null;
let exerciseRepository: ExerciseRepository | null = null;
let isUnmounted = false;
let draftSaveQueue: Promise<void> = Promise.resolve();
let autoEvaluationQueued = false;

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

function reportActionError(context: string, error: unknown): void {
  reportError(context, error);
  loadError.value = "無法更新本機練習進度，請稍後再試。";
}

function waitForNextAnimationFrame(): Promise<void> {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function currentSnapshot(): EditorSnapshot {
  if (snapshot.value === null) {
    throw new Error("The exercise editor is not ready.");
  }

  return snapshot.value;
}

function currentExercise(): PracticeExercise {
  if (exercise.value === null) {
    throw new Error("No practice exercise is loaded.");
  }

  return exercise.value;
}

function buildAttemptDraft(
  completed = false,
  completedAt: string | null = null,
): AttemptDraft {
  const activeExercise = currentExercise();
  const editorSnapshot = currentSnapshot();

  return {
    clientAttemptId: attemptClientId.value,
    exerciseId: activeExercise.id,
    exerciseVersion: activeExercise.version,
    learningMode: practiceStore.session?.learningMode ?? "beginner",
    source: "web",
    startedAt: attemptStartedAt.value,
    completedAt,
    initialContent: activeExercise.initialContent,
    currentContent: editorSnapshot.content,
    initialCursor: { ...activeExercise.initialCursor },
    currentCursor: { ...editorSnapshot.cursor },
    currentMode: editorSnapshot.mode,
    actions: recordedActions.value.map((action) => ({ ...action })),
    mistakeCount: 0,
    undoCount: recordedActions.value.filter((action) => action.type === "undo")
      .length,
    resetCount: resetCount.value,
    highestHintLevel: highestHintLevel.value,
    completed,
  };
}

function queueDraftSave(): void {
  if (repository === null || exercise.value === null || snapshot.value === null) {
    return;
  }

  const draft = buildAttemptDraft();
  practiceStore.saveAttemptDraft(draft);
  draftSaveQueue = draftSaveQueue
    .then(() => repository?.saveAttemptDraft(sessionId.value, draft))
    .then(() => undefined)
    .catch((error: unknown) => {
      reportActionError("practice.save-draft", error);
    });
}

function prepareExercise(activeExercise: PracticeExercise): void {
  const restoredDraft =
    practiceStore.attemptDraft?.exerciseId === activeExercise.id &&
    !practiceStore.attemptDraft.completed
      ? practiceStore.attemptDraft
      : null;
  const content = restoredDraft?.currentContent ?? activeExercise.initialContent;
  const cursor = restoredDraft?.currentCursor ?? activeExercise.initialCursor;
  const mode = restoredDraft?.currentMode ?? "normal";

  exercise.value = activeExercise;
  snapshot.value = {
    content,
    cursor: { ...cursor },
    mode,
  };
  highestHintLevel.value = restoredDraft?.highestHintLevel ?? 0;
  resetCount.value = restoredDraft?.resetCount ?? 0;
  recordedActions.value =
    restoredDraft?.actions.map((action) => ({ ...action })) ?? [];
  hasUserInteraction.value = recordedActions.value.length > 0;
  attemptClientId.value = restoredDraft?.clientAttemptId ?? crypto.randomUUID();
  attemptStartedAt.value = restoredDraft?.startedAt ?? new Date().toISOString();
  keystrokeCount.value = 0;
  unmetMessages.value = [];
  feedback.value = null;
  editorInstance.value += 1;
}

async function loadCurrentExercise(): Promise<void> {
  const exerciseId = practiceStore.currentExerciseId;
  if (exerciseId === null) {
    if (practiceStore.session?.status === "completed") {
      await router.replace({
        name: "practice-result",
        params: { sessionId: sessionId.value },
      });
    }
    return;
  }

  isExerciseLoading.value = true;
  loadError.value = null;
  try {
    exerciseRepository ??= new SupabaseExerciseRepository();
    const loadedExercise = await exerciseRepository.getPublishedExercise(exerciseId);
    if (loadedExercise === null) {
      loadError.value = "找不到這一題，請返回練習設定後重試。";
      return;
    }
    prepareExercise(loadedExercise);
  } catch (error: unknown) {
    reportError("practice.load-exercise", error);
    loadError.value = "無法載入公開題目，請確認連線後再試。";
  } finally {
    isExerciseLoading.value = false;
  }
}

async function resumeSession(): Promise<void> {
  const state = requireResumeState();
  practiceStore.restoreSession(state.session, state.attemptDraft);
  isDialogOpen.value = false;
  statusMessage.value = state.attemptDraft
    ? "已恢復未完成題目。"
    : "已恢復題組進度。";
  await loadCurrentExercise();
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
    await loadCurrentExercise();
  } catch (error: unknown) {
    reportActionError("practice.reset-attempt", error);
  }
}

function updateContent(content: string): void {
  if (snapshot.value !== null) {
    snapshot.value = { ...snapshot.value, content };
    queueDraftSave();
    scheduleAutoEvaluation();
  }
}

function updateCursor(cursor: EditorSnapshot["cursor"]): void {
  if (snapshot.value !== null) {
    snapshot.value = { ...snapshot.value, cursor: { ...cursor } };
    queueDraftSave();
    scheduleAutoEvaluation();
  }
}

function updateMode(mode: VimMode): void {
  if (snapshot.value !== null) {
    snapshot.value = { ...snapshot.value, mode };
    queueDraftSave();
    scheduleAutoEvaluation();
  }
}

function recordAction(action: NormalizedAction): void {
  recordedActions.value.push({ ...action });
  hasUserInteraction.value = true;
  queueDraftSave();
  scheduleAutoEvaluation();
}

function updateHighestHint(level: HintLevel): void {
  highestHintLevel.value = level;
  queueDraftSave();
}

function recordKeydown(event: KeyboardEvent): void {
  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key !== "Shift") {
    keystrokeCount.value += 1;
  }
}

function resetExercise(): void {
  if (isSavingOutcome.value) {
    return;
  }

  const activeExercise = currentExercise();
  resetCount.value += 1;
  snapshot.value = {
    content: activeExercise.initialContent,
    cursor: { ...activeExercise.initialCursor },
    mode: "normal",
  };
  recordedActions.value = [];
  hasUserInteraction.value = false;
  unmetMessages.value = [];
  editorInstance.value += 1;
  statusMessage.value = "示範已結束，題目已重設，請親自完成。";
  queueDraftSave();
}

function scheduleAutoEvaluation(): void {
  if (autoEvaluationQueued) {
    return;
  }

  autoEvaluationQueued = true;
  queueMicrotask(() => {
    autoEvaluationQueued = false;
    void autoCompleteCurrentExercise();
  });
}

async function autoCompleteCurrentExercise(): Promise<void> {
  if (
    !hasUserInteraction.value ||
    isSavingOutcome.value ||
    feedback.value !== null ||
    exercise.value === null ||
    snapshot.value === null
  ) {
    return;
  }

  const result = evaluateAutoCompletion(
    exercise.value,
    snapshot.value,
    hasUserInteraction.value,
  );
  unmetMessages.value = result.evaluation.unmetConditions.map(
    (condition) => condition.message,
  );
  if (result.shouldSubmit) {
    await recordOutcome(true);
  }
}

async function recordOutcome(completed: boolean): Promise<void> {
  const activeExercise = currentExercise();
  const activeSession = practiceStore.session;
  if (activeSession === null || repository === null) {
    reportActionError(
      "practice.record-outcome",
      new Error("Practice persistence is unavailable."),
    );
    return;
  }

  isSavingOutcome.value = true;
  try {
    await draftSaveQueue;
    const completedAt = new Date().toISOString();
    const draft = buildAttemptDraft(completed, completedAt);
    const outcome = createAttemptOutcome({
      exercise: activeExercise,
      sessionId: activeSession.id,
      learningMode: activeSession.learningMode,
      clientAttemptId: attemptClientId.value,
      startedAt: attemptStartedAt.value,
      completedAt,
      completed,
      actualKeystrokeCount: keystrokeCount.value,
      mistakeCount: draft.mistakeCount,
      undoCount: draft.undoCount,
      resetCount: draft.resetCount,
      highestHintLevel: draft.highestHintLevel,
      normalizedActions: draft.actions,
    });

    await syncStore.recordCompletedAttempt(outcome.attempt);
    practiceStore.saveAttemptDraft(draft);
    if (completed) {
      practiceStore.completeCurrentExercise(completedAt);
    } else {
      practiceStore.skipCurrentExercise(completedAt);
    }
    if (practiceStore.session !== null) {
      const sessionSnapshot = {
        ...practiceStore.session,
        exerciseIds: [...practiceStore.session.exerciseIds],
        selectedSkillIds: [...practiceStore.session.selectedSkillIds],
      } satisfies PracticeSession;
      await repository.save(sessionSnapshot, null);
    }

    feedback.value = outcome.feedback;
    unmetMessages.value = [];
    await nextTick();
    await waitForNextAnimationFrame();
    scrollFeedbackIntoView(feedbackAnchor.value);
  } catch (error: unknown) {
    reportActionError("practice.record-outcome", error);
  } finally {
    isSavingOutcome.value = false;
  }
}

async function skipExercise(): Promise<void> {
  await recordOutcome(false);
}

async function goToNext(): Promise<void> {
  if (practiceStore.session?.status === "completed") {
    await router.push({
      name: "practice-result",
      params: { sessionId: sessionId.value },
    });
    return;
  }
  await loadCurrentExercise();
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
  } catch (error: unknown) {
    reportActionError("practice.abandon-session", error);
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

    if (
      practiceStore.session?.id === sessionId.value &&
      practiceStore.session.status === "active"
    ) {
      await loadCurrentExercise();
    } else if (state?.session.status === "active") {
      persistedState.value = state;
      isDialogOpen.value = true;
    } else if (state?.session.status === "completed") {
      await router.replace({
        name: "practice-result",
        params: { sessionId: sessionId.value },
      });
    }
  } catch (error: unknown) {
    reportError("practice.restore-session", error);
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
      v-if="isLoading || isExerciseLoading"
      role="status"
    >
      {{ isLoading ? "正在讀取本機練習進度…" : "正在載入題目…" }}
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

    <aside
      class="mobile-practice-notice"
      role="note"
    >
      建議使用電腦與實體鍵盤完成 Vim 練習；你仍可在手機查看課程與進度。
    </aside>

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

    <section
      v-if="exercise && snapshot"
      class="practice-workspace"
      :class="{ 'is-completed': feedback !== null }"
      @keydown.capture="recordKeydown"
    >
      <header class="exercise-heading">
        <p v-if="practiceStore.session">
          第 {{ practiceStore.session.currentIndex + 1 }} / {{ practiceStore.session.exerciseIds.length }} 題
        </p>
        <h2>{{ exercise.title }}</h2>
        <p>{{ exercise.instruction }}</p>
      </header>

      <div class="practice-editor-frame">
        <VimEditor
          :key="`${exercise.id}-${editorInstance}`"
          :initial-content="snapshot.content"
          :initial-cursor="snapshot.cursor"
          :language="exercise.language"
          :cursor-target="exercise.completionRule.cursorMatch"
          show-line-numbers
          show-keypresses
          auto-focus
          @content-changed="updateContent"
          @cursor-changed="updateCursor"
          @mode-changed="updateMode"
          @action-recorded="recordAction"
        />
        <p
          v-if="exercise.completionRule.cursorMatch.type !== 'ignore'"
          class="cursor-target-note"
          role="note"
        >
          黃色框為目標游標位置
        </p>
        <PracticeEditorStatusBar
          :mode="snapshot.mode"
          :elapsed-seconds="elapsedSeconds"
          :restart-disabled="isSavingOutcome || feedback !== null"
          @request-restart="resetExercise"
        />
      </div>

      <div class="exercise-actions">
        <button
          v-if="feedback === null"
          type="button"
          :disabled="isSavingOutcome"
          @click="skipExercise"
        >
          跳過這題
        </button>
      </div>

      <ul
        v-if="unmetMessages.length > 0"
        class="unmet-conditions"
        role="alert"
      >
        <li
          v-for="message in unmetMessages"
          :key="message"
        >
          {{ message }}
        </li>
      </ul>

      <ProgressiveHintPanel
        :hints="exercise.hints.map((hint) => ({
          level: hint.level,
          content: hint.content,
          ...(hint.commandPreview === null
            ? {}
            : { commandPreview: hint.commandPreview }),
        }))"
        @highest-level-changed="updateHighestHint"
      />
    </section>

    <div
      v-if="feedback && practiceStore.session"
      ref="feedbackAnchor"
      class="feedback-anchor"
    >
      <ExerciseFeedback
        :completed="feedback.completed"
        :learning-mode="practiceStore.session.learningMode"
        :accuracy-score="feedback.score.accuracyScore"
        :speed-score="feedback.score.speedScore"
        :previous-mastery-level="feedback.previousMasteryLevel"
        :next-mastery-level="feedback.nextMasteryLevel"
        :user-sequence="feedback.userSequence"
        :recommended-sequence="feedback.recommendedSequence"
        :improvement-reason="feedback.improvementReason"
        :actual-keystroke-count="feedback.actualKeystrokeCount"
        :recommended-keystroke-count="feedback.recommendedKeystrokeCount"
        :recommended-explanation="feedback.recommendedExplanation"
        @request-next="goToNext"
      />
    </div>

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

.feedback-anchor {
  scroll-margin-top: 1.5rem;
}

.practice-workspace {
  display: grid;
  gap: 1.5rem;
  margin-top: 2rem;
}

.practice-editor-frame {
  overflow: hidden;
  border: 1px solid #4b5563;
  border-radius: 0.75rem;
  background: #171b23;
}

.practice-editor-frame :deep(.vim-editor) {
  border: 0;
  border-radius: 0;
}

.cursor-target-note {
  margin: 0;
  padding: 0.65rem 1rem;
  color: #fef3c7;
  background: #292114;
  font-size: 0.88rem;
}

.exercise-heading h2,
.exercise-heading p {
  margin: 0;
}

.exercise-heading {
  display: grid;
  gap: 0.65rem;
}

.exercise-actions {
  display: flex;
  gap: 0.75rem;
}

.exercise-actions button {
  padding: 0.7rem 1rem;
  border: 1px solid #4ade80;
  border-radius: 0.6rem;
  color: #052e16;
  background: #4ade80;
  cursor: pointer;
  font-weight: 800;
}

.exercise-actions button + button {
  color: #d1d5db;
  border-color: #4b5563;
  background: transparent;
}

.unmet-conditions {
  margin: 0;
  padding: 1rem 1rem 1rem 2rem;
  border: 1px solid #f59e0b;
  border-radius: 0.65rem;
  color: #fef3c7;
  background: #451a03;
}

.mobile-practice-notice {
  display: none;
  padding: 0.85rem 1rem;
  border: 1px solid #f59e0b;
  border-radius: 0.65rem;
  color: #fef3c7;
  background: #451a03;
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

@media (max-width: 44rem) {
  .mobile-practice-notice {
    display: block;
  }

  .exercise-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
