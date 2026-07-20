import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "../../../infrastructure/indexed-db/database";
import { SessionRepository } from "../../../infrastructure/indexed-db/session-repository";
import type { StoredLearningOutcome } from "../../../types/learning-projection";
import type { PracticeSession } from "../../../types/session";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import {
  PracticeSessionStarter,
  type PracticeSessionRepositoryPort,
  type PracticeSessionStorePort,
} from "./practice-session-starter";
import {
  SessionResultService,
  type PracticeSessionStarterPort,
} from "./session-result-service";

const DATABASE_NAME = "vim-forge-session-result-service-test";
const NOW = new Date("2026-07-21T09:00:00.000Z");

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: "session-1",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 5,
    actualCount: 3,
    status: "completed",
    currentIndex: 3,
    exerciseIds: ["exercise-1", "exercise-2", "exercise-3"],
    selectedSkillIds: [],
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: "2026-07-21T08:10:00.000Z",
    updatedAt: "2026-07-21T08:10:00.000Z",
    ...overrides,
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

function outcome(
  overrides: Partial<StoredLearningOutcome> = {},
): StoredLearningOutcome {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    completedAt: "2026-07-21T08:01:00.000Z",
    skillChanges: [
      {
        skillId: "skill-1",
        previousScore: 40,
        nextScore: 50,
        previousLevel: 2,
        nextLevel: 2,
        delta: 10,
      },
    ],
    masteryRevisions: [{ skillId: "skill-1", revision: 1 }],
    reviewRevision: 1,
    previousDueAt: null,
    nextDueAt: "2026-07-24T08:01:00.000Z",
    projectionSource: "local",
    ...overrides,
  };
}

function restartedSessionFixture(): PracticeSession {
  return {
    id: "session-2",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 5,
    actualCount: 3,
    status: "active",
    currentIndex: 0,
    exerciseIds: ["exercise-1", "exercise-2", "exercise-3"],
    selectedSkillIds: [],
    startedAt: NOW.toISOString(),
    completedAt: null,
    updatedAt: NOW.toISOString(),
  };
}

function stubStarter(
  overrides: Partial<PracticeSessionStarterPort> = {},
): PracticeSessionStarterPort {
  return {
    start: vi.fn(async () => {
      throw new Error("start() should not be called in this test.");
    }),
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

describe("SessionResultService", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  describe("getResult", () => {
    it("returns null when the session does not exist", async () => {
      const service = new SessionResultService(database, stubStarter());

      expect(await service.getResult("session-missing")).toBeNull();
    });

    it("only counts the latest attempt for a retried exercise", async () => {
      await new SessionRepository(database).save(session(), null);
      await seed(database, "attempts", {
        ...attempt({ clientAttemptId: "attempt-1a", accuracyScore: 40 }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1b",
          accuracyScore: 95,
          startedAt: "2026-07-21T08:02:00.000Z",
          completedAt: "2026-07-21T08:03:00.000Z",
        }),
        syncStatus: "pending",
      });
      await seed(
        database,
        "learningOutcomes",
        outcome({ clientAttemptId: "attempt-1a" }),
      );
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-1b",
          completedAt: "2026-07-21T08:03:00.000Z",
        }),
      );

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      const exerciseOneResult = result?.exerciseResults.find(
        (item) => item.exerciseId === "exercise-1",
      );
      expect(exerciseOneResult?.accuracyScore).toBe(95);
      expect(result?.exerciseResults).toHaveLength(1);
    });

    it("breaks a tied effective timestamp using startedAt", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-a",
          startedAt: "2026-07-21T08:00:00.000Z",
          completedAt: "2026-07-21T08:05:00.000Z",
          accuracyScore: 10,
        }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-b",
          startedAt: "2026-07-21T08:01:00.000Z",
          completedAt: "2026-07-21T08:05:00.000Z",
          accuracyScore: 20,
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults[0]?.accuracyScore).toBe(20);
    });

    it("breaks a fully tied timestamp using clientAttemptId, seeded in ascending order", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-a",
          startedAt: "2026-07-21T08:00:00.000Z",
          completedAt: "2026-07-21T08:01:00.000Z",
          accuracyScore: 10,
        }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-b",
          startedAt: "2026-07-21T08:00:00.000Z",
          completedAt: "2026-07-21T08:01:00.000Z",
          accuracyScore: 20,
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults[0]?.accuracyScore).toBe(20);
    });

    it("breaks a fully tied timestamp using clientAttemptId, seeded in descending order", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-b",
          startedAt: "2026-07-21T08:00:00.000Z",
          completedAt: "2026-07-21T08:01:00.000Z",
          accuracyScore: 20,
        }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-a",
          startedAt: "2026-07-21T08:00:00.000Z",
          completedAt: "2026-07-21T08:01:00.000Z",
          accuracyScore: 10,
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults[0]?.accuracyScore).toBe(20);
    });

    it("includes hint level, performance quality, and a needs-practice flag derived from completion", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1", "exercise-2"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1",
          exerciseId: "exercise-1",
          completed: true,
          highestHintLevel: 2,
          performanceQuality: 3,
        }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-2",
          exerciseId: "exercise-2",
          completed: false,
          highestHintLevel: 4,
          performanceQuality: 0,
          completedAt: "2026-07-21T08:02:00.000Z",
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults).toEqual([
        expect.objectContaining({
          exerciseId: "exercise-1",
          completed: true,
          highestHintLevel: 2,
          performanceQuality: 3,
          needsPractice: false,
        }),
        expect.objectContaining({
          exerciseId: "exercise-2",
          completed: false,
          highestHintLevel: 4,
          performanceQuality: 0,
          needsPractice: true,
        }),
      ]);
    });

    it("excludes attempts recorded under a different session", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-other",
          sessionId: "session-other",
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults).toHaveLength(0);
      expect(result?.completedExercises).toBe(0);
    });

    it("does not let a superseded retry affect completed/skipped counts", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({ clientAttemptId: "attempt-1a", completed: false }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1b",
          completed: true,
          startedAt: "2026-07-21T08:02:00.000Z",
          completedAt: "2026-07-21T08:03:00.000Z",
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.completedExercises).toBe(1);
      expect(result?.skippedExercises).toBe(0);
    });

    it("does not let a superseded retry's scores pull down the averages", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1a",
          accuracyScore: 10,
          speedScore: 10,
        }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1b",
          accuracyScore: 90,
          speedScore: 95,
          startedAt: "2026-07-21T08:02:00.000Z",
          completedAt: "2026-07-21T08:03:00.000Z",
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.averageAccuracy).toBe(90);
      expect(result?.averageSpeed).toBe(95);
    });

    it("does not let a superseded retry's duration inflate the total", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({ clientAttemptId: "attempt-1a", durationMs: 120_000 }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1b",
          durationMs: 30_000,
          startedAt: "2026-07-21T08:02:00.000Z",
          completedAt: "2026-07-21T08:03:00.000Z",
        }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.totalDurationMs).toBe(30_000);
    });

    it("does not let a superseded retry's learning outcome affect the reported skill changes", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({ clientAttemptId: "attempt-1a" }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1b",
          startedAt: "2026-07-21T08:02:00.000Z",
          completedAt: "2026-07-21T08:03:00.000Z",
        }),
        syncStatus: "pending",
      });
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-1a",
          skillChanges: [
            {
              skillId: "skill-1",
              previousScore: 40,
              nextScore: 45,
              previousLevel: 2,
              nextLevel: 2,
              delta: 5,
            },
          ],
        }),
      );
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-1b",
          completedAt: "2026-07-21T08:03:00.000Z",
          skillChanges: [
            {
              skillId: "skill-1",
              previousScore: 45,
              nextScore: 80,
              previousLevel: 2,
              nextLevel: 3,
              delta: 35,
            },
          ],
        }),
      );

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.skillChanges).toEqual([
        {
          skillId: "skill-1",
          previousScore: 45,
          nextScore: 80,
          previousLevel: 2,
          nextLevel: 3,
        },
      ]);
    });

    it("still reports an exercise result when its final attempt has no learning outcome", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt(),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults).toHaveLength(1);
      expect(result?.skillChanges).toEqual([]);
    });

    it("treats a null durationMs as zero rather than dropping the exercise", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({ durationMs: null }),
        syncStatus: "pending",
      });

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults[0]?.durationMs).toBe(0);
      expect(result?.totalDurationMs).toBe(0);
    });

    it("averages accuracy and speed from completed exercises only, excluding skipped ones", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1", "exercise-2"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1",
          exerciseId: "exercise-1",
          completed: true,
          accuracyScore: 90,
          speedScore: 80,
        }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-2",
          exerciseId: "exercise-2",
          completed: false,
          accuracyScore: 0,
          speedScore: 0,
          completedAt: "2026-07-21T08:02:00.000Z",
        }),
        syncStatus: "pending",
      });
      await seed(
        database,
        "learningOutcomes",
        outcome({ clientAttemptId: "attempt-1", exerciseId: "exercise-1" }),
      );
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-2",
          exerciseId: "exercise-2",
          completedAt: "2026-07-21T08:02:00.000Z",
        }),
      );

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.completedExercises).toBe(1);
      expect(result?.skippedExercises).toBe(1);
      expect(result?.averageAccuracy).toBe(90);
      expect(result?.averageSpeed).toBe(80);
    });

    it("returns null averages when nothing was completed", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({ completed: false, accuracyScore: 0, speedScore: 0 }),
        syncStatus: "pending",
      });
      await seed(database, "learningOutcomes", outcome());

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.averageAccuracy).toBeNull();
      expect(result?.averageSpeed).toBeNull();
    });

    it("sums the total duration across every exercise's latest attempt", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1", "exercise-2"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-1",
          exerciseId: "exercise-1",
          durationMs: 30_000,
        }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-2",
          exerciseId: "exercise-2",
          durationMs: 45_000,
          completedAt: "2026-07-21T08:02:00.000Z",
        }),
        syncStatus: "pending",
      });
      await seed(
        database,
        "learningOutcomes",
        outcome({ clientAttemptId: "attempt-1", exerciseId: "exercise-1" }),
      );
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-2",
          exerciseId: "exercise-2",
          completedAt: "2026-07-21T08:02:00.000Z",
        }),
      );

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.totalDurationMs).toBe(75_000);
    });

    it("aggregates each skill's net change from its first to its last touch in the session", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1", "exercise-2"] }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt({ clientAttemptId: "attempt-1", exerciseId: "exercise-1" }),
        syncStatus: "pending",
      });
      await seed(database, "attempts", {
        ...attempt({
          clientAttemptId: "attempt-2",
          exerciseId: "exercise-2",
          completedAt: "2026-07-21T08:05:00.000Z",
        }),
        syncStatus: "pending",
      });
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-1",
          exerciseId: "exercise-1",
          skillChanges: [
            {
              skillId: "skill-1",
              previousScore: 40,
              nextScore: 50,
              previousLevel: 2,
              nextLevel: 2,
              delta: 10,
            },
          ],
        }),
      );
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-2",
          exerciseId: "exercise-2",
          completedAt: "2026-07-21T08:05:00.000Z",
          skillChanges: [
            {
              skillId: "skill-1",
              previousScore: 50,
              nextScore: 63,
              previousLevel: 2,
              nextLevel: 3,
              delta: 13,
            },
          ],
        }),
      );

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.skillChanges).toEqual([
        {
          skillId: "skill-1",
          previousScore: 40,
          nextScore: 63,
          previousLevel: 2,
          nextLevel: 3,
        },
      ]);
    });

    it("orders exerciseResults by the session's own exerciseIds order", async () => {
      await new SessionRepository(database).save(
        session({ exerciseIds: ["exercise-1", "exercise-2", "exercise-3"] }),
        null,
      );
      // Seed in reverse insertion order to prove ordering follows the
      // session, not attempt/outcome insertion order.
      for (const [index, exerciseId] of [
        "exercise-3",
        "exercise-1",
        "exercise-2",
      ].entries()) {
        await seed(database, "attempts", {
          ...attempt({
            clientAttemptId: `attempt-${exerciseId}`,
            exerciseId,
            completedAt: `2026-07-21T08:0${index}:00.000Z`,
          }),
          syncStatus: "pending",
        });
        await seed(
          database,
          "learningOutcomes",
          outcome({
            clientAttemptId: `attempt-${exerciseId}`,
            exerciseId,
            completedAt: `2026-07-21T08:0${index}:00.000Z`,
          }),
        );
      }

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result?.exerciseResults.map((item) => item.exerciseId)).toEqual([
        "exercise-1",
        "exercise-2",
        "exercise-3",
      ]);
    });

    it("reports the session's identity and totals", async () => {
      await new SessionRepository(database).save(
        session({
          learningMode: "efficiency",
          exerciseIds: ["exercise-1"],
        }),
        null,
      );
      await seed(database, "attempts", {
        ...attempt(),
        syncStatus: "pending",
      });
      await seed(database, "learningOutcomes", outcome());

      const service = new SessionResultService(database, stubStarter());
      const result = await service.getResult("session-1");

      expect(result).toMatchObject({
        sessionId: "session-1",
        learningMode: "efficiency",
        totalExercises: 1,
      });
    });
  });

  describe("restart", () => {
    it("uses the injected starter to create the restarted session", async () => {
      await new SessionRepository(database).save(session(), null);
      const restarted = restartedSessionFixture();
      const starter = stubStarter({ start: vi.fn(async () => restarted) });
      const service = new SessionResultService(database, starter);

      const result = await service.restart("session-1");

      expect(starter.start).toHaveBeenCalledTimes(1);
      expect(result).toBe(restarted);
    });

    it("passes the original session's mode, source, count, exercises, and skills to the starter", async () => {
      const original = session({
        learningMode: "efficiency",
        selectionType: "topic_practice",
        requestedCount: 10,
        exerciseIds: ["exercise-1", "exercise-2"],
        selectedSkillIds: ["skill-1"],
      });
      await new SessionRepository(database).save(original, null);
      const starter = stubStarter({
        start: vi.fn(async () => restartedSessionFixture()),
      });
      const service = new SessionResultService(database, starter);

      await service.restart("session-1");

      expect(starter.start).toHaveBeenCalledWith({
        learningMode: "efficiency",
        selectionType: "topic_practice",
        requestedCount: 10,
        exerciseIds: ["exercise-1", "exercise-2"],
        selectedSkillIds: ["skill-1"],
      });
    });

    it("leaves the original session record untouched", async () => {
      const original = session();
      await new SessionRepository(database).save(original, null);
      const starter = stubStarter({
        start: vi.fn(async () => restartedSessionFixture()),
      });
      const service = new SessionResultService(database, starter);

      await service.restart("session-1");

      const stored = await new SessionRepository(database).get("session-1");
      expect(stored).toEqual(original);
    });

    it("leaves the practice store unchanged when the starter's persistence fails", async () => {
      await new SessionRepository(database).save(session(), null);
      const repository: PracticeSessionRepositoryPort = {
        save: vi.fn(async () => {
          throw new Error("disk full");
        }),
      };
      const store: PracticeSessionStorePort = {
        restoreSession: vi.fn(),
      };
      const starter = new PracticeSessionStarter(
        repository,
        store,
        () => "session-2",
        () => NOW,
      );
      const service = new SessionResultService(database, starter);

      await expect(service.restart("session-1")).rejects.toThrow(
        "disk full",
      );
      expect(store.restoreSession).not.toHaveBeenCalled();
    });

    it("rejects restarting a session that does not exist without calling the starter", async () => {
      const starter = stubStarter();
      const service = new SessionResultService(database, starter);

      await expect(service.restart("session-missing")).rejects.toThrow();
      expect(starter.start).not.toHaveBeenCalled();
    });
  });
});
