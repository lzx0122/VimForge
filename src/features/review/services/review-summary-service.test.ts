import { describe, expect, it, vi } from "vitest";

import type { AttemptSyncInput } from "../../practice/repositories/attempt-sync-repository";
import type {
  PracticeCandidateListOptions,
  PracticeCandidateRecord,
  PracticeCandidateRepository,
} from "../../practice/repositories/practice-candidate-repository";
import { ReviewSummaryService } from "./review-summary-service";

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

const NOW = new Date("2026-07-19T12:00:00.000Z");

describe("ReviewSummaryService", () => {
  it("returns hasLearningHistory: false and an empty summary when there are no attempts", async () => {
    const service = new ReviewSummaryService(
      createCandidateRepository([candidate()]),
      createAttemptRepository([]),
    );

    const summary = await service.getSummary(NOW);

    expect(summary).toEqual({
      hasLearningHistory: false,
      dueCount: 0,
      weakSkills: [],
    });
  });

  it("queries published candidates for memory review", async () => {
    const candidateRepository = createCandidateRepository([]);
    const service = new ReviewSummaryService(
      candidateRepository,
      createAttemptRepository([attempt()]),
    );

    await service.getSummary(NOW);

    expect(candidateRepository.listPublishedCandidates).toHaveBeenCalledWith({
      learningMode: "memory_review",
    });
  });

  it("counts due-or-incorrect and stale exercises as the due count", async () => {
    const incorrect = candidate({
      exerciseId: "incorrect-1",
      skillIds: ["skill-shared"],
      skillSlugs: ["inner-text-object"],
    });
    const stale = candidate({
      exerciseId: "stale-1",
      skillIds: ["skill-shared"],
      skillSlugs: ["inner-text-object"],
    });
    const familiar = candidate({
      exerciseId: "familiar-1",
      skillIds: ["skill-shared"],
      skillSlugs: ["inner-text-object"],
    });
    const service = new ReviewSummaryService(
      createCandidateRepository([incorrect, stale, familiar]),
      createAttemptRepository([
        attempt({
          clientAttemptId: "incorrect-attempt",
          exerciseId: "incorrect-1",
          completed: false,
        }),
        attempt({
          clientAttemptId: "stale-attempt-1",
          exerciseId: "stale-1",
          completedAt: "2026-06-01T08:01:00.000Z",
        }),
        attempt({
          clientAttemptId: "stale-attempt-2",
          exerciseId: "stale-1",
          completedAt: "2026-06-01T08:05:00.000Z",
        }),
        attempt({
          clientAttemptId: "familiar-attempt-1",
          exerciseId: "familiar-1",
        }),
        attempt({
          clientAttemptId: "familiar-attempt-2",
          exerciseId: "familiar-1",
        }),
      ]),
    );

    const summary = await service.getSummary(NOW);

    expect(summary.hasLearningHistory).toBe(true);
    expect(summary.dueCount).toBe(2);
  });

  it("aggregates weak skills by skill id with the highest priority and a related exercise count", async () => {
    const weakOne = candidate({
      exerciseId: "weak-1",
      skillIds: ["skill-weak"],
      skillSlugs: ["inner-text-object"],
    });
    const weakTwo = candidate({
      exerciseId: "weak-2",
      skillIds: ["skill-weak"],
      skillSlugs: ["inner-text-object"],
    });
    const service = new ReviewSummaryService(
      createCandidateRepository([weakOne, weakTwo]),
      createAttemptRepository([
        attempt({
          clientAttemptId: "weak-attempt-1",
          exerciseId: "weak-1",
          accuracyScore: 40,
        }),
        attempt({
          clientAttemptId: "weak-attempt-2",
          exerciseId: "weak-2",
          accuracyScore: 55,
        }),
      ]),
    );

    const summary = await service.getSummary(NOW);

    expect(summary.weakSkills).toHaveLength(1);
    const [weakSkill] = summary.weakSkills;
    expect(weakSkill?.skillId).toBe("skill-weak");
    expect(weakSkill?.skillSlug).toBe("inner-text-object");
    expect(weakSkill?.name).toBe("文字物件");
    expect(weakSkill?.relatedExerciseCount).toBe(2);
    expect(weakSkill?.priority).toBeGreaterThan(0);
  });

  it("falls back to the raw skill slug as the name when it has no topic definition", async () => {
    const undefinedTopicSkill = candidate({
      exerciseId: "weak-1",
      skillIds: ["skill-undefined-topic"],
      skillSlugs: ["not-a-real-topic-skill"],
    });
    const service = new ReviewSummaryService(
      createCandidateRepository([undefinedTopicSkill]),
      createAttemptRepository([
        attempt({
          clientAttemptId: "weak-attempt",
          exerciseId: "weak-1",
          accuracyScore: 40,
        }),
      ]),
    );

    const summary = await service.getSummary(NOW);

    expect(summary.weakSkills).toHaveLength(1);
    expect(summary.weakSkills[0]?.name).toBe("not-a-real-topic-skill");
  });

  it("sorts weak skills by priority descending and caps the list at 5", async () => {
    const candidates = Array.from({ length: 6 }, (_, index) =>
      candidate({
        exerciseId: `weak-${index + 1}`,
        skillIds: [`skill-${index + 1}`],
        skillSlugs: ["inner-text-object"],
      }),
    );
    const attempts = candidates.map((candidateRecord, index) =>
      attempt({
        clientAttemptId: `weak-attempt-${index + 1}`,
        exerciseId: candidateRecord.exerciseId,
        // A lower accuracy score maps to a higher weakness priority, so the
        // first candidate (worst accuracy) must sort first.
        accuracyScore: 10 * (index + 1),
      }),
    );
    const service = new ReviewSummaryService(
      createCandidateRepository(candidates),
      createAttemptRepository(attempts),
    );

    const summary = await service.getSummary(NOW);

    expect(summary.weakSkills).toHaveLength(5);
    const priorities = summary.weakSkills.map((skill) => skill.priority);
    expect(priorities).toEqual(
      [...priorities].sort((a, b) => b - a),
    );
    expect(summary.weakSkills[0]?.skillId).toBe("skill-1");
  });

  it("excludes candidates outside the learner's touched skills from the due count and weak skills", async () => {
    const touched = candidate({
      exerciseId: "touched-1",
      skillIds: ["skill-touched"],
      skillSlugs: ["inner-text-object"],
    });
    const untouched = candidate({
      exerciseId: "untouched-1",
      skillIds: ["skill-untouched"],
      skillSlugs: ["basic-motion"],
    });
    const service = new ReviewSummaryService(
      createCandidateRepository([touched, untouched]),
      createAttemptRepository([
        attempt({
          clientAttemptId: "touched-attempt",
          exerciseId: "touched-1",
          completed: false,
        }),
      ]),
    );

    const summary = await service.getSummary(NOW);

    expect(summary.dueCount).toBe(1);
    expect(
      summary.weakSkills.some((skill) => skill.skillId === "skill-untouched"),
    ).toBe(false);
  });
});
