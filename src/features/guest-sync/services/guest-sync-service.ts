import type { SyncedAttemptCommitter } from "../../../infrastructure/indexed-db/synced-attempt-committer";
import type {
  AttemptSyncInput,
  AttemptSyncRepository,
} from "../../practice/repositories/attempt-sync-repository";

export interface LocalAttemptQueue {
  save(attempt: AttemptSyncInput): Promise<void>;
  listPending(): Promise<readonly AttemptSyncInput[]>;
}

export interface NetworkMonitor {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface GuestSyncResult {
  total: number;
  synced: number;
  failed: number;
  pending: number;
}

export function createBrowserNetworkMonitor(): NetworkMonitor {
  return {
    isOnline: () => navigator.onLine,
    subscribe(listener) {
      const handleOnline = () => listener(true);
      const handleOffline = () => listener(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    },
  };
}

export class GuestSyncService {
  private activeSync: Promise<GuestSyncResult> | null = null;

  public constructor(
    private readonly localQueue: LocalAttemptQueue,
    private readonly remoteRepository: AttemptSyncRepository,
    private readonly network: NetworkMonitor,
    private readonly committer: SyncedAttemptCommitter,
  ) {}

  public isOnline(): boolean {
    return this.network.isOnline();
  }

  public onNetworkChange(
    listener: (online: boolean) => void,
  ): () => void {
    return this.network.subscribe(listener);
  }

  public async saveCompletedAttempt(
    attempt: AttemptSyncInput,
  ): Promise<void> {
    await this.localQueue.save(attempt);
  }

  public async countPending(): Promise<number> {
    const pending = await this.localQueue.listPending();

    return pending.length;
  }

  public syncPending(): Promise<GuestSyncResult> {
    this.activeSync ??= this.performSync().finally(() => {
      this.activeSync = null;
    });

    return this.activeSync;
  }

  public retryWhenOnline(
    onResult: (result: GuestSyncResult) => void,
  ): () => void {
    return this.network.subscribe((online) => {
      if (!online) {
        return;
      }

      void this.syncPending().then(onResult).catch(() => undefined);
    });
  }

  private async performSync(): Promise<GuestSyncResult> {
    const attempts = await this.localQueue.listPending();
    const total = attempts.length;

    if (!this.network.isOnline()) {
      return { total, synced: 0, failed: 0, pending: total };
    }

    let synced = 0;
    let failed = 0;

    for (const attempt of attempts) {
      try {
        const result = await this.remoteRepository.recordAttempt(attempt);
        await this.committer.commit({
          clientAttemptId: attempt.clientAttemptId,
          exerciseId: attempt.exerciseId,
          result,
        });
        synced += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      total,
      synced,
      failed,
      pending: total - synced,
    };
  }
}
