import { describe, expect, it, vi } from "vitest";

import {
  PracticeSessionStarter,
  type PracticeSessionRepositoryPort,
  type PracticeSessionStorePort,
  type StartPracticeSessionInput,
} from "./practice-session-starter";

const STARTED_AT = "2026-07-19T08:00:00.000Z";

function createInput(): StartPracticeSessionInput {
  return {
    learningMode: "memory_review",
    selectionType: "daily_review",
    requestedCount: 10,
    exerciseIds: ["exercise-1", "exercise-2"],
    selectedSkillIds: ["skill-motion"],
  };
}

describe("PracticeSessionStarter", () => {
  it("persists the session before updating the store, in that order", async () => {
    const calls: string[] = [];
    const repository: PracticeSessionRepositoryPort = {
      save: vi.fn(async () => {
        calls.push("persist");
      }),
    };
    const store: PracticeSessionStorePort = {
      restoreSession: vi.fn(() => {
        calls.push("store");
      }),
    };
    const starter = new PracticeSessionStarter(
      repository,
      store,
      () => "session-1",
      () => new Date(STARTED_AT),
    );

    const session = await starter.start(createInput());

    expect(calls).toEqual(["persist", "store"]);
    expect(session).toMatchObject({
      id: "session-1",
      startedAt: STARTED_AT,
      actualCount: 2,
    });
    expect(repository.save).toHaveBeenCalledWith(session, null);
    expect(store.restoreSession).toHaveBeenCalledWith(session, null);
  });

  it("leaves the store untouched when persistence fails", async () => {
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
      () => "session-1",
      () => new Date(STARTED_AT),
    );

    await expect(starter.start(createInput())).rejects.toThrow("disk full");
    expect(store.restoreSession).not.toHaveBeenCalled();
  });
});
