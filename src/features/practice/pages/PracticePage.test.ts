import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptDraft } from "../../../types/attempt";
import type { PracticeSession } from "../../../types/session";
import type { CompleteAttemptResult } from "../services/attempt-completion-service";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import type { PracticeExercise } from "../repositories/exercise-repository";

const { openDatabase } = vi.hoisted(() => ({
  openDatabase: vi.fn(async () => ({ close: vi.fn() })),
}));

vi.mock("../../../infrastructure/indexed-db/database", () => ({
  openVimForgeDatabase: openDatabase,
}));

const { getResumeState, saveAttemptDraft, saveSession } = vi.hoisted(() => ({
  getResumeState: vi.fn(),
  saveAttemptDraft: vi.fn(),
  saveSession: vi.fn(),
}));

vi.mock("../../../infrastructure/indexed-db/session-repository", () => ({
  SessionRepository: vi.fn().mockImplementation(() => ({
    getResumeState,
    saveAttemptDraft,
    save: saveSession,
  })),
}));

const { getPublishedExercise } = vi.hoisted(() => ({
  getPublishedExercise: vi.fn(),
}));

vi.mock("../../../infrastructure/supabase/supabase-exercise-repository", () => ({
  SupabaseExerciseRepository: vi.fn().mockImplementation(() => ({
    getPublishedExercise,
  })),
}));

const { completeAttempt } = vi.hoisted(() => ({
  completeAttempt: vi.fn(),
}));

vi.mock("../services/attempt-completion-service", () => ({
  AttemptCompletionService: vi.fn().mockImplementation(() => ({
    complete: completeAttempt,
  })),
}));

import { usePracticeStore } from "../../../stores/practice-store";
import { useSettingsStore } from "../../../stores/settings-store";
import ResumeSessionDialog from "../components/ResumeSessionDialog.vue";
import PracticePage from "./PracticePage.vue";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const VimEditorStub = {
  name: "VimEditor",
  props: [
    "initialContent",
    "initialCursor",
    "language",
    "showLineNumbers",
    "editorFontSize",
    "autoFocus",
    "readOnly",
    "cursorTarget",
  ],
  emits: [
    "contentChanged",
    "cursorChanged",
    "modeChanged",
    "actionRecorded",
    "editorReady",
    "keyPressed",
  ],
  template: "<div class=\"vim-editor-stub\" />",
};

function getVimEditor(wrapper: VueWrapper) {
  return wrapper.findComponent(VimEditorStub);
}

function findButtonByText(wrapper: VueWrapper, text: string) {
  const button = wrapper
    .findAll("button")
    .find((candidate) => candidate.text() === text);
  if (!button) {
    throw new Error(`No button with text "${text}" found.`);
  }
  return button;
}

function exercise(overrides: Partial<PracticeExercise> = {}): PracticeExercise {
  return {
    id: "exercise-1",
    unitId: "unit-1",
    slug: "fix-name-01",
    title: "修正變數名稱",
    instruction: "將 wrong 修正為 correct。",
    language: "typescript",
    exerciseType: "guided",
    difficulty: "beginner",
    initialContent: "wrong",
    expectedContent: "correct",
    initialCursor: { line: 0, column: 0 },
    completionRule: {
      contentMatch: "exact",
      cursorMatch: { type: "ignore" },
      requiredMode: "normal",
    },
    supportedModes: ["beginner", "memory_review"],
    targetDurationMs: 10_000,
    version: 1,
    skills: [{ skillId: "skill-1", weight: 1, primary: true }],
    solutions: [],
    hints: [],
    ...overrides,
  };
}

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: "session-1",
    learningMode: "beginner",
    selectionType: "course",
    requestedCount: null,
    actualCount: 1,
    status: "active",
    currentIndex: 0,
    exerciseIds: ["exercise-1"],
    selectedSkillIds: [],
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-21T08:00:00.000Z",
    ...overrides,
  };
}

function attemptDraft(overrides: Partial<AttemptDraft> = {}): AttemptDraft {
  return {
    clientAttemptId: "attempt-restored",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "beginner",
    source: "web",
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: null,
    initialContent: "wrong",
    currentContent: "wrong",
    initialCursor: { line: 0, column: 0 },
    currentCursor: { line: 0, column: 0 },
    currentMode: "normal",
    actions: [],
    keystrokeCount: 0,
    mistakeCount: 0,
    lastMistakeFingerprint: null,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    completed: false,
    ...overrides,
  };
}

function attemptSyncInput(
  overrides: Partial<AttemptSyncInput> = {},
): AttemptSyncInput {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "beginner",
    source: "web",
    completed: true,
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: "2026-07-21T08:01:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 1,
    recommendedKeystrokeCount: 1,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: false,
    normalizedActions: [],
    speedScore: 80,
    accuracyScore: 100,
    performanceQuality: 4,
    practiceContext: "different_exercise",
    ...overrides,
  };
}

function completeAttemptResult(
  overrides: Partial<CompleteAttemptResult> = {},
): CompleteAttemptResult {
  return {
    attempt: attemptSyncInput(),
    learningOutcome: {
      clientAttemptId: "attempt-1",
      sessionId: "session-1",
      exerciseId: "exercise-1",
      completedAt: "2026-07-21T08:01:00.000Z",
      skillChanges: [],
      masteryRevisions: [],
      reviewRevision: 1,
      previousDueAt: null,
      nextDueAt: "2026-07-22T08:00:00.000Z",
      projectionSource: "local",
    },
    session: session(),
    ...overrides,
  };
}

async function mountPracticePage(
  options: {
    sessionId?: string;
    seedSession?: boolean;
    exerciseIds?: string[];
  } = {},
) {
  const sessionId = options.sessionId ?? "session-1";
  setActivePinia(createPinia());
  if (options.seedSession ?? true) {
    usePracticeStore().restoreSession(
      session({ id: sessionId, exerciseIds: options.exerciseIds ?? ["exercise-1"] }),
      null,
    );
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/practice/:sessionId", name: "practice", component: PracticePage },
      {
        path: "/practice/:sessionId/result",
        name: "practice-result",
        component: { template: "<div>result</div>" },
      },
      {
        path: "/practice/setup",
        name: "practice-setup",
        component: { template: "<div>setup</div>" },
      },
      { path: "/elsewhere", name: "elsewhere", component: { template: "<div>elsewhere</div>" } },
    ],
  });
  await router.push(`/practice/${sessionId}`);
  await router.isReady();

  // Mounted through a RouterView host (not PracticePage directly) so
  // PracticePage.vue's onBeforeRouteLeave() guard registers against a real
  // matched route record instead of silently no-oping.
  const Host = { template: "<router-view />" };
  const wrapper = mount(Host, {
    global: {
      plugins: [router],
      stubs: { VimEditor: VimEditorStub },
    },
  });
  await flushPromises();

  return { wrapper, router };
}

describe("PracticePage scoring telemetry integration", () => {
  beforeEach(() => {
    // PracticePage.vue's draft-recovery journal (draft-recovery-journal.ts)
    // persists to real jsdom localStorage, which Vitest does not reset
    // between tests in the same file: without this, a leftover journal
    // entry from an earlier test (several of which reuse the same seeded
    // clientAttemptId) could be read back and silently override a later
    // test's deliberately-seeded Draft.
    localStorage.clear();
    openDatabase.mockReset().mockResolvedValue({ close: vi.fn() });
    getResumeState.mockReset().mockResolvedValue(null);
    saveAttemptDraft.mockReset().mockResolvedValue(undefined);
    saveSession.mockReset().mockResolvedValue(undefined);
    getPublishedExercise.mockReset();
    completeAttempt.mockReset().mockResolvedValue(completeAttemptResult());
    // jsdom's requestAnimationFrame polyfill schedules via a ~16ms timeout,
    // which a single zero-delay flushPromises() cannot observe. Resolve it
    // immediately so recordOutcome()'s post-feedback scroll step never
    // leaves isSavingOutcome stuck true across a test's next await.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it("restores keystrokeCount, mistakeCount, and the mistake fingerprint on resume", async () => {
    const draft = attemptDraft({
      currentContent: "still-wrong",
      currentCursor: { line: 0, column: 0 },
      currentMode: "normal",
      keystrokeCount: 5,
      mistakeCount: 2,
      lastMistakeFingerprint: '["still-wrong",0,0,"normal"]',
    });
    getResumeState.mockResolvedValue({ session: session(), attemptDraft: draft });
    getPublishedExercise.mockResolvedValue(exercise());

    const { wrapper } = await mountPracticePage({ seedSession: false });
    await wrapper.get('[data-action="resume"]').trigger("click");
    await flushPromises();

    // Pressing check on the identical (already-recorded) snapshot must not
    // increment mistakeCount: proves lastMistakeFingerprint was restored.
    await wrapper.get('[data-testid="check-result"]').trigger("click");
    await flushPromises();
    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      mistakeCount: 2,
    });

    // A genuinely new failed snapshot increments from the restored baseline
    // (2), not from 0.
    getVimEditor(wrapper).vm.$emit("contentChanged", "still-wrong-2");
    await flushPromises();
    await wrapper.get('[data-testid="check-result"]').trigger("click");
    await flushPromises();
    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      mistakeCount: 3,
    });

    // One keyPressed increments from the restored baseline (5), not from 0.
    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();
    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      keystrokeCount: 6,
    });
  });

  it("always resumes in Normal Mode even if the persisted draft claims otherwise", async () => {
    const draft = attemptDraft({ currentMode: "insert" });
    getResumeState.mockResolvedValue({ session: session(), attemptDraft: draft });
    getPublishedExercise.mockResolvedValue(exercise());

    const { wrapper } = await mountPracticePage({ seedSession: false });
    await wrapper.get('[data-action="resume"]').trigger("click");
    await flushPromises();

    expect(
      wrapper.get(".practice-editor-status-bar").attributes("data-mode"),
    ).toBe("normal");
  });

  function seedJournalEntry(
    sessionIdValue: string,
    operationId: string,
    value: AttemptDraft | null,
  ): void {
    localStorage.setItem(
      `vimforge:draft-recovery:${sessionIdValue}`,
      JSON.stringify({ sessionId: sessionIdValue, operationId, value }),
    );
  }

  it("recovers a Draft from the recovery journal that IndexedDB missed, persists it durably, and clears the journal", async () => {
    const staleDraft = attemptDraft({ keystrokeCount: 1 });
    const recoveredDraft = attemptDraft({ keystrokeCount: 5 });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: staleDraft,
    });
    getPublishedExercise.mockResolvedValue(exercise());
    seedJournalEntry("session-1", "op-1", recoveredDraft);

    await mountPracticePage({ seedSession: false });
    await flushPromises();

    expect(saveAttemptDraft).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ keystrokeCount: 5 }),
    );
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
  });

  it("does not clear the recovery journal when persisting the recovered Draft fails", async () => {
    const staleDraft = attemptDraft({ keystrokeCount: 1 });
    const recoveredDraft = attemptDraft({ keystrokeCount: 5 });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: staleDraft,
    });
    getPublishedExercise.mockResolvedValue(exercise());
    seedJournalEntry("session-1", "op-1", recoveredDraft);
    saveAttemptDraft.mockRejectedValueOnce(new Error("disk full"));

    await mountPracticePage({ seedSession: false });
    await flushPromises();

    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).not.toBeNull();
  });

  it("recovers a pending Retry (a different clientAttemptId) even though IndexedDB still holds the previous Attempt", async () => {
    const persistedDraft = attemptDraft({
      clientAttemptId: "attempt-original",
      keystrokeCount: 40,
    });
    const pendingRetryDraft = attemptDraft({
      clientAttemptId: "attempt-retry",
      keystrokeCount: 0,
      mistakeCount: 0,
      resetCount: 0,
    });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: persistedDraft,
    });
    getPublishedExercise.mockResolvedValue(exercise());
    seedJournalEntry("session-1", "op-retry", pendingRetryDraft);

    await mountPracticePage({ seedSession: false });
    await flushPromises();

    expect(saveAttemptDraft).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ clientAttemptId: "attempt-retry" }),
    );
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
  });

  it("recovers a pending Reset/Abandon tombstone (a null value) even though IndexedDB still holds the previous Draft", async () => {
    const persistedDraft = attemptDraft({ keystrokeCount: 7 });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: persistedDraft,
    });
    getPublishedExercise.mockResolvedValue(exercise());
    seedJournalEntry("session-1", "op-tombstone", null);

    await mountPracticePage({ seedSession: false });
    await flushPromises();

    expect(saveAttemptDraft).toHaveBeenCalledWith("session-1", null);
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
  });

  it("restart writes its recovery journal entry before persisting to IndexedDB, not after", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);

    await wrapper.get(".practice-editor-restart").trigger("click");
    await flushPromises();

    // The IndexedDB write is still pending, but the journal must already
    // reflect the restarted Draft: it was written strictly before the
    // persist call, not after.
    const journalRaw = localStorage.getItem("vimforge:draft-recovery:session-1");
    expect(journalRaw).not.toBeNull();
    const journalEntry = JSON.parse(journalRaw ?? "null") as {
      value: { resetCount: number } | null;
    };
    expect(journalEntry.value?.resetCount).toBe(1);

    deferred.resolve();
    await flushPromises();
  });

  it("resetAttempt writes a tombstone to the recovery journal before persisting, and clears it only after success", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: attemptDraft({ keystrokeCount: 2 }),
    });

    const { wrapper } = await mountPracticePage({ seedSession: false });
    await flushPromises();

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);

    await wrapper.get('[data-action="reset-attempt"]').trigger("click");
    await flushPromises();

    const journalRaw = localStorage.getItem("vimforge:draft-recovery:session-1");
    expect(journalRaw).not.toBeNull();
    const journalEntry = JSON.parse(journalRaw ?? "null") as { value: unknown };
    expect(journalEntry.value).toBeNull();

    deferred.resolve();
    await flushPromises();

    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
  });

  it("increments keystrokeCount exactly once per keyPressed emission", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();

    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      keystrokeCount: 1,
    });
  });

  it("no longer counts a keydown dispatched on the outer workspace element", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    await wrapper.get(".practice-workspace").trigger("keydown", { key: "d" });
    getVimEditor(wrapper).vm.$emit("contentChanged", "still-wrong");
    await flushPromises();

    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      keystrokeCount: 0,
    });
  });

  it("shows the last eight of ten emitted keypresses, in order", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    for (let i = 0; i < 10; i += 1) {
      getVimEditor(wrapper).vm.$emit("keyPressed", `k${i}`);
    }
    await flushPromises();

    const tokens = wrapper.findAll('[data-testid="recent-key"]');
    expect(tokens.map((token) => token.text())).toEqual([
      "k2",
      "k3",
      "k4",
      "k5",
      "k6",
      "k7",
      "k8",
      "k9",
    ]);
    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      keystrokeCount: 10,
    });
  });

  it("hides recent keypresses when the Settings Store disables them, but keeps counting total keystrokes", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();
    useSettingsStore().showKeypresses = false;
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();

    expect(wrapper.find('[aria-label="最近按鍵"]').exists()).toBe(false);
    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      keystrokeCount: 1,
    });
  });

  it("clears recent keys on restart", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();
    expect(wrapper.findAll('[data-testid="recent-key"]')).toHaveLength(1);

    await wrapper.get(".practice-editor-restart").trigger("click");
    await flushPromises();

    expect(wrapper.find('[aria-label="最近按鍵"]').exists()).toBe(false);
  });

  it("clears recent keys on retry", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    await wrapper.get(".retry-exercise-button").trigger("click");
    await flushPromises();

    expect(wrapper.find('[aria-label="最近按鍵"]').exists()).toBe(false);
  });

  it("clears recent keys when advancing to the next exercise", async () => {
    getPublishedExercise
      .mockResolvedValueOnce(exercise())
      .mockResolvedValueOnce(
        exercise({
          id: "exercise-2",
          title: "第二題",
          initialContent: "second",
        }),
      );
    const { wrapper } = await mountPracticePage({
      exerciseIds: ["exercise-1", "exercise-2"],
    });
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    await wrapper.get(".next-exercise-button").trigger("click");
    await flushPromises();

    expect(wrapper.find('[aria-label="最近按鍵"]').exists()).toBe(false);
  });

  it("resumes with no recent keys while preserving the restored keystroke count", async () => {
    const draft = attemptDraft({ keystrokeCount: 5 });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: draft,
    });
    getPublishedExercise.mockResolvedValue(exercise());

    const { wrapper } = await mountPracticePage({ seedSession: false });
    await wrapper.get('[data-action="resume"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[aria-label="最近按鍵"]').exists()).toBe(false);

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();
    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      keystrokeCount: 6,
    });
  });

  it("never includes recent keys in the persisted Draft object", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();

    const savedDraft = saveAttemptDraft.mock.calls.at(-1)?.[1] as Record<
      string,
      unknown
    >;
    expect(savedDraft).not.toHaveProperty("recentKeypresses");
  });

  it("increments mistakeCount on the first failed check", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    await wrapper.get('[data-testid="check-result"]').trigger("click");
    await flushPromises();

    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      mistakeCount: 1,
    });
  });

  it("does not increment mistakeCount for a repeated identical failed snapshot", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    await wrapper.get('[data-testid="check-result"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="check-result"]').trigger("click");
    await flushPromises();

    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      mistakeCount: 1,
    });
  });

  it("increments mistakeCount again once the failed snapshot changes", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    await wrapper.get('[data-testid="check-result"]').trigger("click");
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("contentChanged", "still-wrong");
    await flushPromises();
    await wrapper.get('[data-testid="check-result"]').trigger("click");
    await flushPromises();

    expect(saveAttemptDraft.mock.calls.at(-1)?.[1]).toMatchObject({
      mistakeCount: 2,
    });
  });

  it("auto-submits a correct result without pressing the check button", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("actionRecorded", {
      type: "vim_command",
      command: "x",
    });
    getVimEditor(wrapper).vm.$emit("contentChanged", "correct");
    await flushPromises();

    expect(completeAttempt).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="check-result"]').exists()).toBe(false);
    expect(wrapper.find(".feedback-anchor").exists()).toBe(true);
  });

  it("restart flushes pending persistence, saves before applying, and preserves the Attempt id/start time while incrementing resetCount", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("contentChanged", "still-wrong");
    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);

    await wrapper.get(".practice-editor-restart").trigger("click");
    await flushPromises();

    // The flushed pre-restart save is still in flight: the visible editor
    // state must not change yet.
    expect(getVimEditor(wrapper).props("initialContent")).toBe("still-wrong");

    deferred.resolve();
    await flushPromises();

    expect(getVimEditor(wrapper).props("initialContent")).toBe("wrong");
    const calls = saveAttemptDraft.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const flushedDraft = calls.at(-2)?.[1] as AttemptDraft;
    const restartedDraft = calls.at(-1)?.[1] as AttemptDraft;
    expect(flushedDraft).toMatchObject({
      keystrokeCount: 1,
      currentContent: "still-wrong",
    });
    expect(restartedDraft.clientAttemptId).toBe(flushedDraft.clientAttemptId);
    expect(restartedDraft.startedAt).toBe(flushedDraft.startedAt);
    expect(restartedDraft.resetCount).toBe(1);
    expect(restartedDraft.currentContent).toBe("wrong");
  });

  it("keeps the pre-restart editor state visible when the restart save fails", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("contentChanged", "still-wrong");
    await flushPromises();

    saveAttemptDraft.mockRejectedValueOnce(new Error("disk full"));

    await wrapper.get(".practice-editor-restart").trigger("click");
    await flushPromises();

    expect(getVimEditor(wrapper).props("initialContent")).toBe("still-wrong");
    expect(wrapper.find(".error-message").exists()).toBe(true);
  });

  it("creates a new Attempt (different id, reset telemetry) when retrying after feedback", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();
    const beforeDraft = saveAttemptDraft.mock.calls.at(-1)?.[1] as AttemptDraft;

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    await wrapper.get(".retry-exercise-button").trigger("click");
    await flushPromises();

    const afterDraft = saveAttemptDraft.mock.calls.at(-1)?.[1] as AttemptDraft;
    expect(afterDraft.clientAttemptId).not.toBe(beforeDraft.clientAttemptId);
    expect(afterDraft.keystrokeCount).toBe(0);
    expect(afterDraft.mistakeCount).toBe(0);
    expect(afterDraft.resetCount).toBe(0);
  });

  it("recordOutcome waits for pending Draft persistence before completing the Attempt", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    // recordOutcome's own flush is still awaiting the deferred save: the
    // Attempt has not been completed yet.
    expect(completeAttempt).not.toHaveBeenCalled();

    deferred.resolve();
    await flushPromises();

    expect(completeAttempt).toHaveBeenCalledTimes(1);
  });

  it("recordOutcome aborts before completing the Attempt when its own Draft flush fails, leaving the Draft recoverable", async () => {
    getPublishedExercise.mockResolvedValueOnce(exercise());
    const { wrapper } = await mountPracticePage({
      exerciseIds: ["exercise-1"],
    });
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    // recordOutcome() must flush the pending Draft save first and require
    // it to succeed: proceeding to complete() while a Draft write is
    // unconfirmed is exactly the data-loss shape the recovery-journal
    // tombstone fix closed off (a completed/discarded Draft can no longer be
    // reconstructed from a failed save). So a failed flush must abort
    // outcome recording entirely, not merely be reported.
    saveAttemptDraft.mockRejectedValueOnce(new Error("network blip"));

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    expect(saveAttemptDraft).toHaveBeenCalledTimes(1);
    expect(completeAttempt).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("無法更新本機練習進度，請稍後再試。");

    // The failed save left the scheduler's own retry state dirty. Unmount
    // so this instance's visibilitychange listener and pending dirty state
    // cannot leak into a later test that dispatches that event globally.
    wrapper.unmount();
  });

  it("goToNext still flushes the Draft scheduler defensively and advances normally once outcome recording succeeds", async () => {
    getPublishedExercise
      .mockResolvedValueOnce(exercise())
      .mockResolvedValueOnce(
        exercise({
          id: "exercise-2",
          title: "第二題",
          initialContent: "second",
        }),
      );
    const { wrapper } = await mountPracticePage({
      exerciseIds: ["exercise-1", "exercise-2"],
    });
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    expect(completeAttempt).toHaveBeenCalledTimes(1);
    expect(saveAttemptDraft).toHaveBeenCalledTimes(1);

    // recordOutcome()'s own flush already required success before
    // completing, and feedback showing locks the editor, so no further
    // Draft mutation is possible before "next" is clicked: the scheduler is
    // already clean here. goToNext()'s own flush() call is still made
    // defensively; this proves that call is harmless and advancing still
    // proceeds normally.
    await wrapper.get(".next-exercise-button").trigger("click");
    await flushPromises();

    expect(saveAttemptDraft).toHaveBeenCalledTimes(1);
    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("第二題");
  });

  it("does not write a Draft-only tombstone for completion: a failed complete() leaves the pre-existing Draft recoverable", async () => {
    getPublishedExercise.mockResolvedValueOnce(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");
    await flushPromises();

    // The scheduled Draft save already succeeded and cleared its own
    // journal entry above. Completion touches far more than the Draft (the
    // Attempt, mastery, review, and learning-outcome projections, committed
    // atomically by complete()), so recordOutcome must never write a
    // Draft-only tombstone around it: if it did, a failed complete() below
    // would leave that tombstone in place, and the next reload would delete
    // this still-valid Draft even though nothing was actually completed.
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();

    completeAttempt.mockRejectedValueOnce(new Error("indexeddb transaction aborted"));

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    expect(completeAttempt).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("無法更新本機練習進度，請稍後再試。");
    expect(usePracticeStore().attemptDraft).not.toBeNull();
    expect(saveAttemptDraft).not.toHaveBeenCalledWith("session-1", null);
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
  });

  it("completes and discards the Draft atomically on success, leaving no stale journal entry behind", async () => {
    getPublishedExercise.mockResolvedValueOnce(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    expect(completeAttempt).toHaveBeenCalledTimes(1);
    expect(usePracticeStore().attemptDraft).toBeNull();
    expect(saveAttemptDraft).not.toHaveBeenCalledWith("session-1", null);
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
  });

  it("does not write a Draft-only tombstone for abandon: a failed save() leaves the session active and the Draft recoverable", async () => {
    const persistedDraft = attemptDraft({ keystrokeCount: 3 });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: persistedDraft,
    });
    getPublishedExercise.mockResolvedValue(exercise());

    const { wrapper } = await mountPracticePage({ seedSession: false });
    await flushPromises();

    const store = usePracticeStore();
    const sessionBefore = structuredClone(store.session);
    const draftBefore = structuredClone(store.attemptDraft);

    saveSession.mockRejectedValueOnce(new Error("indexeddb write failed"));

    await findButtonByText(wrapper, "放棄題組").trigger("click");
    await flushPromises();

    expect(saveSession).toHaveBeenCalledTimes(1);
    const [persistedSessionArg] = saveSession.mock.calls[0] as [
      PracticeSession,
      unknown,
    ];
    expect(persistedSessionArg.status).toBe("abandoned");
    expect(wrapper.text()).toContain("無法更新本機練習進度，請稍後再試。");
    expect(wrapper.text()).not.toContain("已放棄這個題組");
    // No Draft-only tombstone is ever written for abandon: a failed save()
    // must leave nothing behind that a later reload could misapply against
    // the pre-existing Draft still durable in IndexedDB.
    expect(saveAttemptDraft).not.toHaveBeenCalledWith("session-1", null);
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
    // The in-memory application state must be just as untouched as the
    // durable state: abandonSession() must not mutate the Pinia store
    // before the IndexedDB save has actually succeeded, or a failed save
    // leaves the UI believing the session was abandoned even though it
    // durably was not.
    expect(store.session).toEqual(sessionBefore);
    expect(store.attemptDraft).toEqual(draftBefore);
    expect(wrapper.findComponent(ResumeSessionDialog).exists()).toBe(
      true,
    );
  });

  it("clears the local session and Draft only after the abandoned session's save() resolves", async () => {
    const persistedDraft = attemptDraft({ keystrokeCount: 3 });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: persistedDraft,
    });
    getPublishedExercise.mockResolvedValue(exercise());

    const { wrapper } = await mountPracticePage({ seedSession: false });
    await flushPromises();

    const store = usePracticeStore();
    const sessionBefore = structuredClone(store.session);
    const draftBefore = structuredClone(store.attemptDraft);

    const deferred = createDeferred<void>();
    saveSession.mockImplementationOnce(() => deferred.promise);

    await findButtonByText(wrapper, "放棄題組").trigger("click");
    await flushPromises();

    // The save is still pending: local state must not have moved yet.
    expect(store.session).toEqual(sessionBefore);
    expect(store.attemptDraft).toEqual(draftBefore);
    expect(wrapper.findComponent(ResumeSessionDialog).exists()).toBe(
      true,
    );
    expect(wrapper.text()).not.toContain("已放棄這個題組");

    deferred.resolve();
    await flushPromises();

    expect(store.session).toBeNull();
    expect(store.attemptDraft).toBeNull();
    expect(wrapper.findComponent(ResumeSessionDialog).exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("已放棄這個題組");
  });

  it("persists the abandoned session on success with no stale Draft journal entry left behind", async () => {
    const persistedDraft = attemptDraft({ keystrokeCount: 3 });
    getResumeState.mockResolvedValue({
      session: session(),
      attemptDraft: persistedDraft,
    });
    getPublishedExercise.mockResolvedValue(exercise());

    const { wrapper } = await mountPracticePage({ seedSession: false });
    await flushPromises();

    await findButtonByText(wrapper, "放棄題組").trigger("click");
    await flushPromises();

    expect(saveSession).toHaveBeenCalledTimes(1);
    const [persistedSessionArg] = saveSession.mock.calls[0] as [
      PracticeSession,
      unknown,
    ];
    expect(persistedSessionArg.status).toBe("abandoned");
    expect(wrapper.text()).toContain("已放棄這個題組");
    expect(saveAttemptDraft).not.toHaveBeenCalledWith("session-1", null);
    expect(
      localStorage.getItem("vimforge:draft-recovery:session-1"),
    ).toBeNull();
  });

  it("waits for the pending draft before leaving the route", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper, router } = await mountPracticePage();
    await flushPromises();

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);
    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    const navigationPromise = router.push("/elsewhere");
    let navigationResolved = false;
    void navigationPromise.then(() => {
      navigationResolved = true;
    });

    // Give the route guard and Draft save every chance to run. This is safe
    // to wait out fully (not just a couple of microtask ticks): while the
    // guard is genuinely blocked on `deferred`, nothing here can make
    // navigationResolved become true early, since `deferred` only settles
    // when this test calls deferred.resolve() below.
    await flushPromises();

    expect(saveAttemptDraft).toHaveBeenCalledTimes(1);
    expect(navigationResolved).toBe(false);
    expect(router.currentRoute.value.name).toBe("practice");

    deferred.resolve();
    await navigationPromise;
    await flushPromises();

    expect(navigationResolved).toBe(true);
    expect(router.currentRoute.value.name).toBe("elsewhere");
    const savedDraft = saveAttemptDraft.mock.calls.at(-1)?.[1] as AttemptDraft;
    expect(savedDraft).toMatchObject({ keystrokeCount: 1 });
  });

  it("flushes the pending draft immediately when the document becomes hidden", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);
    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    const visibilityStateSpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    try {
      expect(saveAttemptDraft).not.toHaveBeenCalled();

      document.dispatchEvent(new Event("visibilitychange"));

      // No await here: handleVisibilityChange() calls flush() synchronously,
      // and flush() enters runLoop() far enough to invoke saveAttemptDraft()
      // before yielding, without waiting for the scheduler's own queued
      // microtask.
      expect(saveAttemptDraft).toHaveBeenCalledTimes(1);
      const savedDraft = saveAttemptDraft.mock.calls[0]?.[1] as AttemptDraft;
      expect(savedDraft).toMatchObject({ keystrokeCount: 1 });

      deferred.resolve();
      await flushPromises();
    } finally {
      visibilityStateSpy.mockRestore();
    }
  });

  it("disposes the scheduler and closes the database only after dispose settles", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const closeSpy = vi.fn();
    openDatabase.mockResolvedValueOnce({ close: closeSpy });
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);

    wrapper.unmount();
    await flushPromises();

    expect(closeSpy).not.toHaveBeenCalled();

    deferred.resolve();
    await flushPromises();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
