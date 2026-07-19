import { describe, expect, it, vi } from "vitest";

import type {
  ExerciseRepository,
  ExerciseSummary,
} from "../../practice/repositories/exercise-repository";
import {
  PracticeSessionStarter,
  type PracticeSessionRepositoryPort,
  type PracticeSessionStorePort,
} from "../../practice/services/practice-session-starter";
import type {
  CourseRepository,
  CourseUnitDetail,
} from "../repositories/course-repository";
import {
  CoursePracticeService,
  NoBeginnerExercisesError,
} from "./course-practice-service";

const STARTED_AT = "2026-07-19T08:00:00.000Z";

function unitDetail(overrides: Partial<CourseUnitDetail> = {}): CourseUnitDetail {
  return {
    id: "unit-1",
    slug: "text-objects",
    title: "文字物件",
    description: "精準操作文字範圍。",
    difficulty: "advanced",
    estimatedMinutes: 28,
    displayOrder: 8,
    exerciseCount: 2,
    skills: [],
    exercises: [],
    ...overrides,
  };
}

function exerciseSummary(
  overrides: Partial<ExerciseSummary> = {},
): ExerciseSummary {
  return {
    id: "exercise-1",
    unitId: "unit-1",
    slug: "text-objects-01",
    title: "練習一",
    instruction: "指示",
    language: "plaintext",
    exerciseType: "guided",
    difficulty: "advanced",
    supportedModes: ["beginner"],
    targetDurationMs: 1000,
    version: 1,
    ...overrides,
  };
}

function createCourseRepository(
  getPublishedUnitBySlug: CourseRepository["getPublishedUnitBySlug"],
): CourseRepository {
  return {
    listPublishedUnits: vi.fn(),
    getPublishedUnitBySlug,
  };
}

function createExerciseRepository(
  listPublishedExercises: ExerciseRepository["listPublishedExercises"],
): ExerciseRepository {
  return {
    listPublishedExercises,
    getPublishedExercise: vi.fn(),
  };
}

function createStarter(
  save: PracticeSessionRepositoryPort["save"] = vi.fn(async () => {}),
): PracticeSessionStarter {
  const store: PracticeSessionStorePort = { restoreSession: vi.fn() };
  const repository: PracticeSessionRepositoryPort = { save };
  return new PracticeSessionStarter(
    repository,
    store,
    () => "session-1",
    () => new Date(STARTED_AT),
  );
}

describe("CoursePracticeService", () => {
  describe("loadUnit", () => {
    it("returns the unit detail for a published slug", async () => {
      const detail = unitDetail();
      const courseRepository = createCourseRepository(
        vi.fn().mockResolvedValue(detail),
      );
      const exerciseRepository = createExerciseRepository(vi.fn());
      const service = new CoursePracticeService(
        courseRepository,
        exerciseRepository,
        createStarter(),
      );

      await expect(service.loadUnit("text-objects")).resolves.toEqual(detail);
    });

    it("returns null for an unknown unit", async () => {
      const courseRepository = createCourseRepository(
        vi.fn().mockResolvedValue(null),
      );
      const exerciseRepository = createExerciseRepository(vi.fn());
      const service = new CoursePracticeService(
        courseRepository,
        exerciseRepository,
        createStarter(),
      );

      await expect(
        service.loadUnit("does-not-exist"),
      ).resolves.toBeNull();
    });
  });

  describe("startUnit", () => {
    it("starts a course session preserving the exercise repository's authored order", async () => {
      const detail = unitDetail();
      const courseRepository = createCourseRepository(
        vi.fn().mockResolvedValue(detail),
      );
      const orderedExercises = [
        exerciseSummary({ id: "exercise-b", slug: "text-objects-02" }),
        exerciseSummary({ id: "exercise-a", slug: "text-objects-01" }),
      ];
      const listPublishedExercises = vi.fn().mockResolvedValue(orderedExercises);
      const exerciseRepository = createExerciseRepository(listPublishedExercises);
      const service = new CoursePracticeService(
        courseRepository,
        exerciseRepository,
        createStarter(),
      );

      const session = await service.startUnit("text-objects");

      expect(listPublishedExercises).toHaveBeenCalledWith({
        unitId: "unit-1",
        learningMode: "beginner",
        orderByDisplayOrder: true,
      });
      expect(session.exerciseIds).toEqual(["exercise-b", "exercise-a"]);
      expect(session.learningMode).toBe("beginner");
      expect(session.selectionType).toBe("course");
      expect(session.requestedCount).toBeNull();
      expect(session.actualCount).toBe(2);
    });

    it("rejects starting an unknown unit without querying exercises", async () => {
      const courseRepository = createCourseRepository(
        vi.fn().mockResolvedValue(null),
      );
      const listPublishedExercises = vi.fn();
      const exerciseRepository = createExerciseRepository(listPublishedExercises);
      const service = new CoursePracticeService(
        courseRepository,
        exerciseRepository,
        createStarter(),
      );

      await expect(service.startUnit("does-not-exist")).rejects.toThrow();
      expect(listPublishedExercises).not.toHaveBeenCalled();
    });

    it("rejects a unit with no beginner exercises without persisting a session", async () => {
      const detail = unitDetail();
      const courseRepository = createCourseRepository(
        vi.fn().mockResolvedValue(detail),
      );
      const exerciseRepository = createExerciseRepository(
        vi.fn().mockResolvedValue([]),
      );
      const save = vi.fn(async () => {});
      const service = new CoursePracticeService(
        courseRepository,
        exerciseRepository,
        createStarter(save),
      );

      await expect(service.startUnit("text-objects")).rejects.toBeInstanceOf(
        NoBeginnerExercisesError,
      );
      expect(save).not.toHaveBeenCalled();
    });

    it("propagates a persistence failure instead of swallowing it", async () => {
      const detail = unitDetail();
      const courseRepository = createCourseRepository(
        vi.fn().mockResolvedValue(detail),
      );
      const exerciseRepository = createExerciseRepository(
        vi.fn().mockResolvedValue([exerciseSummary()]),
      );
      const save = vi.fn(async () => {
        throw new Error("disk full");
      });
      const service = new CoursePracticeService(
        courseRepository,
        exerciseRepository,
        createStarter(save),
      );

      await expect(service.startUnit("text-objects")).rejects.toThrow(
        "disk full",
      );
    });
  });
});
