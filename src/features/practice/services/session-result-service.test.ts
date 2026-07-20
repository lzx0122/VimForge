import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "../../../infrastructure/indexed-db/database";
import { SessionRepository } from "../../../infrastructure/indexed-db/session-repository";
import type { StoredLearningOutcome } from "../../../types/learning-projection";
import type { PracticeSession } from "../../../types/session";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import { SessionResultService } from "./session-result-service";

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
      const service = new SessionResultService(database, () => NOW);

      expect(await service.getResult("session-missing")).toBeNull();
    });

    it("only counts the latest attempt for a retried exercise", async () => {
      await new SessionRepository(database).save(session(), null);
      await seed(
        database,
        "attempts",
        { ...attempt({ clientAttemptId: "attempt-1a", accuracyScore: 40 }), syncStatus: "pending" },
      );
      await seed(
        database,
        "attempts",
        {
          ...attempt({
            clientAttemptId: "attempt-1b",
            accuracyScore: 95,
            startedAt: "2026-07-21T08:02:00.000Z",
            completedAt: "2026-07-21T08:03:00.000Z",
          }),
          syncStatus: "pending",
        },
      );
      await seed(database, "learningOutcomes", outcome({ clientAttemptId: "attempt-1a" }));
      await seed(
        database,
        "learningOutcomes",
        outcome({
          clientAttemptId: "attempt-1b",
          completedAt: "2026-07-21T08:03:00.000Z",
        }),
      );

      const service = new SessionResultService(database, () => NOW);
      const result = await service.getResult("session-1");

      const exerciseOneResult = result?.exerciseResults.find(
        (item) => item.exerciseId === "exercise-1",
      );
      expect(exerciseOneResult?.accuracyScore).toBe(95);
      expect(result?.exerciseResults).toHaveLength(1);
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

      const service = new SessionResultService(database, () => NOW);
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

      const service = new SessionResultService(database, () => NOW);
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

      const service = new SessionResultService(database, () => NOW);
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

      const service = new SessionResultService(database, () => NOW);
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

      const service = new SessionResultService(database, () => NOW);
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

      const service = new SessionResultService(database, () => NOW);
      const result = await service.getResult("session-1");

      expect(result).toMatchObject({
        sessionId: "session-1",
        learningMode: "efficiency",
        totalExercises: 1,
      });
    });
  });

  describe("restart", () => {
    it("creates a new session id and preserves source, mode, and exercise ids", async () => {
      const original = session({
        learningMode: "efficiency",
        selectionType: "topic_practice",
        requestedCount: 10,
        exerciseIds: ["exercise-1", "exercise-2"],
        selectedSkillIds: ["skill-1"],
      });
      await new SessionRepository(database).save(original, null);

      const service = new SessionResultService(
        database,
        () => NOW,
        () => "session-2",
      );
      const restarted = await service.restart("session-1");

      expect(restarted.id).toBe("session-2");
      expect(restarted.id).not.toBe(original.id);
      expect(restarted.learningMode).toBe("efficiency");
      expect(restarted.selectionType).toBe("topic_practice");
      expect(restarted.requestedCount).toBe(10);
      expect(restarted.exerciseIds).toEqual(["exercise-1", "exercise-2"]);
      expect(restarted.selectedSkillIds).toEqual(["skill-1"]);
      expect(restarted.status).toBe("active");
      expect(restarted.currentIndex).toBe(0);
      expect(restarted.completedAt).toBeNull();
      expect(restarted.startedAt).toBe(NOW.toISOString());
    });

    it("persists the restarted session so it can be resumed", async () => {
      await new SessionRepository(database).save(session(), null);
      const service = new SessionResultService(
        database,
        () => NOW,
        () => "session-2",
      );

      const restarted = await service.restart("session-1");

      const stored = await new SessionRepository(database).get("session-2");
      expect(stored).toEqual(restarted);
    });

    it("rejects restarting a session that does not exist", async () => {
      const service = new SessionResultService(database, () => NOW);

      await expect(service.restart("session-missing")).rejects.toThrow();
    });
  });
});
