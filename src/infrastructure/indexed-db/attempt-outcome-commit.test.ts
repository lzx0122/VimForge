import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type { AttemptDraft } from "../../types/attempt";
import type { PracticeSession } from "../../types/session";
import { AttemptRepository } from "./attempt-repository";
import { commitAttemptOutcome } from "./attempt-outcome-commit";
import {
  deleteVimForgeDatabase,
  openVimForgeDatabase,
} from "./database";
import { SessionRepository } from "./session-repository";

const DATABASE_NAME = "vim-forge-attempt-outcome-commit-test";

function createSyncAttempt(): AttemptSyncInput {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: "2026-07-19T08:01:00.000Z",
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
    status: "active",
    currentIndex: 0,
    exerciseIds: ["exercise-1", "exercise-2"],
    selectedSkillIds: [],
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-19T08:00:00.000Z",
  };
}

function createAttemptDraft(): AttemptDraft {
  return {
    clientAttemptId: "attempt-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: null,
    initialContent: "const name = true;",
    currentContent: "const xname = true;",
    initialCursor: { line: 0, column: 6 },
    currentCursor: { line: 0, column: 7 },
    currentMode: "normal",
    actions: [{ type: "vim_command", command: "i" }],
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    completed: false,
  };
}

describe("commitAttemptOutcome", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  it("saves the attempt and clears the session draft in one atomic transaction", async () => {
    const attemptRepository = new AttemptRepository(database);
    const sessionRepository = new SessionRepository(database);
    await sessionRepository.save(createSession(), createAttemptDraft());

    await commitAttemptOutcome(database, {
      attempt: createSyncAttempt(),
      session: createSession(),
      attemptDraft: null,
    });

    expect(await attemptRepository.get("attempt-1")).toMatchObject({
      clientAttemptId: "attempt-1",
      syncStatus: "pending",
    });
    expect(await sessionRepository.getResumeState("session-1")).toMatchObject({
      attemptDraft: null,
    });
  });

  it("does not duplicate an attempt already committed for the same clientAttemptId", async () => {
    const attemptRepository = new AttemptRepository(database);

    await commitAttemptOutcome(database, {
      attempt: createSyncAttempt(),
      session: createSession(),
      attemptDraft: null,
    });
    await commitAttemptOutcome(database, {
      attempt: { ...createSyncAttempt(), accuracyScore: 1 },
      session: createSession(),
      attemptDraft: null,
    });

    expect(await attemptRepository.get("attempt-1")).toMatchObject({
      accuracyScore: 100,
    });
  });

  it("rolls back the attempt when the session write fails, leaving no partial state", async () => {
    const attemptRepository = new AttemptRepository(database);
    const sessionRepository = new SessionRepository(database);
    const originalSession = createSession();
    await sessionRepository.save(originalSession, createAttemptDraft());

    const invalidSession = {
      ...createSession(),
      id: undefined,
    } as unknown as PracticeSession;

    await expect(
      commitAttemptOutcome(database, {
        attempt: createSyncAttempt(),
        session: invalidSession,
        attemptDraft: null,
      }),
    ).rejects.toThrow();

    expect(await attemptRepository.get("attempt-1")).toBeNull();
    expect(await sessionRepository.getResumeState("session-1")).toMatchObject(
      {
        session: originalSession,
        attemptDraft: createAttemptDraft(),
      },
    );
  });
});
