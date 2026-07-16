import { describe, expect, it, vi } from "vitest";

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
    markSynced: vi.fn(async () => undefined),
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
    const service = new GuestSyncService(queue, remote, createNetwork());
    const attempt = createAttempt("attempt-local-first");

    const saving = service.saveCompletedAttempt(attempt);

    expect(queue.save).toHaveBeenCalledWith(attempt);
    expect(remote.recordAttempt).not.toHaveBeenCalled();
    finishSave?.();
    await saving;
  });

  it("syncs every pending attempt and marks only successes as synced", async () => {
    const first = createAttempt("attempt-success");
    const second = createAttempt("attempt-failure");
    const queue = createQueue([first, second]);
    const remote = createRemoteRepository();
    remote.recordAttempt = vi.fn(async (attempt) => {
      if (attempt.clientAttemptId === second.clientAttemptId) {
        throw new Error("network unavailable");
      }
      return {
        attemptId: attempt.clientAttemptId,
        mastery: [],
        dueAt: null,
      };
    });
    const service = new GuestSyncService(queue, remote, createNetwork());

    await expect(service.syncPending()).resolves.toEqual({
      total: 2,
      synced: 1,
      failed: 1,
      pending: 1,
    });
    expect(queue.markSynced).toHaveBeenCalledOnce();
    expect(queue.markSynced).toHaveBeenCalledWith(first.clientAttemptId);
    expect(queue.markSynced).not.toHaveBeenCalledWith(
      second.clientAttemptId,
    );
  });

  it("keeps every attempt pending while offline", async () => {
    const pending = [createAttempt("attempt-offline")];
    const queue = createQueue(pending);
    const remote = createRemoteRepository();
    const service = new GuestSyncService(
      queue,
      remote,
      createNetwork(false),
    );

    await expect(service.syncPending()).resolves.toEqual({
      total: 1,
      synced: 0,
      failed: 0,
      pending: 1,
    });
    expect(remote.recordAttempt).not.toHaveBeenCalled();
    expect(queue.markSynced).not.toHaveBeenCalled();
  });

  it("coalesces concurrent batch requests", async () => {
    const attempt = createAttempt("attempt-once");
    const queue = createQueue([attempt]);
    const remote = createRemoteRepository();
    const service = new GuestSyncService(queue, remote, createNetwork());

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
    const network = createNetwork(false);
    const service = new GuestSyncService(queue, remote, network);
    const onResult = vi.fn();

    const stopRetrying = service.retryWhenOnline(onResult);
    network.emit(true);

    await vi.waitFor(() => {
      expect(queue.markSynced).toHaveBeenCalledWith(
        attempt.clientAttemptId,
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
    const service = new GuestSyncService(queue, remote, createNetwork());

    await expect(service.countPending()).resolves.toBe(2);
    expect(remote.recordAttempt).not.toHaveBeenCalled();
  });
});
