import { describe, expect, it, vi } from "vitest";

import type {
  StoredExerciseReview,
  StoredSkillMastery,
} from "../../../types/learning-projection";
import type { PracticeSession } from "../../../types/session";
import type {
  CourseRepository,
  CourseSkillSummary,
  CourseUnitDetail,
} from "../../course/repositories/course-repository";
import { HomeLearningSummaryService } from "./home-learning-summary-service";

const NOW = new Date("2026-07-21T09:00:00.000Z");

function skill(overrides: Partial<CourseSkillSummary> = {}): CourseSkillSummary {
  return {
    id: "skill-1",
    slug: "basic-motion",
    name: "基礎移動",
    category: "movement",
    primary: true,
    displayOrder: 0,
    ...overrides,
  };
}

function unitDetail(overrides: Partial<CourseUnitDetail> = {}): CourseUnitDetail {
  return {
    id: "unit-1",
    slug: "basic-cursor-movement",
    title: "基礎游標移動",
    description: "練習基礎游標移動指令。",
    difficulty: "beginner",
    estimatedMinutes: 15,
    displayOrder: 1,
    exerciseCount: 0,
    skills: [],
    exercises: [],
    ...overrides,
  };
}

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: "session-1",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 10,
    actualCount: 10,
    status: "active",
    currentIndex: 2,
    exerciseIds: ["exercise-1", "exercise-2"],
    selectedSkillIds: [],
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-21T08:05:00.000Z",
    ...overrides,
  };
}

function masteryRecord(
  overrides: Partial<StoredSkillMastery> = {},
): StoredSkillMastery {
  return {
    skillId: "skill-1",
    masteryScore: 50,
    masteryLevel: 2,
    successfulAttempts: 1,
    uniqueExerciseIds: [],
    consecutiveSuccesses: 1,
    firstUnhintedSuccessAt: null,
    latestUnhintedSuccessAt: null,
    lastAttemptAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    revision: 1,
    ...overrides,
  };
}

function reviewRecord(
  overrides: Partial<StoredExerciseReview> = {},
): StoredExerciseReview {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 2,
    currentIntervalDays: 3,
    dueAt: "2026-07-21T08:00:00.000Z",
    lastPerformanceQuality: 3,
    lastAttemptAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    revision: 1,
    ...overrides,
  };
}

function createCourseRepository(
  units: readonly CourseUnitDetail[],
): CourseRepository {
  const unitBySlug = new Map(units.map((unit) => [unit.slug, unit]));
  return {
    listPublishedUnits: async () =>
      units.map((unit) => ({
        id: unit.id,
        slug: unit.slug,
        title: unit.title,
        description: unit.description,
        difficulty: unit.difficulty,
        estimatedMinutes: unit.estimatedMinutes,
        displayOrder: unit.displayOrder,
        exerciseCount: unit.exercises.length,
        primarySkills: unit.skills.filter((skillSummary) => skillSummary.primary),
      })),
    getPublishedUnitBySlug: async (slug: string) => unitBySlug.get(slug) ?? null,
  };
}

function createSessionRepository(activeSession: PracticeSession | null) {
  return {
    getActive: vi.fn(async () => activeSession),
  };
}

function createExerciseReviewRepository(
  dueReviews: readonly StoredExerciseReview[],
) {
  return {
    listDue: vi.fn(async () => dueReviews),
  };
}

function createSkillMasteryRepository(
  records: readonly StoredSkillMastery[],
) {
  return {
    listAll: vi.fn(async () => records),
  };
}

function createService(options: {
  activeSession?: PracticeSession | null;
  dueReviews?: readonly StoredExerciseReview[];
  masteryRecords?: readonly StoredSkillMastery[];
  units?: readonly CourseUnitDetail[];
}): HomeLearningSummaryService {
  return new HomeLearningSummaryService(
    createSessionRepository(options.activeSession ?? null),
    createExerciseReviewRepository(options.dueReviews ?? []),
    createSkillMasteryRepository(options.masteryRecords ?? []),
    createCourseRepository(options.units ?? []),
  );
}

describe("HomeLearningSummaryService", () => {
  it("returns an empty summary when there is nothing to report", async () => {
    const service = createService({});

    const summary = await service.getSummary(NOW);

    expect(summary).toEqual({
      activeSessionId: null,
      dueReviewCount: 0,
      weakestSkill: null,
    });
  });

  it("returns the active session's id", async () => {
    const service = createService({
      activeSession: session({ id: "session-active" }),
    });

    const summary = await service.getSummary(NOW);

    expect(summary.activeSessionId).toBe("session-active");
  });

  it("returns null when there is no active session", async () => {
    const service = createService({ activeSession: null });

    const summary = await service.getSummary(NOW);

    expect(summary.activeSessionId).toBeNull();
  });

  it("returns the due review count from ExerciseReviewRepository.listDue", async () => {
    const dueReviews = [
      reviewRecord({ exerciseId: "exercise-1" }),
      reviewRecord({ exerciseId: "exercise-2" }),
    ];
    const service = createService({ dueReviews });

    const summary = await service.getSummary(NOW);

    expect(summary.dueReviewCount).toBe(2);
  });

  it("returns the weakest skill by the lowest masteryScore, with its catalog name", async () => {
    const units = [
      unitDetail({
        skills: [
          skill({ id: "skill-strong", name: "強項技能" }),
          skill({ id: "skill-weak", name: "弱項技能" }),
        ],
      }),
    ];
    const service = createService({
      units,
      masteryRecords: [
        masteryRecord({ skillId: "skill-strong", masteryScore: 90, masteryLevel: 4 }),
        masteryRecord({ skillId: "skill-weak", masteryScore: 15, masteryLevel: 1 }),
      ],
    });

    const summary = await service.getSummary(NOW);

    expect(summary.weakestSkill).toEqual({
      skillId: "skill-weak",
      name: "弱項技能",
      masteryLevel: 1,
    });
  });

  it("returns a null weakestSkill when there are no mastery records", async () => {
    const service = createService({
      units: [unitDetail({ skills: [skill()] })],
      masteryRecords: [],
    });

    const summary = await service.getSummary(NOW);

    expect(summary.weakestSkill).toBeNull();
  });

  it("skips a mastery record whose skill id is no longer in the catalog, falling back to the next weakest", async () => {
    const units = [
      unitDetail({ skills: [skill({ id: "skill-catalog", name: "現存技能" })] }),
    ];
    const service = createService({
      units,
      masteryRecords: [
        masteryRecord({ skillId: "removed-skill", masteryScore: 5 }),
        masteryRecord({ skillId: "skill-catalog", masteryScore: 40, masteryLevel: 2 }),
      ],
    });

    const summary = await service.getSummary(NOW);

    expect(summary.weakestSkill).toEqual({
      skillId: "skill-catalog",
      name: "現存技能",
      masteryLevel: 2,
    });
  });

  it("returns a null weakestSkill when every mastery record's skill has been removed from the catalog", async () => {
    const service = createService({
      units: [unitDetail({ skills: [] })],
      masteryRecords: [masteryRecord({ skillId: "removed-skill" })],
    });

    const summary = await service.getSummary(NOW);

    expect(summary.weakestSkill).toBeNull();
  });

  it("reports every field together for a learner with a full history", async () => {
    const units = [unitDetail({ skills: [skill({ id: "skill-weak", name: "弱項技能" })] })];
    const service = createService({
      activeSession: session({ id: "session-active" }),
      dueReviews: [reviewRecord({ exerciseId: "exercise-1" })],
      masteryRecords: [masteryRecord({ skillId: "skill-weak", masteryScore: 20, masteryLevel: 1 })],
      units,
    });

    const summary = await service.getSummary(NOW);

    expect(summary).toEqual({
      activeSessionId: "session-active",
      dueReviewCount: 1,
      weakestSkill: { skillId: "skill-weak", name: "弱項技能", masteryLevel: 1 },
    });
  });
});
