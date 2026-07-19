import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import type {
  PracticeCandidateListOptions,
  PracticeCandidateRecord,
} from "../repositories/practice-candidate-repository";
import type { PracticeSession } from "../../../types/session";
import { topicSkillSlugs } from "../data/topic-definitions";

const { listPublishedCandidates, listAll, save, openDatabase } = vi.hoisted(
  () => ({
    listPublishedCandidates: vi.fn<
      (
        options: PracticeCandidateListOptions,
      ) => Promise<readonly PracticeCandidateRecord[]>
    >(),
    listAll: vi.fn<() => Promise<readonly AttemptSyncInput[]>>(),
    save: vi.fn<
      (session: PracticeSession, attemptDraft?: null) => Promise<void>
    >(),
    openDatabase: vi.fn(async () => ({ close: vi.fn() })),
  }),
);

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

vi.mock("../../../infrastructure/indexed-db/session-repository", () => ({
  SessionRepository: vi.fn().mockImplementation(() => ({
    save,
  })),
}));

import PracticeSetupPage from "./PracticeSetupPage.vue";

function candidateRecord(
  overrides: Partial<PracticeCandidateRecord> = {},
): PracticeCandidateRecord {
  return {
    exerciseId: "exercise-1",
    unitId: "unit-1",
    exerciseSlug: "exercise-1",
    skillIds: ["skill-1"],
    skillSlugs: ["basic-motion"],
    learningModes: ["memory_review"],
    difficulty: "beginner",
    displayOrder: 1,
    ...overrides,
  };
}

function attemptRecord(
  overrides: Partial<AttemptSyncInput> = {},
): AttemptSyncInput {
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

async function mountSetupPage(mode: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/practice/setup",
        name: "practice-setup",
        component: PracticeSetupPage,
      },
      { path: "/courses", name: "courses", component: { template: "<div />" } },
      {
        path: "/practice/:sessionId",
        name: "practice",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push({
    name: "practice-setup",
    query: { mode },
  });
  await router.isReady();

  const wrapper = mount(PracticeSetupPage, {
    global: { plugins: [createPinia(), router] },
  });
  return { wrapper, router };
}

describe("PracticeSetupPage", () => {
  beforeEach(() => {
    listPublishedCandidates.mockReset();
    listAll.mockReset().mockResolvedValue([]);
    save.mockReset().mockResolvedValue(undefined);
    openDatabase.mockReset().mockResolvedValue({ close: vi.fn() });
  });

  it("shows 5, 10, and 20 questions with 10 selected by default", async () => {
    const { wrapper } = await mountSetupPage("memory_review");
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
  });

  it("offers daily review and topic practice for memory review", async () => {
    const { wrapper } = await mountSetupPage("memory_review");

    expect(wrapper.text()).toContain("今日複習");
    expect(wrapper.text()).toContain("指定主題");
    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(false);

    await wrapper.get('input[value="topic_practice"]').setValue();

    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "至少選擇一個主題",
    );

    await wrapper.get('input[value="search"]').setValue();
    await wrapper.get('input[value="text-objects"]').setValue();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('input[value="search"]').element).toMatchObject({
      checked: true,
    });
    expect(wrapper.get('input[value="text-objects"]').element).toMatchObject({
      checked: true,
    });
  });

  it("shows question count and optional topics for efficiency mode", async () => {
    const { wrapper } = await mountSetupPage("efficiency");

    expect(wrapper.find('[data-testid="question-count-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="practice-source-selector"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("可選主題");
  });

  it("offers course units without forcing a question count for beginners", async () => {
    const { wrapper } = await mountSetupPage("beginner");

    expect(wrapper.find('[data-testid="question-count-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="practice-source-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="topic-selector"]').exists()).toBe(false);
    expect(wrapper.get('a[href="/courses"]').text()).toContain("選擇課程單元");
  });

  it("sends the selected mode, count, and topics to the candidate repository and starts the session", async () => {
    listPublishedCandidates.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) =>
        candidateRecord({
          exerciseId: `text-object-${index + 1}`,
          skillIds: ["skill-text-object"],
          skillSlugs: ["word-text-object"],
          learningModes: ["efficiency"],
        }),
      ),
    );
    listAll.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) =>
        attemptRecord({
          clientAttemptId: `attempt-${index + 1}`,
          exerciseId: `text-object-${index + 1}`,
          learningMode: "efficiency",
          completed: false,
        }),
      ),
    );

    const { wrapper, router } = await mountSetupPage("efficiency");
    await wrapper.get('input[value="5"]').setValue();
    await wrapper.get('input[value="text-objects"]').setValue();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(listPublishedCandidates).toHaveBeenCalledWith({
      learningMode: "efficiency",
      skillSlugs: topicSkillSlugs(["text-objects"]),
    });
    expect(save).toHaveBeenCalledTimes(1);
    const [savedSession] = save.mock.calls[0] ?? [];
    expect(savedSession?.learningMode).toBe("efficiency");
    expect(savedSession?.selectionType).toBe("topic_practice");
    expect(savedSession?.requestedCount).toBe(5);
    expect(savedSession?.exerciseIds).toHaveLength(5);
    expect(router.currentRoute.value.name).toBe("practice");
    expect(router.currentRoute.value.params.sessionId).toBe(savedSession?.id);
  });

  it("previews the partial match, then creates the session only after confirming", async () => {
    listPublishedCandidates.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) =>
        candidateRecord({
          exerciseId: `due-${index + 1}`,
          skillIds: ["skill-shared"],
        }),
      ),
    );
    listAll.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) =>
        attemptRecord({
          clientAttemptId: `attempt-${index + 1}`,
          exerciseId: `due-${index + 1}`,
          completed: false,
        }),
      ),
    );

    const { wrapper, router } = await mountSetupPage("memory_review");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "目前符合條件的題目共有 3 題，本次將安排全部可用題目。",
    );
    expect(save).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe("practice-setup");
    expect(wrapper.get("button").text()).toBe("使用這些題目開始練習");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(save).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe("practice");
  });

  it("shows a topic-empty message when the selected topic has no matching exercises", async () => {
    listPublishedCandidates.mockResolvedValue([]);
    listAll.mockResolvedValue([]);

    const { wrapper } = await mountSetupPage("efficiency");
    await wrapper.get('input[value="text-objects"]').setValue();
    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "目前選取的主題尚無可用題目，請選擇其他主題。",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("shows an unable-to-read-history message when daily review has no personalization signal", async () => {
    listPublishedCandidates.mockResolvedValue([
      candidateRecord({ exerciseId: "exercise-1", skillIds: ["skill-1"] }),
    ]);
    listAll.mockResolvedValue([]);

    const { wrapper } = await mountSetupPage("memory_review");
    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "無法讀取學習紀錄，暫時不能建立今日複習。",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("previews the general-fallback message, then creates the session only after confirming", async () => {
    listPublishedCandidates.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        candidateRecord({
          exerciseId: `general-${index + 1}`,
          skillIds: [`skill-${index + 1}`],
          skillSlugs: [`skill-slug-${index + 1}`],
          learningModes: ["efficiency"],
        }),
      ),
    );
    listAll.mockResolvedValue([]);

    const { wrapper, router } = await mountSetupPage("efficiency");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(listPublishedCandidates).toHaveBeenCalledWith({
      learningMode: "efficiency",
    });
    expect(wrapper.text()).toContain(
      "尚無個人練習資料，本次先安排一般效率題目。",
    );
    expect(save).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe("practice-setup");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(save).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe("practice");
  });

  it("shows both the fallback and partial-match messages when they overlap", async () => {
    listPublishedCandidates.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) =>
        candidateRecord({
          exerciseId: `general-${index + 1}`,
          skillIds: [`skill-${index + 1}`],
          skillSlugs: [`skill-slug-${index + 1}`],
          learningModes: ["efficiency"],
        }),
      ),
    );
    listAll.mockResolvedValue([]);

    const { wrapper } = await mountSetupPage("efficiency");
    await wrapper.get('input[value="20"]').setValue();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "尚無個人練習資料，本次先安排一般效率題目。",
    );
    expect(wrapper.text()).toContain(
      "目前符合條件的題目共有 3 題，本次將安排全部可用題目。",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("ignores a second click on the confirm step while the session is being created", async () => {
    listPublishedCandidates.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) =>
        candidateRecord({
          exerciseId: `due-${index + 1}`,
          skillIds: ["skill-shared"],
        }),
      ),
    );
    listAll.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) =>
        attemptRecord({
          clientAttemptId: `attempt-${index + 1}`,
          exerciseId: `due-${index + 1}`,
          completed: false,
        }),
      ),
    );

    const { wrapper } = await mountSetupPage("memory_review");

    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(wrapper.get("button").text()).toBe("使用這些題目開始練習");

    const confirmButton = wrapper.get("button");
    void confirmButton.trigger("click");
    void confirmButton.trigger("click");
    await flushPromises();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("ignores a second click on the selection step while it is still resolving", async () => {
    listPublishedCandidates.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        candidateRecord({
          exerciseId: `due-${index + 1}`,
          skillIds: ["skill-shared"],
        }),
      ),
    );
    listAll.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        attemptRecord({
          clientAttemptId: `attempt-${index + 1}`,
          exerciseId: `due-${index + 1}`,
          completed: false,
        }),
      ),
    );

    const { wrapper } = await mountSetupPage("memory_review");
    const button = wrapper.get("button");
    void button.trigger("click");
    void button.trigger("click");
    await flushPromises();

    expect(listPublishedCandidates).toHaveBeenCalledTimes(1);
    expect(listAll).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
