import { describe, expect, it, vi } from "vitest";

import type { SyncedAttemptCommitter } from "../../../infrastructure/indexed-db/synced-attempt-committer";
import type {
  AttemptSyncInput,
  AttemptSyncRepository,
} from "../../practice/repositories/attempt-sync-repository";
import {
  GuestSyncService,
  type LocalAttemptQueue,
  type NetworkMonitor,
} from "./guest-sync-service";

function createAttempt(clientAttemptId: string): AttemptSyncInput {
  return {
    clientAttemptId,
    sessionId: null,
    exerciseId: "00000000-0000-4000-8000-000000000301",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-16T08:00:00.000Z",
    completedAt: "2026-07-16T08:00:08.000Z",
    durationMs: 8_000,
    keystrokeCount: 5,
    recommendedKeystrokeCount: 5,
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

function createQueue(
  pending: AttemptSyncInput[] = [],
): LocalAttemptQueue {
  return {
    save: vi.fn(async () => undefined),
    listPending: vi.fn(async () => pending),
  };
}

function createRemoteRepository(): AttemptSyncRepository {
  return {
    recordAttempt: vi.fn(async (attempt) => ({
      attemptId: attempt.clientAttemptId,
      mastery: [],
      dueAt: null,
    })),
  };
}

function createCommitter(): SyncedAttemptCommitter {
  return {
    commit: vi.fn(async () => undefined),
  };
}

function createNetwork(initiallyOnline = true): NetworkMonitor & {
  emit(online: boolean): void;
} {
  let online = initiallyOnline;
  const listeners = new Set<(online: boolean) => void>();

  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(nextOnline) {
      online = nextOnline;
      for (const listener of listeners) {
        listener(online);
      }
    },
  };
}

describe("GuestSyncService", () => {
  it("persists a completed attempt locally before doing any cloud work", async () => {
    let finishSave: (() => void) | undefined;
    const queue = createQueue();
    queue.save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const remote = createRemoteRepository();
    const service = new GuestSyncService(
      queue,
      remote,
      createNetwork(),
      createCommitter(),
    );
    const attempt = createAttempt("attempt-local-first");

    const saving = service.saveCompletedAttempt(attempt);

    expect(queue.save).toHaveBeenCalledWith(attempt);
    expect(remote.recordAttempt).not.toHaveBeenCalled();
    finishSave?.();
    await saving;
  });

  it("syncs every pending attempt and commits only successes", async () => {
    const first = createAttempt("attempt-success");
    const second = createAttempt("attempt-failure");
    const queue = createQueue([first, second]);
    const remote = createRemoteRepository();
    const remoteResult = {
      attemptId: first.clientAttemptId,
      mastery: [{ skillId: "skill-1", masteryLevel: 3 as const, masteryScore: 62 }],
      dueAt: "2026-07-23T08:00:00.000Z",
    };
    remote.recordAttempt = vi.fn(async (attempt) => {
      if (attempt.clientAttemptId === second.clientAttemptId) {
        throw new Error("network unavailable");
      }
      return remoteResult;
    });
    const committer = createCommitter();
    const service = new GuestSyncService(
      queue,
      remote,
      createNetwork(),
      committer,
    );

    await expect(service.syncPending()).resolves.toEqual({
      total: 2,
      synced: 1,
      failed: 1,
      pending: 1,
    });
    expect(committer.commit).toHaveBeenCalledOnce();
    expect(committer.commit).toHaveBeenCalledWith({
      clientAttemptId: first.clientAttemptId,
      exerciseId: first.exerciseId,
      result: remoteResult,
    });
    expect(committer.commit).not.toHaveBeenCalledWith(
      expect.objectContaining({ clientAttemptId: second.clientAttemptId }),
    );
  });

  it("counts an attempt as failed when the committer itself rejects", async () => {
    const attempt = createAttempt("attempt-commit-fails");
    const queue = createQueue([attempt]);
    const remote = createRemoteRepository();
    const committer = createCommitter();
    committer.commit = vi.fn(async () => {
      throw new Error("local commit failed");
    });
    const service = new GuestSyncService(
      queue,
      remote,
      createNetwork(),
      committer,
    );

    await expect(service.syncPending()).resolves.toEqual({
      total: 1,
      synced: 0,
      failed: 1,
      pending: 1,
    });
  });

  it("keeps every attempt pending while offline", async () => {
    const pending = [createAttempt("attempt-offline")];
    const queue = createQueue(pending);
    const remote = createRemoteRepository();
    const committer = createCommitter();
    const service = new GuestSyncService(
      queue,
      remote,
      createNetwork(false),
      committer,
    );

    await expect(service.syncPending()).resolves.toEqual({
      total: 1,
      synced: 0,
      failed: 0,
      pending: 1,
    });
    expect(remote.recordAttempt).not.toHaveBeenCalled();
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it("coalesces concurrent batch requests", async () => {
    const attempt = createAttempt("attempt-once");
    const queue = createQueue([attempt]);
    const remote = createRemoteRepository();
    const service = new GuestSyncService(
      queue,
      remote,
      createNetwork(),
      createCommitter(),
    );

    const firstSync = service.syncPending();
    const secondSync = service.syncPending();
    await Promise.all([firstSync, secondSync]);

    expect(queue.listPending).toHaveBeenCalledOnce();
    expect(remote.recordAttempt).toHaveBeenCalledOnce();
  });

  it("retries pending attempts when the network comes back", async () => {
    const attempt = createAttempt("attempt-retry");
    const queue = createQueue([attempt]);
    const remote = createRemoteRepository();
    const committer = createCommitter();
    const network = createNetwork(false);
    const service = new GuestSyncService(queue, remote, network, committer);
    const onResult = vi.fn();

    const stopRetrying = service.retryWhenOnline(onResult);
    network.emit(true);

    await vi.waitFor(() => {
      expect(committer.commit).toHaveBeenCalledWith(
        expect.objectContaining({ clientAttemptId: attempt.clientAttemptId }),
      );
      expect(onResult).toHaveBeenCalledWith({
        total: 1,
        synced: 1,
        failed: 0,
        pending: 0,
      });
    });
    stopRetrying();
    network.emit(true);
    expect(remote.recordAttempt).toHaveBeenCalledOnce();
  });

  it("reports the current pending count without contacting the cloud", async () => {
    const queue = createQueue([
      createAttempt("attempt-1"),
      createAttempt("attempt-2"),
    ]);
    const remote = createRemoteRepository();
    const service = new GuestSyncService(
      queue,
      remote,
      createNetwork(),
      createCommitter(),
    );

    await expect(service.countPending()).resolves.toBe(2);
    expect(remote.recordAttempt).not.toHaveBeenCalled();
  });
});
