import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptSyncInput } from "../../practice/repositories/attempt-sync-repository";
import type {
  PracticeCandidateListOptions,
  PracticeCandidateRecord,
} from "../../practice/repositories/practice-candidate-repository";

const { listPublishedCandidates, listAll, openDatabase } = vi.hoisted(() => ({
  listPublishedCandidates: vi.fn<
    (
      options: PracticeCandidateListOptions,
    ) => Promise<readonly PracticeCandidateRecord[]>
  >(),
  listAll: vi.fn<() => Promise<readonly AttemptSyncInput[]>>(),
  openDatabase: vi.fn(async () => ({ close: vi.fn() })),
}));

vi.mock(
  "../../../infrastructure/supabase/supabase-practice-candidate-repository",
  () => ({
    SupabasePracticeCandidateRepository: vi.fn().mockImplementation(() => ({
      listPublishedCandidates,
    })),
  }),
);

vi.mock("../../../infrastructure/indexed-db/attempt-repository", () => ({
  AttemptRepository: vi.fn().mockImplementation(() => ({
    listAll,
  })),
}));

vi.mock("../../../infrastructure/indexed-db/database", () => ({
  openVimForgeDatabase: openDatabase,
}));

import ReviewPage from "./ReviewPage.vue";

function candidate(
  overrides: Partial<PracticeCandidateRecord> = {},
): PracticeCandidateRecord {
  return {
    exerciseId: "exercise-1",
    unitId: "unit-1",
    exerciseSlug: "exercise-1",
    skillIds: ["skill-1"],
    skillSlugs: ["inner-text-object"],
    learningModes: ["memory_review"],
    difficulty: "beginner",
    displayOrder: 1,
    ...overrides,
  };
}

function attempt(overrides: Partial<AttemptSyncInput> = {}): AttemptSyncInput {
  return {
    clientAttemptId: `attempt-${Math.random().toString(36).slice(2)}`,
    sessionId: null,
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: false,
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: null,
    durationMs: null,
    keystrokeCount: 0,
    recommendedKeystrokeCount: null,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: false,
    normalizedActions: [],
    speedScore: 0,
    accuracyScore: 0,
    performanceQuality: 1,
    practiceContext: "different_exercise",
    ...overrides,
  };
}

async function mountReviewPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/review", name: "review", component: ReviewPage },
      {
        path: "/practice/setup",
        name: "practice-setup",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push("/review");
  await router.isReady();

  return mount(ReviewPage, {
    global: { plugins: [router] },
  });
}

describe("ReviewPage", () => {
  beforeEach(() => {
    listPublishedCandidates.mockReset();
    listAll.mockReset();
    openDatabase.mockReset().mockResolvedValue({ close: vi.fn() });
  });

  it("shows a loading state before the summary resolves", async () => {
    listPublishedCandidates.mockReturnValue(new Promise(() => {}));
    listAll.mockReturnValue(new Promise(() => {}));

    const wrapper = await mountReviewPage();

    expect(wrapper.text()).toContain("正在載入複習資料…");
  });

  it("shows the due count and primary weak skills", async () => {
    listPublishedCandidates.mockResolvedValue([
      candidate({
        exerciseId: "incorrect-1",
        skillIds: ["skill-text-object"],
        skillSlugs: ["inner-text-object"],
      }),
      candidate({
        exerciseId: "weak-1",
        skillIds: ["skill-movement"],
        skillSlugs: ["basic-motion"],
      }),
      candidate({
        exerciseId: "weak-2",
        skillIds: ["skill-movement"],
        skillSlugs: ["basic-motion"],
      }),
    ]);
    listAll.mockResolvedValue([
      attempt({
        clientAttemptId: "incorrect-attempt",
        exerciseId: "incorrect-1",
        completed: false,
      }),
      attempt({
        clientAttemptId: "weak-attempt-1",
        exerciseId: "weak-1",
        completed: true,
        accuracyScore: 40,
      }),
      attempt({
        clientAttemptId: "weak-attempt-2",
        exerciseId: "weak-2",
        completed: true,
        accuracyScore: 45,
      }),
    ]);

    const wrapper = await mountReviewPage();
    await flushPromises();

    expect(wrapper.get('[data-testid="due-count"]').text()).toBe("1");
    expect(wrapper.get('[aria-labelledby="weak-skills-title"]').text()).toContain(
      "基礎移動",
    );
    expect(wrapper.text()).toContain("2 題相關練習");
  });

  it("offers 5, 10, and 20 questions with 10 selected by default", async () => {
    listPublishedCandidates.mockResolvedValue([]);
    listAll.mockResolvedValue([attempt({ completed: false })]);

    const wrapper = await mountReviewPage();
    await flushPromises();

    const selector = wrapper.get('[data-testid="question-count-selector"]');
    const inputs = selector.findAll('input[type="radio"]');

    expect(inputs.map((input) => input.attributes("value"))).toEqual([
      "5",
      "10",
      "20",
    ]);
    expect(selector.get('input[value="10"]').element).toMatchObject({
      checked: true,
    });

    await selector.get('input[value="20"]').setValue();

    expect(selector.get('input[value="20"]').element).toMatchObject({
      checked: true,
    });
    expect(wrapper.get('[data-testid="selected-review-count"]').text()).toBe(
      "20",
    );
  });

  it("recommends a beginner course when there is no learning history", async () => {
    listPublishedCandidates.mockResolvedValue([]);
    listAll.mockResolvedValue([]);

    const wrapper = await mountReviewPage();
    await flushPromises();

    expect(wrapper.text()).toContain("尚無練習紀錄");
    expect(wrapper.text()).toContain("基礎題組");
    expect(wrapper.get('a[href="/practice/setup?mode=beginner"]').text()).toContain(
      "開始基礎題組",
    );
    expect(wrapper.find('[data-testid="question-count-selector"]').exists()).toBe(
      false,
    );
  });

  it("shows a retryable error state when loading the summary fails", async () => {
    listPublishedCandidates.mockRejectedValueOnce(new Error("network down"));
    listAll.mockResolvedValue([]);

    const wrapper = await mountReviewPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "暫時無法讀取複習資料，請稍後重試。",
    );

    listPublishedCandidates.mockResolvedValueOnce([candidate()]);
    listAll.mockResolvedValueOnce([attempt({ completed: false })]);
    await wrapper.get('[data-testid="review-retry"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="due-count"]').text()).toBe("1");
  });
});
