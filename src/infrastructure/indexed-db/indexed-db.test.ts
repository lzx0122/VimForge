import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type { AttemptDraft } from "../../types/attempt";
import type { PracticeSession } from "../../types/session";
import { AttemptRepository } from "./attempt-repository";
import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
  transactionToPromise,
} from "./database";
import { SessionRepository } from "./session-repository";
import { SettingsRepository } from "./settings-repository";

const DATABASE_NAME = "vim-forge-indexed-db-test";

function createAttemptDraft(): AttemptDraft {
  return {
    clientAttemptId: "attempt-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    startedAt: "2026-07-16T08:00:00.000Z",
    completedAt: "2026-07-16T08:01:00.000Z",
    initialContent: "const oldName = true;",
    currentContent: "const newName = true;",
    initialCursor: { line: 0, column: 6 },
    currentCursor: { line: 0, column: 13 },
    currentMode: "normal",
    actions: [{ type: "vim_command", command: "ciw" }],
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    completed: true,
  };
}

function createSyncAttempt(): AttemptSyncInput {
  return {
    clientAttemptId: "attempt-1",
    sessionId: null,
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-16T08:00:00.000Z",
    completedAt: "2026-07-16T08:01:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 3,
    recommendedKeystrokeCount: 3,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [{ type: "vim_command", command: "ciw" }],
    speedScore: 100,
    accuracyScore: 100,
    performanceQuality: 5,
    practiceContext: "different_exercise",
  };
}

function createSession(): PracticeSession {
  return {
    id: "session-1",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 5,
    actualCount: 2,
    status: "active",
    currentIndex: 1,
    exerciseIds: ["exercise-1", "exercise-2"],
    selectedSkillIds: [],
    startedAt: "2026-07-16T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-16T08:01:00.000Z",
  };
}

describe("IndexedDB repositories", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  it("creates all required native IndexedDB object stores", () => {
    expect(Array.from(database.objectStoreNames).sort()).toEqual([
      "attempts",
      "exerciseReviews",
      "learningOutcomes",
      "metadata",
      "sessions",
      "settings",
      "skillMastery",
    ]);
  });

  it("indexes the attempts store by session, exercise, and completion time", () => {
    const transaction = database.transaction("attempts", "readonly");
    const attempts = transaction.objectStore("attempts");

    expect(Array.from(attempts.indexNames).sort()).toEqual([
      "completedAt",
      "exerciseId",
      "sessionId",
      "syncStatus",
    ]);
  });

  it("indexes exerciseReviews by dueAt and updatedAt, and learningOutcomes by session, exercise, and completion time", () => {
    const transaction = database.transaction(
      ["exerciseReviews", "learningOutcomes"],
      "readonly",
    );
    const exerciseReviews = transaction.objectStore("exerciseReviews");
    const learningOutcomes = transaction.objectStore("learningOutcomes");

    expect(Array.from(exerciseReviews.indexNames).sort()).toEqual([
      "dueAt",
      "updatedAt",
    ]);
    expect(Array.from(learningOutcomes.indexNames).sort()).toEqual([
      "completedAt",
      "exerciseId",
      "sessionId",
    ]);
  });

  it("keys attempts by clientAttemptId and tracks pending or synced status", async () => {
    const repository = new AttemptRepository(database);
    const attempt = createSyncAttempt();

    await repository.save(attempt);

    expect(await repository.get(attempt.clientAttemptId)).toMatchObject({
      clientAttemptId: "attempt-1",
      syncStatus: "pending",
    });
    expect(await repository.listPending()).toHaveLength(1);

    await repository.markSynced(attempt.clientAttemptId);

    expect(await repository.get(attempt.clientAttemptId)).toMatchObject({
      clientAttemptId: "attempt-1",
      syncStatus: "synced",
    });
    expect(await repository.listPending()).toEqual([]);
  });

  it("keeps attempts append-only when the same clientAttemptId is saved again", async () => {
    const repository = new AttemptRepository(database);
    const attempt = createSyncAttempt();
    await repository.save(attempt);
    await repository.markSynced(attempt.clientAttemptId);

    await repository.save({
      ...attempt,
      accuracyScore: 1,
    });

    expect(await repository.get(attempt.clientAttemptId)).toMatchObject({
      accuracyScore: attempt.accuracyScore,
      syncStatus: "synced",
    });
  });

  it("persists and finds the active practice session", async () => {
    const repository = new SessionRepository(database);
    const session = createSession();

    await repository.save(session);

    expect(await repository.get(session.id)).toEqual(session);
    expect(await repository.getActive()).toEqual(session);
  });

  it("normalizes a legacy stored session that predates actualCount", async () => {
    const repository = new SessionRepository(database);
    const legacySession = createSession();
    const rawLegacySession: Record<string, unknown> = { ...legacySession };
    delete rawLegacySession.actualCount;

    const transaction = database.transaction("sessions", "readwrite");
    transaction.objectStore("sessions").put({
      id: legacySession.id,
      status: legacySession.status,
      session: rawLegacySession,
      attemptDraft: null,
    });
    await transactionToPromise(transaction);

    expect(await repository.get(legacySession.id)).toMatchObject({
      actualCount: legacySession.exerciseIds.length,
    });
    expect(await repository.getActive()).toMatchObject({
      actualCount: legacySession.exerciseIds.length,
    });
    expect(await repository.getResumeState(legacySession.id)).toMatchObject({
      session: { actualCount: legacySession.exerciseIds.length },
    });
  });

  it("stores an unfinished attempt draft with its resumable session", async () => {
    const repository = new SessionRepository(database);
    const session = createSession();
    const attemptDraft = {
      ...createAttemptDraft(),
      completed: false,
      completedAt: null,
    } satisfies AttemptDraft;

    await repository.save(session, attemptDraft);

    expect(await repository.getResumeState(session.id)).toEqual({
      session,
      attemptDraft,
    });

    await repository.saveAttemptDraft(session.id, null);

    expect(await repository.getResumeState(session.id)).toEqual({
      session,
      attemptDraft: null,
    });
  });

  it("persists local editor and practice settings", async () => {
    const repository = new SettingsRepository(database);
    const settings = {
      editorFontSize: 18,
      showLineNumbers: true,
      showKeypresses: false,
      soundEnabled: false,
      preferredQuestionCount: 10,
      lastLearningMode: "efficiency",
      updatedAt: "2026-07-16T08:01:00.000Z",
    } as const;

    await repository.save(settings);

    expect(await repository.get()).toEqual(settings);
  });

  it("lists every stored attempt across exercises", async () => {
    const repository = new AttemptRepository(database);
    await repository.save({
      ...createSyncAttempt(),
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
    });
    await repository.save({
      ...createSyncAttempt(),
      clientAttemptId: "attempt-2",
      exerciseId: "exercise-2",
    });

    const attempts = await repository.listAll();

    expect(attempts.map((attempt) => attempt.clientAttemptId).sort()).toEqual(
      ["attempt-1", "attempt-2"],
    );
  });

  it("filters stored attempts down to the requested exercise IDs", async () => {
    const repository = new AttemptRepository(database);
    await repository.save({
      ...createSyncAttempt(),
      clientAttemptId: "attempt-1",
      exerciseId: "exercise-1",
    });
    await repository.save({
      ...createSyncAttempt(),
      clientAttemptId: "attempt-2",
      exerciseId: "exercise-2",
    });
    await repository.save({
      ...createSyncAttempt(),
      clientAttemptId: "attempt-3",
      exerciseId: "exercise-3",
    });

    const attempts = await repository.listByExerciseIds([
      "exercise-1",
      "exercise-3",
    ]);

    expect(attempts.map((attempt) => attempt.clientAttemptId).sort()).toEqual(
      ["attempt-1", "attempt-3"],
    );
  });

  it("rolls back every object store when a transaction aborts", async () => {
    const transaction = database.transaction(
      ["attempts", "sessions"],
      "readwrite",
    );
    const completion = transactionToPromise(transaction);

    transaction.objectStore("attempts").put({
      ...createSyncAttempt(),
      syncStatus: "pending",
    });
    transaction.objectStore("sessions").put(createSession());
    transaction.abort();

    await expect(completion).rejects.toThrow();
    expect(await new AttemptRepository(database).get("attempt-1")).toBeNull();
    expect(await new SessionRepository(database).get("session-1")).toBeNull();
  });

  it("upgrades a version-1 database to version 2 without losing existing records", async () => {
    const upgradeDatabaseName = `${DATABASE_NAME}-upgrade`;
    await deleteVimForgeDatabase(upgradeDatabaseName);

    const v1Database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(upgradeDatabaseName, 1);
      request.addEventListener(
        "upgradeneeded",
        () => {
          const db = request.result;
          const attempts = db.createObjectStore("attempts", {
            keyPath: "clientAttemptId",
          });
          attempts.createIndex("syncStatus", "syncStatus", { unique: false });
          const sessions = db.createObjectStore("sessions", {
            keyPath: "id",
          });
          sessions.createIndex("status", "status", { unique: false });
          db.createObjectStore("settings", { keyPath: "key" });
          db.createObjectStore("metadata", { keyPath: "key" });
        },
        { once: true },
      );
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
      request.addEventListener("error", () => reject(request.error), {
        once: true,
      });
    });

    const legacyAttempt = {
      ...createSyncAttempt(),
      syncStatus: "pending" as const,
    };
    const legacySession = createSession();
    const seedTransaction = v1Database.transaction(
      ["attempts", "sessions"],
      "readwrite",
    );
    seedTransaction.objectStore("attempts").put(legacyAttempt);
    seedTransaction.objectStore("sessions").put({
      id: legacySession.id,
      status: legacySession.status,
      session: legacySession,
      attemptDraft: null,
    });
    await transactionToPromise(seedTransaction);
    v1Database.close();

    const upgradedDatabase = await openVimForgeDatabase(upgradeDatabaseName);

    expect(Array.from(upgradedDatabase.objectStoreNames).sort()).toEqual([
      "attempts",
      "exerciseReviews",
      "learningOutcomes",
      "metadata",
      "sessions",
      "settings",
      "skillMastery",
    ]);
    expect(
      await new AttemptRepository(upgradedDatabase).get(
        legacyAttempt.clientAttemptId,
      ),
    ).toMatchObject({ clientAttemptId: legacyAttempt.clientAttemptId });
    expect(
      await new SessionRepository(upgradedDatabase).get(legacySession.id),
    ).toEqual(legacySession);

    const attemptsStore = upgradedDatabase
      .transaction("attempts", "readonly")
      .objectStore("attempts");
    expect(Array.from(attemptsStore.indexNames).sort()).toEqual([
      "completedAt",
      "exerciseId",
      "sessionId",
      "syncStatus",
    ]);

    upgradedDatabase.close();
    await deleteVimForgeDatabase(upgradeDatabaseName);
  });
});
