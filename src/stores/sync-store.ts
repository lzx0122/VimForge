import { defineStore } from "pinia";

import {
  createBrowserNetworkMonitor,
  GuestSyncService,
  type GuestSyncResult,
} from "../features/guest-sync/services/guest-sync-service";
import { AttemptRepository } from "../infrastructure/indexed-db/attempt-repository";
import { openVimForgeDatabase } from "../infrastructure/indexed-db/database";
import { reportError } from "../infrastructure/monitoring/error-reporter";
import { SupabaseAttemptSyncRepository } from "../infrastructure/supabase/supabase-attempt-sync-repository";
import { useAuthStore } from "./auth-store";

interface SyncStoreState {
  initialized: boolean;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  errorMessage: string | null;
}

let defaultServicePromise: Promise<GuestSyncService> | null = null;
let stopNetworkStatus: (() => void) | null = null;
let stopOnlineRetry: (() => void) | null = null;

async function createDefaultService(): Promise<GuestSyncService> {
  const database = await openVimForgeDatabase();

  return new GuestSyncService(
    new AttemptRepository(database),
    new SupabaseAttemptSyncRepository(),
    createBrowserNetworkMonitor(),
  );
}

function getDefaultService(): Promise<GuestSyncService> {
  defaultServicePromise ??= createDefaultService();

  return defaultServicePromise;
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
  }),

  getters: {
    showOfflineBanner: (state): boolean =>
      !state.online || state.pendingCount > 0 || state.failedCount > 0,
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

    async setAuthenticated(
      authenticated: boolean,
      service?: GuestSyncService,
    ): Promise<void> {
      const activeService = service ?? (await getDefaultService());
      stopOnlineRetry?.();
      stopOnlineRetry = null;

      if (!authenticated) {
        return;
      }

      stopOnlineRetry = activeService.retryWhenOnline((result) => {
        this.applyResult(result);
      });
      void this.syncPending(activeService);
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
