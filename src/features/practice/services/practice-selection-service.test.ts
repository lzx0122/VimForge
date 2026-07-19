import { describe, expect, it, vi } from "vitest";

import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import type {
  PracticeCandidateListOptions,
  PracticeCandidateRecord,
  PracticeCandidateRepository,
} from "../repositories/practice-candidate-repository";
import { PracticeSelectionService } from "./practice-selection-service";

function candidate(
  overrides: Partial<PracticeCandidateRecord> = {},
): PracticeCandidateRecord {
  return {
    exerciseId: "exercise-1",
    unitId: "unit-1",
    exerciseSlug: "exercise-1",
    skillIds: ["skill-1"],
    skillSlugs: ["normal-insert-switch"],
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
    completed: true,
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: "2026-07-19T08:01:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 5,
    recommendedKeystrokeCount: 5,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [],
    speedScore: 95,
    accuracyScore: 95,
    performanceQuality: 5,
    practiceContext: "different_exercise",
    ...overrides,
  };
}

function createCandidateRepository(
  candidates: readonly PracticeCandidateRecord[],
): PracticeCandidateRepository {
  return {
    listPublishedCandidates: vi.fn<
      (
        options: PracticeCandidateListOptions,
      ) => Promise<readonly PracticeCandidateRecord[]>
    >(async () => candidates),
  };
}

function createAttemptRepository(attempts: readonly AttemptSyncInput[]) {
  return {
    listAll: vi.fn(async () => attempts),
  };
}

const LOCAL_DATE = "2026-07-19";

describe("PracticeSelectionService", () => {
  describe("daily review", () => {
    it.each([
      { questionCount: 5 as const, due: 3, weak: 1, familiar: 1 },
      { questionCount: 10 as const, due: 7, weak: 2, familiar: 1 },
      { questionCount: 20 as const, due: 14, weak: 4, familiar: 2 },
    ])(
      "selects $questionCount exercises as $due/$weak/$familiar",
      async ({ questionCount, due, weak, familiar }) => {
        const dueCandidates = Array.from({ length: 20 }, (_, index) =>
          candidate({ exerciseId: `due-${index + 1}`, skillIds: ["skill-shared"] }),
        );
        const weakCandidates = Array.from({ length: 20 }, (_, index) =>
          candidate({ exerciseId: `weak-${index + 1}`, skillIds: ["skill-shared"] }),
        );
        const familiarCandidates = Array.from({ length: 20 }, (_, index) =>
          candidate({
            exerciseId: `familiar-${index + 1}`,
            skillIds: ["skill-shared"],
          }),
        );
        const allCandidates = [
          ...dueCandidates,
          ...weakCandidates,
          ...familiarCandidates,
        ];

        const attempts = [
          ...dueCandidates.map((c) =>
            attempt({
              clientAttemptId: `${c.exerciseId}-attempt`,
              exerciseId: c.exerciseId,
              completed: false,
              accuracyScore: 40,
              speedScore: 40,
            }),
          ),
          ...weakCandidates.map((c) =>
            attempt({
              clientAttemptId: `${c.exerciseId}-attempt`,
              exerciseId: c.exerciseId,
              completed: true,
              accuracyScore: 40,
              speedScore: 40,
            }),
          ),
          ...familiarCandidates.flatMap((c) => [
            attempt({
              clientAttemptId: `${c.exerciseId}-attempt-1`,
              exerciseId: c.exerciseId,
              completed: true,
              accuracyScore: 95,
              speedScore: 95,
            }),
            attempt({
              clientAttemptId: `${c.exerciseId}-attempt-2`,
              exerciseId: c.exerciseId,
              completed: true,
              accuracyScore: 95,
              speedScore: 95,
            }),
          ]),
        ];

        const service = new PracticeSelectionService(
          createCandidateRepository(allCandidates),
          createAttemptRepository(attempts),
        );

        const result = await service.select({
          learningMode: "memory_review",
          selectionType: "daily_review",
          questionCount,
          selectedTopicSlugs: [],
          localDate: LOCAL_DATE,
        });

        expect(result.exerciseIds).toHaveLength(questionCount);
        expect(
          result.exerciseIds.filter((id) => id.startsWith("due-")),
        ).toHaveLength(due);
        expect(
          result.exerciseIds.filter((id) => id.startsWith("weak-")),
        ).toHaveLength(weak);
        expect(
          result.exerciseIds.filter((id) => id.startsWith("familiar-")),
        ).toHaveLength(familiar);
        expect(result.personalized).toBe(true);
        expect(result.requestedCount).toBe(questionCount);
        expect(result.actualCount).toBe(questionCount);
        expect(new Set(result.exerciseIds).size).toBe(result.exerciseIds.length);
      },
    );

    it("returns an empty selection when the learner has no history", async () => {
      const candidates = [
        candidate({ exerciseId: "exercise-a" }),
        candidate({ exerciseId: "exercise-b" }),
      ];
      const service = new PracticeSelectionService(
        createCandidateRepository(candidates),
        createAttemptRepository([]),
      );

      const result = await service.select({
        learningMode: "memory_review",
        selectionType: "daily_review",
        questionCount: 10,
        selectedTopicSlugs: [],
        localDate: LOCAL_DATE,
      });

      expect(result.exerciseIds).toEqual([]);
      expect(result.actualCount).toBe(0);
      expect(result.requestedCount).toBe(10);
      expect(result.personalized).toBe(false);
    });
  });

  describe("topic practice", () => {
    it("uses createTopicPracticePlan, ranking unattempted exercises before repeated ones", async () => {
      const unattempted = candidate({
        exerciseId: "text-object-unattempted",
        skillIds: ["skill-text-1"],
        skillSlugs: ["quoted-text-object"],
      });
      const repeated = candidate({
        exerciseId: "text-object-repeated",
        skillIds: ["skill-text-2"],
        skillSlugs: ["inner-text-object"],
      });
      const outOfTopic = candidate({
        exerciseId: "movement-exercise",
        skillIds: ["skill-movement"],
        skillSlugs: ["basic-motion"],
      });

      const attempts = [
        attempt({
          clientAttemptId: "repeated-attempt-1",
          exerciseId: "text-object-repeated",
          completed: true,
          accuracyScore: 95,
          speedScore: 95,
        }),
        attempt({
          clientAttemptId: "repeated-attempt-2",
          exerciseId: "text-object-repeated",
          completed: true,
          accuracyScore: 95,
          speedScore: 95,
        }),
      ];

      const service = new PracticeSelectionService(
        createCandidateRepository([unattempted, repeated, outOfTopic]),
        createAttemptRepository(attempts),
      );

      const result = await service.select({
        learningMode: "efficiency",
        selectionType: "topic_practice",
        questionCount: 5,
        selectedTopicSlugs: ["text-objects"],
        localDate: LOCAL_DATE,
      });

      expect(result.exerciseIds).toEqual([
        "text-object-unattempted",
        "text-object-repeated",
      ]);
      expect(result.exerciseIds).not.toContain("movement-exercise");
    });
  });

  describe("weakness practice", () => {
    it("prioritizes the weak pool ahead of due-or-incorrect and familiar candidates", async () => {
      const due = candidate({ exerciseId: "due-1", skillIds: ["skill-shared"] });
      const weak = candidate({ exerciseId: "weak-1", skillIds: ["skill-shared"] });
      const familiar = candidate({
        exerciseId: "familiar-1",
        skillIds: ["skill-shared"],
      });

      const attempts = [
        attempt({
          clientAttemptId: "due-attempt",
          exerciseId: "due-1",
          completed: false,
          accuracyScore: 40,
          speedScore: 40,
        }),
        attempt({
          clientAttemptId: "weak-attempt",
          exerciseId: "weak-1",
          completed: true,
          accuracyScore: 40,
          speedScore: 40,
        }),
        attempt({
          clientAttemptId: "familiar-attempt-1",
          exerciseId: "familiar-1",
          completed: true,
          accuracyScore: 95,
          speedScore: 95,
        }),
        attempt({
          clientAttemptId: "familiar-attempt-2",
          exerciseId: "familiar-1",
          completed: true,
          accuracyScore: 95,
          speedScore: 95,
        }),
      ];

      const service = new PracticeSelectionService(
        createCandidateRepository([due, weak, familiar]),
        createAttemptRepository(attempts),
      );

      const result = await service.select({
        learningMode: "efficiency",
        selectionType: "weakness_practice",
        questionCount: 5,
        selectedTopicSlugs: [],
        localDate: LOCAL_DATE,
      });

      expect(result.exerciseIds[0]).toBe("weak-1");
      expect(result.exerciseIds).toHaveLength(3);
    });

    it("returns general candidates with personalized:false when the learner has no history", async () => {
      const candidates = Array.from({ length: 10 }, (_, index) =>
        candidate({ exerciseId: `general-${index + 1}`, displayOrder: index + 1 }),
      );
      const service = new PracticeSelectionService(
        createCandidateRepository(candidates),
        createAttemptRepository([]),
      );

      const result = await service.select({
        learningMode: "efficiency",
        selectionType: "weakness_practice",
        questionCount: 5,
        selectedTopicSlugs: [],
        localDate: LOCAL_DATE,
      });

      expect(result.personalized).toBe(false);
      expect(result.exerciseIds).toHaveLength(5);
      expect(result.actualCount).toBe(5);
    });
  });

  describe("availability limits", () => {
    it("returns fewer exercises than requested when fewer candidates are available", async () => {
      const dueCandidates = Array.from({ length: 13 }, (_, index) =>
        candidate({
          exerciseId: `due-${index + 1}`,
          skillIds: ["skill-shared"],
        }),
      );
      const attempts = dueCandidates.map((c) =>
        attempt({
          clientAttemptId: `${c.exerciseId}-attempt`,
          exerciseId: c.exerciseId,
          completed: false,
        }),
      );

      const service = new PracticeSelectionService(
        createCandidateRepository(dueCandidates),
        createAttemptRepository(attempts),
      );

      const result = await service.select({
        learningMode: "memory_review",
        selectionType: "daily_review",
        questionCount: 20,
        selectedTopicSlugs: [],
        localDate: LOCAL_DATE,
      });

      expect(result.requestedCount).toBe(20);
      expect(result.actualCount).toBe(13);
      expect(result.exerciseIds).toHaveLength(13);
    });
  });

  describe("date-based determinism", () => {
    it("produces the same selection for the same local date", async () => {
      const candidates = Array.from({ length: 5 }, (_, index) =>
        candidate({ exerciseId: `general-${index + 1}` }),
      );
      const service = new PracticeSelectionService(
        createCandidateRepository(candidates),
        createAttemptRepository([]),
      );
      const request = {
        learningMode: "efficiency" as const,
        selectionType: "weakness_practice" as const,
        questionCount: 5 as const,
        selectedTopicSlugs: [],
        localDate: LOCAL_DATE,
      };

      const first = await service.select(request);
      const second = await service.select(request);

      expect(second.exerciseIds).toEqual(first.exerciseIds);
    });

    it("produces a different tie order on a different local date", async () => {
      const candidates = Array.from({ length: 5 }, (_, index) =>
        candidate({ exerciseId: `general-${index + 1}` }),
      );
      const service = new PracticeSelectionService(
        createCandidateRepository(candidates),
        createAttemptRepository([]),
      );

      const today = await service.select({
        learningMode: "efficiency",
        selectionType: "weakness_practice",
        questionCount: 5,
        selectedTopicSlugs: [],
        localDate: "2026-07-19",
      });
      const nextMonth = await service.select({
        learningMode: "efficiency",
        selectionType: "weakness_practice",
        questionCount: 5,
        selectedTopicSlugs: [],
        localDate: "2026-08-19",
      });

      expect(nextMonth.exerciseIds).not.toEqual(today.exerciseIds);
      expect([...nextMonth.exerciseIds].sort()).toEqual(
        [...today.exerciseIds].sort(),
      );
    });
  });
});
