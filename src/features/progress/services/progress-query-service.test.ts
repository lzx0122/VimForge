import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "../../../infrastructure/indexed-db/database";
import { AttemptRepository } from "../../../infrastructure/indexed-db/attempt-repository";
import { ExerciseReviewRepository } from "../../../infrastructure/indexed-db/exercise-review-repository";
import { SkillMasteryRepository } from "../../../infrastructure/indexed-db/skill-mastery-repository";
import type {
  CourseRepository,
  CourseSkillSummary,
  CourseUnitDetail,
} from "../../course/repositories/course-repository";
import type { AttemptSyncInput } from "../../practice/repositories/attempt-sync-repository";
import {
  ProgressQueryService,
  type AttemptQueryPort,
} from "./progress-query-service";

const DATABASE_NAME = "vim-forge-progress-query-service-test";
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

function exercise(
  overrides: Partial<CourseUnitDetail["exercises"][number]> = {},
): CourseUnitDetail["exercises"][number] {
  return {
    id: "exercise-1",
    slug: "exercise-1",
    title: "跳到下一個單字",
    exerciseType: "guided",
    difficulty: "beginner",
    displayOrder: 0,
    supportedModes: ["beginner"],
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

function attempt(overrides: Partial<AttemptSyncInput> = {}): AttemptSyncInput {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: "2026-07-21T08:01:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 5,
    recommendedKeystrokeCount: 5,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [],
    speedScore: 90,
    accuracyScore: 90,
    performanceQuality: 4,
    practiceContext: "different_exercise",
    ...overrides,
  };
}

async function seed(
  database: IDBDatabase,
  storeName: string,
  record: unknown,
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);
  await transactionToPromise(transaction);
}

function masteryRecord(
  overrides: Partial<{
    skillId: string;
    masteryScore: number;
    masteryLevel: 0 | 1 | 2 | 3 | 4 | 5;
  }> = {},
) {
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
  overrides: Partial<{ exerciseId: string; dueAt: string }> = {},
) {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 2,
    currentIntervalDays: 3,
    dueAt: "2026-07-21T08:00:00.000Z",
    lastPerformanceQuality: 3,
    lastAttemptAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:00:00.000Z",
    revision: 1,
    ...overrides,
  };
}

describe("ProgressQueryService", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  function createService(courseRepository: CourseRepository): ProgressQueryService {
    return new ProgressQueryService(
      courseRepository,
      new SkillMasteryRepository(database),
      new ExerciseReviewRepository(database),
      new AttemptRepository(database),
    );
  }

  it("shows an honest empty state with no fabricated progress when nothing has been attempted", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [exercise()], skills: [skill()] }),
    ]);
    const service = createService(courseRepository);

    const dashboard = await service.getDashboard(NOW);

    expect(dashboard).toEqual({
      hasLearningHistory: false,
      dueReviewCount: 0,
      skills: [],
      units: [
        {
          id: "unit-1",
          slug: "basic-cursor-movement",
          title: "基礎游標移動",
          completedExercises: 0,
          totalExercises: 1,
        },
      ],
      recentAttempts: [],
    });
  });

  it("reads skill progress from the skillMastery store, using catalog names", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ skills: [skill({ id: "skill-1", name: "基礎移動" })] }),
    ]);
    await seed(database, "skillMastery", {
      skillId: "skill-1",
      masteryScore: 63,
      masteryLevel: 3,
      successfulAttempts: 4,
      uniqueExerciseIds: ["exercise-1"],
      consecutiveSuccesses: 2,
      firstUnhintedSuccessAt: "2026-07-01T00:00:00.000Z",
      latestUnhintedSuccessAt: "2026-07-20T00:00:00.000Z",
      lastAttemptAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      revision: 4,
    });

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.skills).toEqual([
      { id: "skill-1", name: "基礎移動", masteryLevel: 3, masteryScore: 63 },
    ]);
  });

  it("counts only reviews due at or before now", async () => {
    const courseRepository = createCourseRepository([unitDetail()]);
    await seed(database, "exerciseReviews", {
      exerciseId: "exercise-due",
      masteryLevel: 2,
      currentIntervalDays: 3,
      dueAt: "2026-07-21T08:00:00.000Z",
      lastPerformanceQuality: 3,
      lastAttemptAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z",
      revision: 1,
    });
    await seed(database, "exerciseReviews", {
      exerciseId: "exercise-not-due",
      masteryLevel: 2,
      currentIntervalDays: 10,
      dueAt: "2026-07-25T08:00:00.000Z",
      lastPerformanceQuality: 4,
      lastAttemptAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z",
      revision: 1,
    });

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.dueReviewCount).toBe(1);
  });

  it("counts unique successful exercises toward a unit's completed total, deduping repeated successes", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        exercises: [
          exercise({ id: "exercise-1" }),
          exercise({ id: "exercise-2" }),
          exercise({ id: "exercise-3" }),
        ],
      }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ clientAttemptId: "attempt-1a", exerciseId: "exercise-1" }),
    );
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-1b",
        exerciseId: "exercise-1",
        startedAt: "2026-07-21T08:05:00.000Z",
        completedAt: "2026-07-21T08:06:00.000Z",
      }),
    );
    await new AttemptRepository(database).save(
      attempt({ clientAttemptId: "attempt-2", exerciseId: "exercise-2" }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.units).toEqual([
      expect.objectContaining({
        completedExercises: 2,
        totalExercises: 3,
      }),
    ]);
  });

  it("does not count a skipped attempt toward a unit's completed exercises", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [exercise({ id: "exercise-1" })] }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ exerciseId: "exercise-1", completed: false }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.units).toEqual([
      expect.objectContaining({ completedExercises: 0, totalExercises: 1 }),
    ]);
  });

  it("orders recent attempts from newest to oldest", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        exercises: [
          exercise({ id: "exercise-1", title: "較早的題目" }),
          exercise({ id: "exercise-2", title: "較新的題目" }),
        ],
      }),
    ]);
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-older",
        exerciseId: "exercise-1",
        completedAt: "2026-07-20T08:00:00.000Z",
      }),
    );
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-newer",
        exerciseId: "exercise-2",
        completedAt: "2026-07-21T08:00:00.000Z",
      }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.recentAttempts.map((entry) => entry.exerciseTitle)).toEqual([
      "較新的題目",
      "較早的題目",
    ]);
  });

  it("breaks a tied recent-attempt timestamp deterministically by clientAttemptId", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        exercises: [
          exercise({ id: "exercise-1", title: "題目 A" }),
          exercise({ id: "exercise-2", title: "題目 B" }),
        ],
      }),
    ]);
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-a",
        exerciseId: "exercise-1",
        startedAt: "2026-07-21T08:00:00.000Z",
        completedAt: "2026-07-21T08:01:00.000Z",
      }),
    );
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-b",
        exerciseId: "exercise-2",
        startedAt: "2026-07-21T08:00:00.000Z",
        completedAt: "2026-07-21T08:01:00.000Z",
      }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.recentAttempts[0]?.exerciseTitle).toBe("題目 B");
  });

  it("excludes a skill whose id is no longer present in the catalog", async () => {
    const courseRepository = createCourseRepository([unitDetail({ skills: [] })]);
    await seed(database, "skillMastery", {
      skillId: "removed-skill",
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
    });

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.skills).toEqual([]);
  });

  it("keeps a removed exercise's attempt visible in recent history with a fallback title", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [] }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ exerciseId: "removed-exercise", completed: true, accuracyScore: 77 }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.recentAttempts).toEqual([
      expect.objectContaining({
        exerciseTitle: "已移除的題目（removed-exercise）",
        completed: true,
        accuracyScore: 77,
        errorSummary: null,
      }),
    ]);
  });

  it("does not let a removed exercise's attempt count toward any unit's completion", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [exercise({ id: "exercise-1" })] }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ exerciseId: "removed-exercise", completed: true }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.units).toEqual([
      expect.objectContaining({ completedExercises: 0, totalExercises: 1 }),
    ]);
  });

  it("reports learning history as soon as any attempt exists, even before a success", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [exercise()] }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ completed: false }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.hasLearningHistory).toBe(true);
  });

  it("reports learning history when mastery exists but there are no attempts", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ skills: [skill()] }),
    ]);
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-1" }));

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.hasLearningHistory).toBe(true);
  });

  it("reports learning history from a future review with zero attempts and zero due count", async () => {
    const courseRepository = createCourseRepository([unitDetail()]);
    await seed(
      database,
      "exerciseReviews",
      reviewRecord({ exerciseId: "exercise-1", dueAt: "2026-08-01T00:00:00.000Z" }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.hasLearningHistory).toBe(true);
    expect(dashboard.dueReviewCount).toBe(0);
  });

  it("reports learning history and the correct due count from a due review with zero attempts", async () => {
    const courseRepository = createCourseRepository([unitDetail()]);
    await seed(
      database,
      "exerciseReviews",
      reviewRecord({ exerciseId: "exercise-1", dueAt: "2026-07-20T00:00:00.000Z" }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.hasLearningHistory).toBe(true);
    expect(dashboard.dueReviewCount).toBe(1);
  });

  it("keeps hasLearningHistory true from a removed skill's mastery record even though skills stays empty", async () => {
    const courseRepository = createCourseRepository([unitDetail({ skills: [] })]);
    await seed(database, "skillMastery", masteryRecord({ skillId: "removed-skill" }));

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.hasLearningHistory).toBe(true);
    expect(dashboard.skills).toEqual([]);
  });

  it("returns more than ten attempts, all in newest-first order", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        exercises: Array.from({ length: 12 }, (_, index) =>
          exercise({ id: `exercise-${index}`, title: `題目 ${index}` }),
        ),
      }),
    ]);
    const attemptRepository = new AttemptRepository(database);
    for (let index = 0; index < 12; index += 1) {
      await attemptRepository.save(
        attempt({
          clientAttemptId: `attempt-${index}`,
          exerciseId: `exercise-${index}`,
          completedAt: `2026-07-21T08:${String(index).padStart(2, "0")}:00.000Z`,
        }),
      );
    }

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.recentAttempts).toHaveLength(12);
    expect(dashboard.recentAttempts.map((entry) => entry.exerciseTitle)).toEqual(
      Array.from({ length: 12 }, (_, index) => `題目 ${11 - index}`),
    );
  });

  it("orders skills within a unit by displayOrder, not alphabetical name", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        skills: [
          skill({ id: "skill-b", slug: "b-skill", name: "B 技能", displayOrder: 0 }),
          skill({ id: "skill-a", slug: "a-skill", name: "A 技能", displayOrder: 1 }),
        ],
      }),
    ]);
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-a" }));
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-b" }));

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.skills.map((entry) => entry.id)).toEqual([
      "skill-b",
      "skill-a",
    ]);
  });

  it("orders skills from different units by unit displayOrder", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        id: "unit-2",
        slug: "unit-2",
        displayOrder: 2,
        skills: [
          skill({
            id: "skill-in-unit-2",
            slug: "skill-in-unit-2",
            name: "後面的單元技能",
            displayOrder: 0,
          }),
        ],
      }),
      unitDetail({
        id: "unit-1",
        slug: "unit-1",
        displayOrder: 1,
        skills: [
          skill({
            id: "skill-in-unit-1",
            slug: "skill-in-unit-1",
            name: "前面的單元技能",
            displayOrder: 0,
          }),
        ],
      }),
    ]);
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-in-unit-1" }));
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-in-unit-2" }));

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.skills.map((entry) => entry.id)).toEqual([
      "skill-in-unit-1",
      "skill-in-unit-2",
    ]);
  });

  it("lists a skill referenced by multiple units only once, at its first catalog occurrence", async () => {
    const sharedSkill = skill({
      id: "skill-shared",
      slug: "shared",
      name: "共用技能",
      displayOrder: 0,
    });
    const courseRepository = createCourseRepository([
      unitDetail({ id: "unit-1", slug: "unit-1", displayOrder: 1, skills: [sharedSkill] }),
      unitDetail({ id: "unit-2", slug: "unit-2", displayOrder: 2, skills: [sharedSkill] }),
    ]);
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-shared" }));

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.skills).toHaveLength(1);
    expect(dashboard.skills[0]?.id).toBe("skill-shared");
  });

  it("omits a removed skill's mastery record without disturbing the order of the remaining skills", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        skills: [
          skill({ id: "skill-1", slug: "skill-1", name: "技能一", displayOrder: 0 }),
          skill({ id: "skill-2", slug: "skill-2", name: "技能二", displayOrder: 1 }),
        ],
      }),
    ]);
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-1" }));
    await seed(database, "skillMastery", masteryRecord({ skillId: "removed-skill" }));
    await seed(database, "skillMastery", masteryRecord({ skillId: "skill-2" }));

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.skills.map((entry) => entry.id)).toEqual([
      "skill-1",
      "skill-2",
    ]);
  });

  it("keeps an exercise counted as completed even after a later failed retry", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [exercise({ id: "exercise-1" })] }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ clientAttemptId: "attempt-1a", exerciseId: "exercise-1", completed: true }),
    );
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-1b",
        exerciseId: "exercise-1",
        completed: false,
        startedAt: "2026-07-21T08:05:00.000Z",
        completedAt: "2026-07-21T08:06:00.000Z",
      }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.units).toEqual([
      expect.objectContaining({ completedExercises: 1, totalExercises: 1 }),
    ]);
  });

  it("maps each attempt's completion to its own unit when multiple units exist", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        id: "unit-1",
        slug: "unit-1",
        displayOrder: 1,
        exercises: [exercise({ id: "exercise-1" })],
      }),
      unitDetail({
        id: "unit-2",
        slug: "unit-2",
        displayOrder: 2,
        exercises: [exercise({ id: "exercise-2" })],
      }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ exerciseId: "exercise-1", completed: true }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.units).toEqual([
      expect.objectContaining({ id: "unit-1", completedExercises: 1, totalExercises: 1 }),
      expect.objectContaining({ id: "unit-2", completedExercises: 0, totalExercises: 1 }),
    ]);
  });

  it("breaks a tied recent-attempt effective timestamp using startedAt before clientAttemptId", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({
        exercises: [
          exercise({ id: "exercise-1", title: "題目 A" }),
          exercise({ id: "exercise-2", title: "題目 B" }),
        ],
      }),
    ]);
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-z",
        exerciseId: "exercise-1",
        startedAt: "2026-07-21T08:00:00.000Z",
        completedAt: "2026-07-21T08:05:00.000Z",
      }),
    );
    await new AttemptRepository(database).save(
      attempt({
        clientAttemptId: "attempt-a",
        exerciseId: "exercise-2",
        startedAt: "2026-07-21T08:01:00.000Z",
        completedAt: "2026-07-21T08:05:00.000Z",
      }),
    );

    const service = createService(courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.recentAttempts[0]?.exerciseTitle).toBe("題目 B");
  });

  it("propagates a catalog read rejection instead of swallowing it", async () => {
    const courseRepository: CourseRepository = {
      listPublishedUnits: async () => {
        throw new Error("catalog unavailable");
      },
      getPublishedUnitBySlug: async () => null,
    };
    const service = createService(courseRepository);

    await expect(service.getDashboard(NOW)).rejects.toThrow(
      "catalog unavailable",
    );
  });

  it("propagates a local repository read rejection instead of swallowing it", async () => {
    const courseRepository = createCourseRepository([unitDetail()]);
    const failingAttemptRepository: AttemptQueryPort = {
      listAll: async () => {
        throw new Error("indexeddb unavailable");
      },
    };
    const service = new ProgressQueryService(
      courseRepository,
      new SkillMasteryRepository(database),
      new ExerciseReviewRepository(database),
      failingAttemptRepository,
    );

    await expect(service.getDashboard(NOW)).rejects.toThrow(
      "indexeddb unavailable",
    );
  });
});
