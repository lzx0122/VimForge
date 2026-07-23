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
    "showKeypresses",
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

  it("finishes persisting the draft before advancing to the next exercise", async () => {
    getPublishedExercise
      .mockResolvedValueOnce(exercise())
      .mockResolvedValueOnce(
        exercise({ id: "exercise-2", initialContent: "second" }),
      );
    const { wrapper } = await mountPracticePage({
      exerciseIds: ["exercise-1", "exercise-2"],
    });
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    const deferred = createDeferred<void>();
    saveAttemptDraft.mockImplementationOnce(() => deferred.promise);

    await findButtonByText(wrapper, "跳過這題").trigger("click");
    await flushPromises();

    // recordOutcome's flush is still awaiting the deferred save: no outcome
    // has been recorded and no session advance has happened yet.
    expect(completeAttempt).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();

    deferred.resolve();
    await flushPromises();

    expect(completeAttempt).toHaveBeenCalledTimes(1);

    await wrapper.get(".next-exercise-button").trigger("click");
    await flushPromises();

    expect(saveSession).toHaveBeenCalledTimes(1);
  });

  it("flushes the pending draft when leaving the route via onBeforeRouteLeave", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper, router } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    await router.push("/elsewhere");
    await flushPromises();

    const draft = saveAttemptDraft.mock.calls.at(-1)?.[1] as AttemptDraft;
    expect(draft).toMatchObject({ keystrokeCount: 1 });
  });

  it("flushes the pending draft when the document becomes hidden", async () => {
    getPublishedExercise.mockResolvedValue(exercise());
    const { wrapper } = await mountPracticePage();
    await flushPromises();

    getVimEditor(wrapper).vm.$emit("keyPressed", "d");

    const visibilityStateSpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      await flushPromises();

      const draft = saveAttemptDraft.mock.calls.at(-1)?.[1] as AttemptDraft;
      expect(draft).toMatchObject({ keystrokeCount: 1 });
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
