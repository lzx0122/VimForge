import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AttemptSyncInput } from "../../features/practice/repositories/attempt-sync-repository";
import type { AttemptDraft } from "../../types/attempt";
import type { PracticeSession } from "../../types/session";
import { AttemptRepository } from "./attempt-repository";
import {
  AttemptConflictError,
  commitAttemptOutcome,
} from "./attempt-outcome-commit";
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
    actualCount: 2,
    status: "active",
    currentIndex: 0,
    exerciseIds: ["exercise-1", "exercise-2"],
    selectedSkillIds: [],
    startedAt: "2026-07-19T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-07-19T08:00:00.000Z",
  };
}

function withField(
  attempt: AttemptSyncInput,
  key: keyof AttemptSyncInput,
  value: unknown,
): AttemptSyncInput {
  return { ...attempt, [key]: value } as AttemptSyncInput;
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

  it("treats an identical duplicate payload as a whole-transaction no-op, ignoring a stale resubmission's session and draft", async () => {
    const attemptRepository = new AttemptRepository(database);
    const sessionRepository = new SessionRepository(database);
    const firstSession = createSession();

    await commitAttemptOutcome(database, {
      attempt: createSyncAttempt(),
      session: firstSession,
      attemptDraft: null,
    });

    const staleSession = {
      ...createSession(),
      currentIndex: 1,
    } satisfies PracticeSession;
    const staleDraft = createAttemptDraft();

    await commitAttemptOutcome(database, {
      attempt: createSyncAttempt(),
      session: staleSession,
      attemptDraft: staleDraft,
    });

    expect(await attemptRepository.get("attempt-1")).toMatchObject({
      accuracyScore: 100,
    });
    expect(await sessionRepository.getResumeState("session-1")).toEqual({
      session: firstSession,
      attemptDraft: null,
    });
  });

  it("rejects a conflicting duplicate clientAttemptId and leaves the stored attempt and session untouched", async () => {
    const attemptRepository = new AttemptRepository(database);
    const sessionRepository = new SessionRepository(database);
    const originalSession = createSession();
    await commitAttemptOutcome(database, {
      attempt: createSyncAttempt(),
      session: originalSession,
      attemptDraft: null,
    });

    const conflictingSession = {
      ...createSession(),
      currentIndex: 1,
    } satisfies PracticeSession;

    await expect(
      commitAttemptOutcome(database, {
        attempt: { ...createSyncAttempt(), accuracyScore: 1 },
        session: conflictingSession,
        attemptDraft: null,
      }),
    ).rejects.toThrow(AttemptConflictError);

    expect(await attemptRepository.get("attempt-1")).toMatchObject({
      accuracyScore: 100,
    });
    expect(await sessionRepository.getResumeState("session-1")).toMatchObject(
      { session: originalSession },
    );
  });

  it("treats NaN and null in the same field as a conflict, not a match", async () => {
    const attemptRepository = new AttemptRepository(database);

    await commitAttemptOutcome(database, {
      attempt: withField(createSyncAttempt(), "accuracyScore", NaN),
      session: createSession(),
      attemptDraft: null,
    });

    await expect(
      commitAttemptOutcome(database, {
        attempt: withField(createSyncAttempt(), "accuracyScore", null),
        session: createSession(),
        attemptDraft: null,
      }),
    ).rejects.toThrow(AttemptConflictError);

    expect((await attemptRepository.get("attempt-1"))?.accuracyScore).toBeNaN();
  });

  it("treats 0 and -0 in the same field as a conflict, not a match", async () => {
    const attemptRepository = new AttemptRepository(database);

    await commitAttemptOutcome(database, {
      attempt: withField(createSyncAttempt(), "accuracyScore", 0),
      session: createSession(),
      attemptDraft: null,
    });

    await expect(
      commitAttemptOutcome(database, {
        attempt: withField(createSyncAttempt(), "accuracyScore", -0),
        session: createSession(),
        attemptDraft: null,
      }),
    ).rejects.toThrow(AttemptConflictError);

    const stored = await attemptRepository.get("attempt-1");
    expect(Object.is(stored?.accuracyScore, 0)).toBe(true);
  });

  it("treats a sparse array hole and an explicit undefined element as a conflict, not a match", async () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparseActions = [, ] as unknown as AttemptSyncInput["normalizedActions"];
    const explicitUndefinedActions = [
      undefined,
    ] as unknown as AttemptSyncInput["normalizedActions"];

    await commitAttemptOutcome(database, {
      attempt: withField(createSyncAttempt(), "normalizedActions", sparseActions),
      session: createSession(),
      attemptDraft: null,
    });

    await expect(
      commitAttemptOutcome(database, {
        attempt: withField(
          createSyncAttempt(),
          "normalizedActions",
          explicitUndefinedActions,
        ),
        session: createSession(),
        attemptDraft: null,
      }),
    ).rejects.toThrow(AttemptConflictError);
  });

  it("round-trips NaN, Infinity, and -0 through IndexedDB without losing their identity", async () => {
    const attemptRepository = new AttemptRepository(database);
    const attempt = withField(
      withField(
        withField(createSyncAttempt(), "accuracyScore", NaN),
        "speedScore",
        Infinity,
      ),
      "keystrokeCount",
      -0,
    );

    await commitAttemptOutcome(database, {
      attempt,
      session: createSession(),
      attemptDraft: null,
    });

    const stored = await attemptRepository.get("attempt-1");
    expect(stored?.accuracyScore).toBeNaN();
    expect(stored?.speedScore).toBe(Infinity);
    expect(Object.is(stored?.keystrokeCount, -0)).toBe(true);

    // A second commit with the exact same special values must still be
    // recognized as an identical duplicate (a no-op), not a false conflict.
    await expect(
      commitAttemptOutcome(database, {
        attempt,
        session: createSession(),
        attemptDraft: null,
      }),
    ).resolves.toBeUndefined();
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
