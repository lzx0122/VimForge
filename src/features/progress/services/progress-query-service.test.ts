import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "../../../infrastructure/indexed-db/database";
import { AttemptRepository } from "../../../infrastructure/indexed-db/attempt-repository";
import type {
  CourseRepository,
  CourseSkillSummary,
  CourseUnitDetail,
} from "../../course/repositories/course-repository";
import type { AttemptSyncInput } from "../../practice/repositories/attempt-sync-repository";
import { ProgressQueryService } from "./progress-query-service";

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

  it("shows an honest empty state with no fabricated progress when nothing has been attempted", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [exercise()], skills: [skill()] }),
    ]);
    const service = new ProgressQueryService(database, courseRepository);

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

    const service = new ProgressQueryService(database, courseRepository);
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

    const service = new ProgressQueryService(database, courseRepository);
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

    const service = new ProgressQueryService(database, courseRepository);
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

    const service = new ProgressQueryService(database, courseRepository);
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

    const service = new ProgressQueryService(database, courseRepository);
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

    const service = new ProgressQueryService(database, courseRepository);
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

    const service = new ProgressQueryService(database, courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.skills).toEqual([]);
  });

  it("excludes a recent attempt whose exercise id is no longer present in the catalog", async () => {
    const courseRepository = createCourseRepository([unitDetail({ exercises: [] })]);
    await new AttemptRepository(database).save(
      attempt({ exerciseId: "removed-exercise" }),
    );

    const service = new ProgressQueryService(database, courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.recentAttempts).toEqual([]);
    expect(dashboard.hasLearningHistory).toBe(true);
  });

  it("reports learning history as soon as any attempt exists, even before a success", async () => {
    const courseRepository = createCourseRepository([
      unitDetail({ exercises: [exercise()] }),
    ]);
    await new AttemptRepository(database).save(
      attempt({ completed: false }),
    );

    const service = new ProgressQueryService(database, courseRepository);
    const dashboard = await service.getDashboard(NOW);

    expect(dashboard.hasLearningHistory).toBe(true);
  });
});
