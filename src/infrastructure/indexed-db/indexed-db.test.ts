import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function createAttempt(): AttemptDraft {
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

function createSession(): PracticeSession {
  return {
    id: "session-1",
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 5,
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
      "metadata",
      "sessions",
      "settings",
    ]);
  });

  it("keys attempts by clientAttemptId and tracks pending or synced status", async () => {
    const repository = new AttemptRepository(database);
    const attempt = createAttempt();

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
    const attempt = createAttempt();
    await repository.save(attempt);
    await repository.markSynced(attempt.clientAttemptId);

    await repository.save({
      ...attempt,
      currentContent: "overwritten content",
    });

    expect(await repository.get(attempt.clientAttemptId)).toMatchObject({
      currentContent: attempt.currentContent,
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

  it("rolls back every object store when a transaction aborts", async () => {
    const transaction = database.transaction(
      ["attempts", "sessions"],
      "readwrite",
    );
    const completion = transactionToPromise(transaction);

    transaction.objectStore("attempts").put({
      ...createAttempt(),
      syncStatus: "pending",
    });
    transaction.objectStore("sessions").put(createSession());
    transaction.abort();

    await expect(completion).rejects.toThrow();
    expect(await new AttemptRepository(database).get("attempt-1")).toBeNull();
    expect(await new SessionRepository(database).get("session-1")).toBeNull();
  });
});
