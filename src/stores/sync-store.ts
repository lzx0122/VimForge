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
  guestSyncService?: GuestSyncService;
  cloudHydrationService?: CloudHydrationService;
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
let stopNetworkStatus: (() => void) | null = null;
let stopOnlineRetry: (() => void) | null = null;
let activeSyncAndHydrate: Promise<void> | null = null;

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
      stopOnlineRetry?.();
      stopOnlineRetry = null;

      if (userId === null) {
        this.hydrating = false;
        this.hydratedUserId = null;
        this.hydrationErrorMessage = null;
        this.accountConflictMessage = null;
        return;
      }

      this.hydrationErrorMessage = null;
      this.accountConflictMessage = null;

      const guestSyncService =
        dependencies?.guestSyncService ?? (await getDefaultService());

      // GuestSyncService.retryWhenOnline only re-runs syncPending(); the
      // complete upload-first-then-hydrate operation is syncAndHydrate, so
      // the store subscribes to network changes itself instead.
      stopOnlineRetry = guestSyncService.onNetworkChange((online) => {
        if (online) {
          void this.syncAndHydrate(userId, dependencies);
        }
      });

      void this.syncAndHydrate(userId, dependencies);
    },

    /**
     * Uploads every pending Attempt first; cloud hydration only runs once
     * nothing is left pending or failed, so it never downloads a snapshot
     * that is missing this device's own not-yet-uploaded data. Concurrent
     * calls share one in-flight operation.
     */
    async syncAndHydrate(
      userId?: string,
      dependencies?: SyncCoordinationDependencies,
    ): Promise<void> {
      activeSyncAndHydrate ??= this.performSyncAndHydrate(
        userId,
        dependencies,
      ).finally(() => {
        activeSyncAndHydrate = null;
      });

      return activeSyncAndHydrate;
    },

    async performSyncAndHydrate(
      userId?: string,
      dependencies?: SyncCoordinationDependencies,
    ): Promise<void> {
      // Once a conflict is recorded, every automatic retry (network back
      // online, etc.) becomes a no-op until a fresh setAuthenticated call
      // clears it - retrying would only reproduce the same conflict.
      if (this.accountConflictMessage !== null) {
        return;
      }

      const targetUserId = userId ?? useAuthStore().currentUser?.id ?? null;
      if (targetUserId === null) {
        return;
      }

      const guestSyncService =
        dependencies?.guestSyncService ?? (await getDefaultService());
      this.syncing = true;
      this.errorMessage = null;

      try {
        const result = await guestSyncService.syncPending();
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
          this.hydratedUserId = targetUserId;
          this.localLearningStateRevision += 1;
        } catch (error: unknown) {
          if (error instanceof LocalDataOwnerConflictError) {
            this.accountConflictMessage = ACCOUNT_CONFLICT_MESSAGE;
          } else {
            reportError("sync.hydrate", error);
            this.hydrationErrorMessage = HYDRATION_ERROR_MESSAGE;
          }
        } finally {
          this.hydrating = false;
        }
      } catch (error: unknown) {
        reportError("sync.pending-attempts", error);
        this.errorMessage = getErrorMessage();
      } finally {
        this.syncing = false;
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
