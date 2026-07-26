import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuestSyncService } from "../../guest-sync/services/guest-sync-service";
import { CloudHydrationMetadataRepository } from "../../../infrastructure/indexed-db/cloud-hydration-metadata-repository";
import { IndexedDbCloudHydrationCommitter } from "../../../infrastructure/indexed-db/cloud-hydration-committer";
import {
  deleteVimForgeDatabase,
  INDEXED_DB_STORES,
  openVimForgeDatabase,
  transactionToPromise,
} from "../../../infrastructure/indexed-db/database";
import { LocalDataOwnerRepository } from "../../../infrastructure/indexed-db/local-data-owner-repository";
import type {
  AttemptHydrationCursor,
  CloudAttemptSnapshot,
  CloudExerciseReviewSnapshot,
  CloudHydrationMetadata,
  CloudPage,
  CloudSkillMasterySnapshot,
  MasteryHydrationCursor,
  ReviewHydrationCursor,
} from "../../../types/cloud-learning-state";
import type { CloudLearningStateRepository } from "../repositories/cloud-learning-state-repository";
import { CloudHydrationService } from "./cloud-hydration-service";

const DATABASE_NAME = "vim-forge-cloud-hydration-service-test";
const USER_ID = "user-1";
const NOW = new Date("2026-07-21T09:00:00.000Z");

const attemptCursor: AttemptHydrationCursor = {
  createdAt: "2026-07-20T08:00:05.000Z",
  clientAttemptId: "attempt-1",
};
const masteryCursor: MasteryHydrationCursor = {
  updatedAt: "2026-07-20T08:00:00.000Z",
  skillId: "skill-1",
};
const reviewCursor: ReviewHydrationCursor = {
  updatedAt: "2026-07-20T08:00:00.000Z",
  exerciseId: "exercise-1",
};

function attemptItem(
  overrides: Partial<CloudAttemptSnapshot> = {},
): CloudAttemptSnapshot {
  return {
    clientAttemptId: "attempt-1",
    sessionId: "session-1",
    exerciseId: "exercise-1",
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: true,
    startedAt: "2026-07-20T07:59:00.000Z",
    completedAt: "2026-07-20T08:00:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 3,
    recommendedKeystrokeCount: 3,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [],
    speedScore: 100,
    accuracyScore: 100,
    performanceQuality: 5,
    practiceContext: "different_exercise",
    createdAt: "2026-07-20T08:00:05.000Z",
    ...overrides,
  };
}

function masteryItem(
  overrides: Partial<CloudSkillMasterySnapshot> = {},
): CloudSkillMasterySnapshot {
  return {
    skillId: "skill-1",
    masteryScore: 78,
    masteryLevel: 4,
    successfulAttempts: 5,
    uniqueExerciseIds: ["exercise-1"],
    consecutiveSuccesses: 3,
    firstUnhintedSuccessAt: "2026-07-10T08:00:00.000Z",
    latestUnhintedSuccessAt: "2026-07-20T08:00:00.000Z",
    lastAttemptAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...overrides,
  };
}

function reviewItem(
  overrides: Partial<CloudExerciseReviewSnapshot> = {},
): CloudExerciseReviewSnapshot {
  return {
    exerciseId: "exercise-1",
    masteryLevel: 4,
    currentIntervalDays: 7,
    dueAt: "2026-08-03T08:00:00.000Z",
    lastPerformanceQuality: 5,
    lastAttemptAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...overrides,
  };
}

function page<TItem, TCursor>(
  items: TItem[],
  nextCursor: TCursor | null,
  hasMore: boolean,
): CloudPage<TItem, TCursor> {
  return { items, nextCursor, hasMore };
}

function createCloudRepository(
  overrides: Partial<CloudLearningStateRepository> = {},
): CloudLearningStateRepository {
  return {
    getSettings: vi.fn(async () => null),
    listAttemptsPage: vi.fn(async () =>
      page<CloudAttemptSnapshot, AttemptHydrationCursor>([], null, false),
    ),
    listMasteryPage: vi.fn(async () =>
      page<CloudSkillMasterySnapshot, MasteryHydrationCursor>(
        [],
        null,
        false,
      ),
    ),
    listReviewsPage: vi.fn(async () =>
      page<CloudExerciseReviewSnapshot, ReviewHydrationCursor>(
        [],
        null,
        false,
      ),
    ),
    ...overrides,
  };
}

async function seedMetadata(
  database: IDBDatabase,
  metadata: CloudHydrationMetadata,
): Promise<void> {
  const transaction = database.transaction(
    INDEXED_DB_STORES.metadata,
    "readwrite",
  );
  transaction.objectStore(INDEXED_DB_STORES.metadata).put(metadata);
  await transactionToPromise(transaction);
}

function callOrder(mock: { mock: { invocationCallOrder: number[] } }): number {
  const [order] = mock.mock.invocationCallOrder;
  if (order === undefined) {
    throw new Error("Expected mock to have been called at least once.");
  }
  return order;
}

describe("CloudHydrationService", () => {
  let database: IDBDatabase;

  beforeEach(async () => {
    await deleteVimForgeDatabase(DATABASE_NAME);
    database = await openVimForgeDatabase(DATABASE_NAME);
  });

  afterEach(async () => {
    database.close();
    await deleteVimForgeDatabase(DATABASE_NAME);
  });

  it("downloads and commits everything in the documented order", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const listAttemptsPage = vi.fn(async () =>
      page([attemptItem()], attemptCursor, false),
    );
    const listMasteryPage = vi.fn(async () =>
      page([masteryItem()], masteryCursor, false),
    );
    const listReviewsPage = vi.fn(async () =>
      page([reviewItem()], reviewCursor, false),
    );
    const cloudRepository = createCloudRepository({
      listAttemptsPage,
      listMasteryPage,
      listReviewsPage,
    });
    const hydrateSettings = vi.fn(async () => undefined);

    const bindSpy = vi.spyOn(ownerRepository, "bind");
    const metadataGetSpy = vi.spyOn(metadataRepository, "get");
    const captureSpy = vi.spyOn(committer, "captureProjectionRevisions");
    const commitAttemptsSpy = vi.spyOn(committer, "commitAttemptsPage");
    const commitMasterySpy = vi.spyOn(committer, "commitMasteryPage");
    const commitReviewsSpy = vi.spyOn(committer, "commitReviewsPage");
    const markCompletedSpy = vi.spyOn(metadataRepository, "markCompleted");

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings,
      now: () => NOW,
    });

    await service.downloadState(USER_ID);

    expect(callOrder(bindSpy)).toBeLessThan(callOrder(hydrateSettings));
    expect(callOrder(hydrateSettings)).toBeLessThan(callOrder(metadataGetSpy));
    expect(callOrder(metadataGetSpy)).toBeLessThan(callOrder(captureSpy));
    expect(callOrder(captureSpy)).toBeLessThan(callOrder(listAttemptsPage));
    expect(callOrder(listAttemptsPage)).toBeLessThan(
      callOrder(commitAttemptsSpy),
    );
    expect(callOrder(commitAttemptsSpy)).toBeLessThan(
      callOrder(listMasteryPage),
    );
    expect(callOrder(listMasteryPage)).toBeLessThan(
      callOrder(commitMasterySpy),
    );
    expect(callOrder(commitMasterySpy)).toBeLessThan(
      callOrder(listReviewsPage),
    );
    expect(callOrder(listReviewsPage)).toBeLessThan(
      callOrder(commitReviewsSpy),
    );
    expect(callOrder(commitReviewsSpy)).toBeLessThan(
      callOrder(markCompletedSpy),
    );
  });

  it("passes the saved cursors to the first page query of each entity", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    await seedMetadata(database, {
      key: "cloud-hydration",
      userId: USER_ID,
      attemptsCursor: attemptCursor,
      masteryCursor,
      reviewsCursor: reviewCursor,
      completedAt: null,
      schemaVersion: 1,
    });

    const listAttemptsPage = vi.fn(async () => page([], attemptCursor, false));
    const listMasteryPage = vi.fn(async () => page([], masteryCursor, false));
    const listReviewsPage = vi.fn(async () => page([], reviewCursor, false));
    const cloudRepository = createCloudRepository({
      listAttemptsPage,
      listMasteryPage,
      listReviewsPage,
    });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    await service.downloadState(USER_ID);

    expect(listAttemptsPage).toHaveBeenCalledWith(attemptCursor);
    expect(listMasteryPage).toHaveBeenCalledWith(masteryCursor);
    expect(listReviewsPage).toHaveBeenCalledWith(reviewCursor);
  });

  it("loops through multiple pages for each entity until hasMore is false", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const secondAttemptCursor: AttemptHydrationCursor = {
      createdAt: "2026-07-21T08:00:00.000Z",
      clientAttemptId: "attempt-2",
    };
    const listAttemptsPage = vi
      .fn<
        (
          cursor: AttemptHydrationCursor | null,
        ) => Promise<CloudPage<CloudAttemptSnapshot, AttemptHydrationCursor>>
      >()
      .mockResolvedValueOnce(page([attemptItem()], attemptCursor, true))
      .mockResolvedValueOnce(
        page(
          [attemptItem({ clientAttemptId: "attempt-2" })],
          secondAttemptCursor,
          false,
        ),
      );
    const cloudRepository = createCloudRepository({ listAttemptsPage });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    const result = await service.downloadState(USER_ID);

    expect(listAttemptsPage).toHaveBeenCalledTimes(2);
    expect(listAttemptsPage).toHaveBeenNthCalledWith(1, null);
    expect(listAttemptsPage).toHaveBeenNthCalledWith(2, attemptCursor);
    expect(result.attempts.inserted).toBe(2);
  });

  it("captures the projection revision snapshot exactly once, after settings and before any projection commit", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const captureSpy = vi.spyOn(committer, "captureProjectionRevisions");
    const hydrateSettings = vi.fn(async () => undefined);
    const listAttemptsPage = vi.fn(async () => page<CloudAttemptSnapshot, AttemptHydrationCursor>([], null, false));
    const listMasteryPage = vi
      .fn<
        (
          cursor: MasteryHydrationCursor | null,
        ) => Promise<CloudPage<CloudSkillMasterySnapshot, MasteryHydrationCursor>>
      >()
      .mockResolvedValueOnce(page([masteryItem()], masteryCursor, true))
      .mockResolvedValueOnce(page([], masteryCursor, false));
    const cloudRepository = createCloudRepository({
      listAttemptsPage,
      listMasteryPage,
    });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings,
      now: () => NOW,
    });

    await service.downloadState(USER_ID);

    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(callOrder(captureSpy)).toBeGreaterThan(callOrder(hydrateSettings));
    expect(callOrder(captureSpy)).toBeLessThan(callOrder(listAttemptsPage));
  });

  it("stops all cloud reads when binding the account conflicts", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    await ownerRepository.bind("someone-else");
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const hydrateSettings = vi.fn(async () => undefined);
    const listAttemptsPage = vi.fn(async () => page<CloudAttemptSnapshot, AttemptHydrationCursor>([], null, false));
    const cloudRepository = createCloudRepository({ listAttemptsPage });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings,
      now: () => NOW,
    });

    await expect(service.downloadState(USER_ID)).rejects.toThrow();

    expect(hydrateSettings).not.toHaveBeenCalled();
    expect(listAttemptsPage).not.toHaveBeenCalled();
  });

  it("stops after an attempt page failure, before any mastery or review work", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const markCompletedSpy = vi.spyOn(metadataRepository, "markCompleted");
    const listMasteryPage = vi.fn(async () => page<CloudSkillMasterySnapshot, MasteryHydrationCursor>([], null, false));
    const listReviewsPage = vi.fn(async () => page<CloudExerciseReviewSnapshot, ReviewHydrationCursor>([], null, false));
    const cloudRepository = createCloudRepository({
      listAttemptsPage: vi.fn(async () => {
        throw new Error("network down");
      }),
      listMasteryPage,
      listReviewsPage,
    });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    await expect(service.downloadState(USER_ID)).rejects.toThrow(
      "network down",
    );

    expect(listMasteryPage).not.toHaveBeenCalled();
    expect(listReviewsPage).not.toHaveBeenCalled();
    expect(markCompletedSpy).not.toHaveBeenCalled();
  });

  it("stops after a mastery failure, before any review work or completion mark", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const markCompletedSpy = vi.spyOn(metadataRepository, "markCompleted");
    const listReviewsPage = vi.fn(async () => page<CloudExerciseReviewSnapshot, ReviewHydrationCursor>([], null, false));
    const cloudRepository = createCloudRepository({
      listMasteryPage: vi.fn(async () => {
        throw new Error("mastery query failed");
      }),
      listReviewsPage,
    });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    await expect(service.downloadState(USER_ID)).rejects.toThrow(
      "mastery query failed",
    );

    expect(listReviewsPage).not.toHaveBeenCalled();
    expect(markCompletedSpy).not.toHaveBeenCalled();
  });

  it("stops after a review failure, before the completion mark", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const markCompletedSpy = vi.spyOn(metadataRepository, "markCompleted");
    const cloudRepository = createCloudRepository({
      listReviewsPage: vi.fn(async () => {
        throw new Error("review query failed");
      }),
    });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    await expect(service.downloadState(USER_ID)).rejects.toThrow(
      "review query failed",
    );

    expect(markCompletedSpy).not.toHaveBeenCalled();
  });

  it("marks hydration completed exactly once on success", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const markCompletedSpy = vi.spyOn(metadataRepository, "markCompleted");
    const cloudRepository = createCloudRepository();

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    await service.downloadState(USER_ID);

    expect(markCompletedSpy).toHaveBeenCalledTimes(1);
    expect(markCompletedSpy).toHaveBeenCalledWith(USER_ID, NOW.toISOString());

    const metadata = await metadataRepository.get(USER_ID);
    expect(metadata.completedAt).toBe(NOW.toISOString());
  });

  it("does not duplicate attempts when downloadState is called twice with the same page", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const cloudRepository = createCloudRepository({
      listAttemptsPage: vi.fn(async () =>
        page([attemptItem()], attemptCursor, false),
      ),
    });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    const first = await service.downloadState(USER_ID);
    const second = await service.downloadState(USER_ID);

    expect(first.attempts).toEqual({ inserted: 1, preservedPending: 0 });
    expect(second.attempts).toEqual({ inserted: 0, preservedPending: 0 });
  });

  it("never calls GuestSyncService", async () => {
    const syncPendingSpy = vi.spyOn(GuestSyncService.prototype, "syncPending");
    const saveCompletedAttemptSpy = vi.spyOn(
      GuestSyncService.prototype,
      "saveCompletedAttempt",
    );
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const cloudRepository = createCloudRepository();

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    await service.downloadState(USER_ID);

    expect(syncPendingSpy).not.toHaveBeenCalled();
    expect(saveCompletedAttemptSpy).not.toHaveBeenCalled();

    syncPendingSpy.mockRestore();
    saveCompletedAttemptSpy.mockRestore();
  });

  it("rejects a page that reports hasMore with a null cursor", async () => {
    const ownerRepository = new LocalDataOwnerRepository(database);
    const metadataRepository = new CloudHydrationMetadataRepository(database);
    const committer = new IndexedDbCloudHydrationCommitter(database);
    const cloudRepository = createCloudRepository({
      listAttemptsPage: vi.fn(async () => page<CloudAttemptSnapshot, AttemptHydrationCursor>([attemptItem()], null, true)),
    });

    const service = new CloudHydrationService({
      ownerRepository,
      cloudRepository,
      committer,
      metadataRepository,
      hydrateSettings: vi.fn(async () => undefined),
      now: () => NOW,
    });

    await expect(service.downloadState(USER_ID)).rejects.toThrow();
  });
});
