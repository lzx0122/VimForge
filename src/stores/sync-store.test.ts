import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CloudHydrationResult } from "../features/cloud-hydration/services/cloud-hydration-service";
import { CloudHydrationService } from "../features/cloud-hydration/services/cloud-hydration-service";
import type { GuestSyncResult } from "../features/guest-sync/services/guest-sync-service";
import { GuestSyncService } from "../features/guest-sync/services/guest-sync-service";
import {
  LocalDataOwnerConflictError,
  LocalDataOwnerRepository,
} from "../infrastructure/indexed-db/local-data-owner-repository";
import { useAuthStore } from "./auth-store";
import type { SyncCoordinationDependencies } from "./sync-store";
import { useSyncStore } from "./sync-store";

function emptyGuestSyncResult(
  overrides: Partial<GuestSyncResult> = {},
): GuestSyncResult {
  return { total: 0, synced: 0, failed: 0, pending: 0, ...overrides };
}

function emptyHydrationResult(): CloudHydrationResult {
  return {
    attempts: { inserted: 0, preservedPending: 0 },
    mastery: { applied: 0, skippedNewer: 0 },
    reviews: { applied: 0, skippedNewer: 0 },
  };
}

function asGuestSyncService(fake: {
  syncPending: () => Promise<GuestSyncResult>;
  onNetworkChange: (listener: (online: boolean) => void) => () => void;
  isOnline?: () => boolean;
  countPending?: () => Promise<number>;
}): GuestSyncService {
  return {
    isOnline: fake.isOnline ?? (() => true),
    countPending: fake.countPending ?? (async () => 0),
    ...fake,
  } as unknown as GuestSyncService;
}

function asCloudHydrationService(fake: {
  downloadState: (userId: string) => Promise<CloudHydrationResult>;
}): CloudHydrationService {
  return fake as unknown as CloudHydrationService;
}

function asOwnerRepository(fake: {
  bind: (userId: string) => Promise<void>;
}): Pick<LocalDataOwnerRepository, "bind"> {
  return fake;
}

function resolvingOwnerRepository(): Pick<LocalDataOwnerRepository, "bind"> {
  return asOwnerRepository({ bind: vi.fn(async () => undefined) });
}

describe("sync store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("syncAndHydrate", () => {
    it("verifies account ownership, then uploads, then hydrates, in order", async () => {
      const calls: string[] = [];
      const bind = vi.fn(async () => {
        calls.push("bind");
      });
      const syncPending = vi.fn(async () => {
        calls.push("syncPending");
        return emptyGuestSyncResult();
      });
      const downloadState = vi.fn(async () => {
        calls.push("downloadState");
        return emptyHydrationResult();
      });
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: asOwnerRepository({ bind }),
        guestSyncService: asGuestSyncService({
          syncPending,
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate("user-1", dependencies);

      expect(calls).toEqual(["bind", "syncPending", "downloadState"]);
    });

    it("does not hydrate when attempts remain pending", async () => {
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () =>
            emptyGuestSyncResult({ total: 2, pending: 2 }),
          ),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate("user-1", dependencies);

      expect(downloadState).not.toHaveBeenCalled();
      expect(store.pendingCount).toBe(2);
    });

    it("does not hydrate when an upload failed", async () => {
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () =>
            emptyGuestSyncResult({ total: 2, synced: 1, failed: 1, pending: 1 }),
          ),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate("user-1", dependencies);

      expect(downloadState).not.toHaveBeenCalled();
      expect(store.failedCount).toBe(1);
    });

    it("increments localLearningStateRevision exactly once on success", async () => {
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({
          downloadState: vi.fn(async () => emptyHydrationResult()),
        }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate("user-1", dependencies);

      expect(store.localLearningStateRevision).toBe(1);
      expect(store.hydratedUserId).toBe("user-1");
    });

    it("shares one in-flight operation between two concurrent calls for the same user", async () => {
      let resolveDownload!: (value: CloudHydrationResult) => void;
      const downloadState = vi.fn(
        () =>
          new Promise<CloudHydrationResult>((resolve) => {
            resolveDownload = resolve;
          }),
      );
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending,
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      const first = store.syncAndHydrate("user-1", dependencies);
      const second = store.syncAndHydrate("user-1", dependencies);

      await vi.waitFor(() => expect(downloadState).toHaveBeenCalled());
      resolveDownload(emptyHydrationResult());
      await Promise.all([first, second]);

      expect(syncPending).toHaveBeenCalledTimes(1);
      expect(downloadState).toHaveBeenCalledTimes(1);
      expect(store.localLearningStateRevision).toBe(1);
    });

    it("does not share an active operation with another user", async () => {
      let resolveUserA!: (value: CloudHydrationResult) => void;
      const downloadState = vi.fn(
        (userId: string) =>
          new Promise<CloudHydrationResult>((resolve) => {
            if (userId === "user-a") {
              resolveUserA = resolve;
            } else {
              resolve(emptyHydrationResult());
            }
          }),
      );
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      const userAOperation = store.syncAndHydrate("user-a", dependencies);
      await vi.waitFor(() =>
        expect(downloadState).toHaveBeenCalledWith("user-a"),
      );

      const userBOperation = store.syncAndHydrate("user-b", dependencies);

      resolveUserA(emptyHydrationResult());
      await Promise.all([userAOperation, userBOperation]);

      expect(downloadState.mock.calls).toEqual([["user-a"], ["user-b"]]);
    });

    it("starts a fresh operation for the same user after the authentication generation changes", async () => {
      let resolveFirstDownload!: (result: CloudHydrationResult) => void;
      const downloadState = vi
        .fn<(userId: string) => Promise<CloudHydrationResult>>()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirstDownload = resolve;
            }),
        )
        .mockResolvedValueOnce(emptyHydrationResult());
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.setAuthenticated("user-a", dependencies);
      const firstOperation = store.syncAndHydrate("user-a", dependencies);

      await vi.waitFor(() => expect(downloadState).toHaveBeenCalledTimes(1));

      await store.setAuthenticated("user-a", dependencies);

      resolveFirstDownload(emptyHydrationResult());
      await firstOperation;

      await vi.waitFor(() => expect(downloadState).toHaveBeenCalledTimes(2));

      expect(downloadState.mock.calls).toEqual([["user-a"], ["user-a"]]);
    });

    it("does not start a queued account after sign-out changes the generation", async () => {
      let resolveUserA!: (result: CloudHydrationResult) => void;
      const downloadState = vi.fn((userId: string) => {
        if (userId === "user-a") {
          return new Promise<CloudHydrationResult>((resolve) => {
            resolveUserA = resolve;
          });
        }
        return Promise.resolve(emptyHydrationResult());
      });
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.setAuthenticated("user-a", dependencies);
      const userAOperation = store.syncAndHydrate("user-a", dependencies);
      await vi.waitFor(() =>
        expect(downloadState).toHaveBeenCalledWith("user-a"),
      );

      const queuedUserB = store.syncAndHydrate("user-b", dependencies);

      await store.setAuthenticated(null, dependencies);

      resolveUserA(emptyHydrationResult());
      await Promise.all([userAOperation, queuedUserB]);

      expect(downloadState).not.toHaveBeenCalledWith("user-b");
      expect(store.hydratedUserId).toBeNull();
      expect(store.localLearningStateRevision).toBe(0);
    });

    it("does not bind, upload, or download when sign-out occurs while the owner repository is resolving", async () => {
      let resolveOwner!: (repo: Pick<LocalDataOwnerRepository, "bind">) => void;
      const bind = vi.fn(async () => undefined);
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const ownerPromise = new Promise<Pick<LocalDataOwnerRepository, "bind">>(
        (resolve) => {
          resolveOwner = resolve;
        },
      );
      const dependencies: SyncCoordinationDependencies = {
        resolveOwnerRepository: () => ownerPromise,
        guestSyncService: asGuestSyncService({
          syncPending,
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      const staleOperation = store.syncAndHydrate("user-a", dependencies);

      await store.setAuthenticated(null, dependencies);

      resolveOwner(asOwnerRepository({ bind }));
      await staleOperation;

      expect(bind).not.toHaveBeenCalled();
      expect(syncPending).not.toHaveBeenCalled();
      expect(downloadState).not.toHaveBeenCalled();
    });

    it("does not upload or hydrate when sign-out occurs while the guest sync service is resolving inside the operation", async () => {
      let resolveService!: (service: GuestSyncService) => void;
      const bind = vi.fn(async () => undefined);
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const onNetworkChange = vi.fn(() => () => undefined);
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const servicePromise = new Promise<GuestSyncService>((resolve) => {
        resolveService = resolve;
      });
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: asOwnerRepository({ bind }),
        resolveGuestSyncService: () => servicePromise,
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      const staleOperation = store.syncAndHydrate("user-a", dependencies);

      await vi.waitFor(() => expect(bind).toHaveBeenCalledWith("user-a"));

      await store.setAuthenticated(null, dependencies);

      resolveService(asGuestSyncService({ syncPending, onNetworkChange }));
      await staleOperation;

      expect(syncPending).not.toHaveBeenCalled();
      expect(downloadState).not.toHaveBeenCalled();
    });

    it("does not download when sign-out occurs while the cloud hydration service is resolving", async () => {
      let resolveService!: (service: CloudHydrationService) => void;
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const servicePromise = new Promise<CloudHydrationService>((resolve) => {
        resolveService = resolve;
      });
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        resolveCloudHydrationService: () => servicePromise,
      };
      const store = useSyncStore();

      const staleOperation = store.syncAndHydrate("user-a", dependencies);

      await vi.waitFor(() => expect(store.hydrating).toBe(true));

      await store.setAuthenticated(null, dependencies);

      resolveService(asCloudHydrationService({ downloadState }));
      await staleOperation;

      expect(downloadState).not.toHaveBeenCalled();
    });

    it("uses the authenticated user's id when no userId argument is given", async () => {
      const authStore = useAuthStore();
      authStore.$patch({
        session: { user: { id: "user-from-auth-store" } } as never,
      });
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate(undefined, dependencies);

      expect(downloadState).toHaveBeenCalledWith("user-from-auth-store");
    });

    it("records a hydration error and leaves local data usable when hydration fails for a reason other than an account conflict", async () => {
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({
          downloadState: vi.fn(async () => {
            throw new Error("network down");
          }),
        }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate("user-1", dependencies);

      expect(store.hydrationErrorMessage).toBe(
        "雲端進度暫時無法恢復，本機資料仍可使用。",
      );
      expect(store.accountConflictMessage).toBeNull();
      expect(store.hydrating).toBe(false);
    });

    it("does not upload or hydrate when the local database belongs to another account", async () => {
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const bind = vi.fn(async () => {
        throw new LocalDataOwnerConflictError("user-a", "user-b");
      });
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: asOwnerRepository({ bind }),
        guestSyncService: asGuestSyncService({
          syncPending,
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate("user-b", dependencies);

      expect(bind).toHaveBeenCalledWith("user-b");
      expect(syncPending).not.toHaveBeenCalled();
      expect(downloadState).not.toHaveBeenCalled();
      expect(store.accountConflictMessage).toBe(
        "此瀏覽器已有其他帳號的本機學習資料，已停止同步。",
      );
    });
  });

  describe("setAuthenticated", () => {
    it("runs the complete upload-then-hydrate operation when the network comes back online", async () => {
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const onNetworkChange = vi.fn<
        (listener: (online: boolean) => void) => () => void
      >(() => () => undefined);
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({ syncPending, onNetworkChange }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.setAuthenticated("user-1", dependencies);
      // Let the initial sync-and-hydrate that setAuthenticated itself
      // triggers fully settle - including activeSyncAndHydrate's `finally`
      // reset, which lags one microtask behind the operation's own
      // resolution - so the online-retry call below starts a genuinely
      // fresh operation instead of reusing the already-finished one.
      await new Promise((resolve) => setTimeout(resolve, 0));
      syncPending.mockClear();
      downloadState.mockClear();

      const listener = onNetworkChange.mock.calls[0]?.[0];
      expect(listener).toBeDefined();
      listener?.(true);

      await vi.waitFor(() => expect(downloadState).toHaveBeenCalled());
      expect(syncPending).toHaveBeenCalledTimes(1);
    });

    it("sets the conflict state and makes no further calls once an account conflict occurs", async () => {
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const downloadState = vi.fn(async () => {
        throw new LocalDataOwnerConflictError("user-a", "user-b");
      });
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending,
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.syncAndHydrate("user-b", dependencies);

      expect(store.accountConflictMessage).toBe(
        "此瀏覽器已有其他帳號的本機學習資料，已停止同步。",
      );

      syncPending.mockClear();
      downloadState.mockClear();

      await store.syncAndHydrate("user-b", dependencies);

      expect(syncPending).not.toHaveBeenCalled();
      expect(downloadState).not.toHaveBeenCalled();
    });

    it("stops the online retry listener, preserves local counts, and clears syncing on sign-out", async () => {
      const stopListener = vi.fn();
      const onNetworkChange = vi.fn(() => stopListener);
      let resolveSyncPending!: (result: GuestSyncResult) => void;
      const syncPending = vi.fn(
        () =>
          new Promise<GuestSyncResult>((resolve) => {
            resolveSyncPending = resolve;
          }),
      );
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({ syncPending, onNetworkChange }),
      };
      const store = useSyncStore();
      store.pendingCount = 3;
      store.failedCount = 1;

      await store.setAuthenticated("user-1", dependencies);
      const activeOperation = store.syncAndHydrate("user-1", dependencies);
      await vi.waitFor(() => expect(store.syncing).toBe(true));

      await store.setAuthenticated(null, dependencies);

      expect(stopListener).toHaveBeenCalledTimes(1);
      expect(store.pendingCount).toBe(3);
      expect(store.failedCount).toBe(1);
      expect(store.hydratedUserId).toBeNull();
      expect(store.hydrating).toBe(false);
      expect(store.hydrationErrorMessage).toBeNull();
      expect(store.accountConflictMessage).toBeNull();
      expect(store.syncing).toBe(false);

      resolveSyncPending(emptyGuestSyncResult());
      await activeOperation;

      expect(store.syncing).toBe(false);
    });

    it("does not install a listener or start coordination when sign-out occurs while the guest sync service is resolving", async () => {
      let resolveService!: (service: GuestSyncService) => void;
      const onNetworkChange = vi.fn(() => () => undefined);
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const servicePromise = new Promise<GuestSyncService>((resolve) => {
        resolveService = resolve;
      });
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        resolveGuestSyncService: () => servicePromise,
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      const staleAuthentication = store.setAuthenticated(
        "user-a",
        dependencies,
      );

      await store.setAuthenticated(null, dependencies);

      resolveService(asGuestSyncService({ syncPending, onNetworkChange }));

      await staleAuthentication;
      await Promise.resolve();

      expect(onNetworkChange).not.toHaveBeenCalled();
      expect(syncPending).not.toHaveBeenCalled();
      expect(downloadState).not.toHaveBeenCalled();
    });

    it("does not restore hydration state after signing out during an in-flight download", async () => {
      let resolveDownload!: (value: CloudHydrationResult) => void;
      const downloadState = vi.fn(
        () =>
          new Promise<CloudHydrationResult>((resolve) => {
            resolveDownload = resolve;
          }),
      );
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.setAuthenticated("user-a", dependencies);
      const activeOperation = store.syncAndHydrate("user-a", dependencies);

      await vi.waitFor(() => expect(downloadState).toHaveBeenCalled());

      await store.setAuthenticated(null, dependencies);

      resolveDownload(emptyHydrationResult());
      await activeOperation;

      expect(store.hydratedUserId).toBeNull();
      expect(store.localLearningStateRevision).toBe(0);
      expect(store.hydrating).toBe(false);
      expect(store.hydrationErrorMessage).toBeNull();
      expect(store.accountConflictMessage).toBeNull();
    });

    it("passes the given user id (not a boolean) as the hydration target", async () => {
      const downloadState = vi.fn(async () => emptyHydrationResult());
      const dependencies: SyncCoordinationDependencies = {
        ownerRepository: resolvingOwnerRepository(),
        guestSyncService: asGuestSyncService({
          syncPending: vi.fn(async () => emptyGuestSyncResult()),
          onNetworkChange: vi.fn(() => () => undefined),
        }),
        cloudHydrationService: asCloudHydrationService({ downloadState }),
      };
      const store = useSyncStore();

      await store.setAuthenticated("user-42", dependencies);
      await vi.waitFor(() => expect(downloadState).toHaveBeenCalled());

      expect(downloadState).toHaveBeenCalledWith("user-42");
    });
  });

  describe("bannerState", () => {
    it("is null when nothing needs attention", () => {
      const store = useSyncStore();
      store.online = true;

      expect(store.bannerState).toBeNull();
    });

    it("shows the pending message with the current count", () => {
      const store = useSyncStore();
      store.pendingCount = 4;

      expect(store.bannerState).toEqual({
        kind: "pending",
        message: "尚有 4 筆紀錄等待同步。",
      });
    });

    it("shows the offline message and outranks pending", () => {
      const store = useSyncStore();
      store.online = false;
      store.pendingCount = 4;

      expect(store.bannerState).toEqual({
        kind: "offline",
        message: "目前離線，紀錄已保存在這台裝置。",
      });
    });

    it("shows the hydration error message and outranks offline", () => {
      const store = useSyncStore();
      store.online = false;
      store.hydrationErrorMessage = "雲端進度暫時無法恢復，本機資料仍可使用。";

      expect(store.bannerState).toEqual({
        kind: "hydration-error",
        message: "雲端進度暫時無法恢復，本機資料仍可使用。",
      });
    });

    it("shows the hydrating message and outranks a hydration error", () => {
      const store = useSyncStore();
      store.hydrationErrorMessage = "雲端進度暫時無法恢復，本機資料仍可使用。";
      store.hydrating = true;

      expect(store.bannerState).toEqual({
        kind: "hydrating",
        message: "正在恢復帳號學習進度…",
      });
    });

    it("shows the account conflict message and outranks everything else", () => {
      const store = useSyncStore();
      store.hydrating = true;
      store.accountConflictMessage =
        "此瀏覽器已有其他帳號的本機學習資料，已停止同步。";

      expect(store.bannerState).toEqual({
        kind: "conflict",
        message: "此瀏覽器已有其他帳號的本機學習資料，已停止同步。",
      });
    });
  });

  describe("initialize", () => {
    function createInitService(
      overrides: Partial<{
        isOnline: () => boolean;
        countPending: () => Promise<number>;
        onNetworkChange: (listener: (online: boolean) => void) => () => void;
      }> = {},
    ): GuestSyncService {
      return {
        isOnline: overrides.isOnline ?? (() => true),
        countPending: overrides.countPending ?? (async () => 0),
        onNetworkChange: overrides.onNetworkChange ?? (() => () => undefined),
      } as unknown as GuestSyncService;
    }

    it("reads the initial online status and pending count", async () => {
      const service = createInitService({
        isOnline: () => false,
        countPending: async () => 5,
      });
      const store = useSyncStore();

      await store.initialize(service);

      expect(store.online).toBe(false);
      expect(store.pendingCount).toBe(5);
      expect(store.initialized).toBe(true);
    });

    it("subscribes to network changes and refreshes pending count", async () => {
      let listener: ((online: boolean) => void) | undefined;
      const countPending = vi
        .fn<() => Promise<number>>()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2);
      const service = createInitService({
        onNetworkChange: (onlineListener) => {
          listener = onlineListener;
          return () => undefined;
        },
        countPending,
      });
      const store = useSyncStore();

      await store.initialize(service);
      listener?.(false);
      await vi.waitFor(() => expect(store.pendingCount).toBe(2));

      expect(store.online).toBe(false);
    });
  });

  describe("notifyAttemptCommitted", () => {
    it("triggers a sync when the user is authenticated", async () => {
      const authStore = useAuthStore();
      authStore.$patch({ session: { user: { id: "user-1" } } as never });
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const service = {
        countPending: async () => 0,
        syncPending,
      } as unknown as GuestSyncService;
      const store = useSyncStore();

      await store.notifyAttemptCommitted(service);
      await vi.waitFor(() => expect(syncPending).toHaveBeenCalled());
    });

    it("does not sync when the user is a guest", async () => {
      const syncPending = vi.fn(async () => emptyGuestSyncResult());
      const service = {
        countPending: async () => 0,
        syncPending,
      } as unknown as GuestSyncService;
      const store = useSyncStore();

      await store.notifyAttemptCommitted(service);

      expect(syncPending).not.toHaveBeenCalled();
    });
  });
});
