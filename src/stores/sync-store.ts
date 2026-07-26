import { defineStore } from "pinia";

import { CloudHydrationService } from "../features/cloud-hydration/services/cloud-hydration-service";
import {
  createBrowserNetworkMonitor,
  GuestSyncService,
  type GuestSyncResult,
} from "../features/guest-sync/services/guest-sync-service";
import { AttemptRepository } from "../infrastructure/indexed-db/attempt-repository";
import { IndexedDbCloudHydrationCommitter } from "../infrastructure/indexed-db/cloud-hydration-committer";
import { CloudHydrationMetadataRepository } from "../infrastructure/indexed-db/cloud-hydration-metadata-repository";
import { openVimForgeDatabase } from "../infrastructure/indexed-db/database";
import {
  LocalDataOwnerConflictError,
  LocalDataOwnerRepository,
} from "../infrastructure/indexed-db/local-data-owner-repository";
import { IndexedDbSyncedAttemptCommitter } from "../infrastructure/indexed-db/synced-attempt-committer";
import { reportError } from "../infrastructure/monitoring/error-reporter";
import { SupabaseAttemptSyncRepository } from "../infrastructure/supabase/supabase-attempt-sync-repository";
import { SupabaseCloudLearningStateRepository } from "../infrastructure/supabase/supabase-cloud-learning-state-repository";
import { useAuthStore } from "./auth-store";
import { useSettingsStore } from "./settings-store";

interface SyncStoreState {
  initialized: boolean;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  errorMessage: string | null;
  hydrating: boolean;
  hydratedUserId: string | null;
  hydrationErrorMessage: string | null;
  accountConflictMessage: string | null;
  localLearningStateRevision: number;
}

export interface SyncCoordinationDependencies {
  ownerRepository?: Pick<LocalDataOwnerRepository, "bind">;
  guestSyncService?: GuestSyncService;
  resolveGuestSyncService?: () => Promise<GuestSyncService>;
  cloudHydrationService?: CloudHydrationService;
}

interface ActiveSyncAndHydrate {
  userId: string;
  generation: number;
  promise: Promise<void>;
}

export type SyncBannerState =
  | { kind: "conflict"; message: string }
  | { kind: "hydrating"; message: string }
  | { kind: "hydration-error"; message: string }
  | { kind: "offline"; message: string }
  | { kind: "pending"; message: string };

const ACCOUNT_CONFLICT_MESSAGE =
  "此瀏覽器已有其他帳號的本機學習資料，已停止同步。";
const HYDRATING_MESSAGE = "正在恢復帳號學習進度…";
const HYDRATION_ERROR_MESSAGE = "雲端進度暫時無法恢復，本機資料仍可使用。";
const OFFLINE_MESSAGE = "目前離線，紀錄已保存在這台裝置。";

let defaultServicePromise: Promise<GuestSyncService> | null = null;
let defaultCloudHydrationServicePromise: Promise<CloudHydrationService> | null =
  null;
let defaultOwnerRepositoryPromise: Promise<LocalDataOwnerRepository> | null =
  null;
let stopNetworkStatus: (() => void) | null = null;
let stopOnlineRetry: (() => void) | null = null;
let activeSyncAndHydrate: ActiveSyncAndHydrate | null = null;

// Incremented by every setAuthenticated() call, including sign-out, so an
// in-flight operation started for a previous account (or before sign-out)
// can detect it is stale and stop touching Store state once it resumes.
let authGeneration = 0;

async function createDefaultOwnerRepository(): Promise<LocalDataOwnerRepository> {
  const database = await openVimForgeDatabase();

  return new LocalDataOwnerRepository(database);
}

function getDefaultOwnerRepository(): Promise<LocalDataOwnerRepository> {
  defaultOwnerRepositoryPromise ??= createDefaultOwnerRepository();

  return defaultOwnerRepositoryPromise;
}

async function createDefaultService(): Promise<GuestSyncService> {
  const database = await openVimForgeDatabase();

  return new GuestSyncService(
    new AttemptRepository(database),
    new SupabaseAttemptSyncRepository(),
    createBrowserNetworkMonitor(),
    new IndexedDbSyncedAttemptCommitter(database),
  );
}

function getDefaultService(): Promise<GuestSyncService> {
  defaultServicePromise ??= createDefaultService();

  return defaultServicePromise;
}

async function resolveGuestSyncService(
  dependencies?: SyncCoordinationDependencies,
): Promise<GuestSyncService> {
  if (dependencies?.guestSyncService) {
    return dependencies.guestSyncService;
  }
  if (dependencies?.resolveGuestSyncService) {
    return dependencies.resolveGuestSyncService();
  }
  return getDefaultService();
}

async function createDefaultCloudHydrationService(): Promise<CloudHydrationService> {
  const database = await openVimForgeDatabase();

  return new CloudHydrationService({
    ownerRepository: new LocalDataOwnerRepository(database),
    cloudRepository: new SupabaseCloudLearningStateRepository(),
    committer: new IndexedDbCloudHydrationCommitter(database),
    metadataRepository: new CloudHydrationMetadataRepository(database),
    hydrateSettings: (userId) => useSettingsStore().hydrateFromCloud(userId),
    now: () => new Date(),
  });
}

function getDefaultCloudHydrationService(): Promise<CloudHydrationService> {
  defaultCloudHydrationServicePromise ??= createDefaultCloudHydrationService();

  return defaultCloudHydrationServicePromise;
}

function getErrorMessage(): string {
  return "無法讀取這台裝置上的待同步紀錄。";
}

export const useSyncStore = defineStore("sync", {
  state: (): SyncStoreState => ({
    initialized: false,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    syncing: false,
    pendingCount: 0,
    failedCount: 0,
    errorMessage: null,
    hydrating: false,
    hydratedUserId: null,
    hydrationErrorMessage: null,
    accountConflictMessage: null,
    localLearningStateRevision: 0,
  }),

  getters: {
    /** Exactly one highest-priority state is shown at a time. */
    bannerState: (state): SyncBannerState | null => {
      if (state.accountConflictMessage !== null) {
        return { kind: "conflict", message: state.accountConflictMessage };
      }
      if (state.hydrating) {
        return { kind: "hydrating", message: HYDRATING_MESSAGE };
      }
      if (state.hydrationErrorMessage !== null) {
        return {
          kind: "hydration-error",
          message: state.hydrationErrorMessage,
        };
      }
      if (!state.online) {
        return { kind: "offline", message: OFFLINE_MESSAGE };
      }
      if (state.pendingCount > 0) {
        return {
          kind: "pending",
          message: `尚有 ${state.pendingCount} 筆紀錄等待同步。`,
        };
      }
      return null;
    },
  },

  actions: {
    async initialize(service?: GuestSyncService): Promise<void> {
      const activeService = service ?? (await getDefaultService());
      this.online = activeService.isOnline();
      this.errorMessage = null;

      try {
        await this.refreshPending(activeService);
        stopNetworkStatus?.();
        stopNetworkStatus = activeService.onNetworkChange((online) => {
          this.online = online;
          void this.refreshPending(activeService);
        });
      } catch (error: unknown) {
        reportError("sync.initialize", error);
        this.errorMessage = getErrorMessage();
      } finally {
        this.initialized = true;
      }
    },

    // Call only after commitAttemptOutcome's atomic local transaction succeeds.
    async notifyAttemptCommitted(service?: GuestSyncService): Promise<void> {
      const activeService = service ?? (await getDefaultService());
      await this.refreshPending(activeService);

      if (useAuthStore().isAuthenticated) {
        void this.syncPending(activeService);
      }
    },

    /**
     * userId is the account's id, not a boolean - hydration needs it to
     * bind the local database and download that account's cloud state.
     * Passing null means signed out.
     */
    async setAuthenticated(
      userId: string | null,
      dependencies?: SyncCoordinationDependencies,
    ): Promise<void> {
      const generation = ++authGeneration;
      stopOnlineRetry?.();
      stopOnlineRetry = null;

      if (userId === null) {
        this.syncing = false;
        this.hydrating = false;
        this.hydratedUserId = null;
        this.hydrationErrorMessage = null;
        this.accountConflictMessage = null;
        return;
      }

      this.hydrationErrorMessage = null;
      this.accountConflictMessage = null;

      const guestSyncService = await resolveGuestSyncService(dependencies);
      // A newer setAuthenticated() call (including a sign-out) may have
      // already run to completion while the service above was resolving;
      // this call must not install a listener, replace the current
      // listener handle, or start coordination on its behalf.
      if (generation !== authGeneration) {
        return;
      }

      // GuestSyncService.retryWhenOnline only re-runs syncPending(); the
      // complete upload-first-then-hydrate operation is syncAndHydrate, so
      // the store subscribes to network changes itself instead. The
      // listener re-checks the generation at fire time too, since it can
      // outlive this call by a long margin.
      stopOnlineRetry = guestSyncService.onNetworkChange((online) => {
        if (online && generation === authGeneration) {
          void this.syncAndHydrate(userId, dependencies);
        }
      });

      void this.syncAndHydrate(userId, dependencies);
    },

    /**
     * Verifies this device's local database belongs to the requested
     * account, uploads every pending Attempt, and only then hydrates -
     * cloud hydration never runs while pending/failed Attempts remain, and
     * never runs against a local database bound to a different account.
     *
     * Concurrent calls for the SAME user in the SAME authentication
     * generation share one in-flight operation. A call for a different
     * user, or the same user in a newer generation (e.g. setAuthenticated
     * was called again for the same account), never reuses that operation
     * - two coordinations must never run concurrently against the same
     * local database - it waits for the current one to settle, then
     * re-evaluates from scratch.
     */
    async syncAndHydrate(
      userId?: string,
      dependencies?: SyncCoordinationDependencies,
    ): Promise<void> {
      const targetUserId = userId ?? useAuthStore().currentUser?.id ?? null;
      if (targetUserId === null) {
        return;
      }

      const current = activeSyncAndHydrate;
      if (current !== null) {
        if (
          current.userId === targetUserId &&
          current.generation === authGeneration
        ) {
          return current.promise;
        }
        await current.promise.catch(() => undefined);
        return this.syncAndHydrate(userId, dependencies);
      }

      const generation = authGeneration;
      const operation = {
        userId: targetUserId,
        generation,
      } as ActiveSyncAndHydrate;
      operation.promise = this.performSyncAndHydrate(
        targetUserId,
        generation,
        dependencies,
      ).finally(() => {
        if (activeSyncAndHydrate === operation) {
          activeSyncAndHydrate = null;
        }
      });
      activeSyncAndHydrate = operation;

      return operation.promise;
    },

    async performSyncAndHydrate(
      targetUserId: string,
      generation: number,
      dependencies?: SyncCoordinationDependencies,
    ): Promise<void> {
      // Once a conflict is recorded, every automatic retry (network back
      // online, etc.) becomes a no-op until a fresh setAuthenticated call
      // clears it - retrying would only reproduce the same conflict.
      if (generation !== authGeneration || this.accountConflictMessage !== null) {
        return;
      }

      const ownerRepository =
        dependencies?.ownerRepository ?? (await getDefaultOwnerRepository());
      const guestSyncService = await resolveGuestSyncService(dependencies);

      // Checked before any upload: a local database bound to a different
      // account must never upload that account's pending Attempts under
      // this one's identity, let alone download this account's state into
      // it. CloudHydrationService.downloadState() binds again internally;
      // that second bind is idempotent and protects its direct callers.
      try {
        await ownerRepository.bind(targetUserId);
      } catch (error: unknown) {
        if (generation === authGeneration) {
          if (error instanceof LocalDataOwnerConflictError) {
            this.accountConflictMessage = ACCOUNT_CONFLICT_MESSAGE;
          } else {
            reportError("sync.hydrate", error);
            this.hydrationErrorMessage = HYDRATION_ERROR_MESSAGE;
          }
        }
        return;
      }
      if (generation !== authGeneration) {
        return;
      }

      this.syncing = true;
      this.errorMessage = null;

      try {
        const result = await guestSyncService.syncPending();
        if (generation !== authGeneration) {
          return;
        }
        this.applyResult(result);

        if (result.pending > 0 || result.failed > 0) {
          return;
        }

        this.hydrating = true;
        this.hydrationErrorMessage = null;

        try {
          const cloudHydrationService =
            dependencies?.cloudHydrationService ??
            (await getDefaultCloudHydrationService());
          await cloudHydrationService.downloadState(targetUserId);
          if (generation !== authGeneration) {
            return;
          }
          this.hydratedUserId = targetUserId;
          this.localLearningStateRevision += 1;
        } catch (error: unknown) {
          if (generation === authGeneration) {
            if (error instanceof LocalDataOwnerConflictError) {
              this.accountConflictMessage = ACCOUNT_CONFLICT_MESSAGE;
            } else {
              reportError("sync.hydrate", error);
              this.hydrationErrorMessage = HYDRATION_ERROR_MESSAGE;
            }
          }
        } finally {
          if (generation === authGeneration) {
            this.hydrating = false;
          }
        }
      } catch (error: unknown) {
        if (generation === authGeneration) {
          reportError("sync.pending-attempts", error);
          this.errorMessage = getErrorMessage();
        }
      } finally {
        if (generation === authGeneration) {
          this.syncing = false;
        }
      }
    },

    async syncPending(service?: GuestSyncService): Promise<void> {
      const activeService = service ?? (await getDefaultService());
      this.syncing = true;
      this.errorMessage = null;

      try {
        this.applyResult(await activeService.syncPending());
      } catch (error: unknown) {
        reportError("sync.pending-attempts", error);
        this.errorMessage = getErrorMessage();
      } finally {
        this.syncing = false;
      }
    },

    async refreshPending(service?: GuestSyncService): Promise<void> {
      const activeService = service ?? (await getDefaultService());
      this.pendingCount = await activeService.countPending();
    },

    applyResult(result: GuestSyncResult): void {
      this.pendingCount = result.pending;
      this.failedCount = result.failed;
    },
  },
});
