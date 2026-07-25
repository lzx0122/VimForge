<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

import { reportError } from "../../infrastructure/monitoring/error-reporter";
import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useSyncStore } from "../../stores/sync-store";

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const syncStore = useSyncStore();

let disposed = false;
let stopAuthUserIdWatch: (() => void) | null = null;

function currentAuthUserId(): string | null {
  return authStore.currentUser?.id ?? null;
}

async function safely(
  context: string,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    reportError(context, error);
  }
}

// Adapter for the sync store's current boolean signature: call sites here
// already think in terms of the authenticated user's id, but
// setAuthenticated(userId: string | null) is finalized in Task 23.
async function coordinateAuthenticated(userId: string | null): Promise<void> {
  await safely("app.bootstrap-coordinate-auth", () =>
    syncStore.setAuthenticated(userId !== null),
  );
}

onMounted(async () => {
  await safely("app.bootstrap-settings", () => settingsStore.initialize());
  if (disposed) {
    return;
  }

  await safely("app.bootstrap-sync", () => syncStore.initialize());
  if (disposed) {
    return;
  }

  if (!authStore.initialized) {
    await safely("app.bootstrap-auth", () => authStore.initialize());
  }
  if (disposed) {
    return;
  }

  // The watcher must exist before the initial coordination call is even
  // awaited: a user-id change that lands while that call is still pending
  // would otherwise have nothing observing it, and (since watch() isn't
  // immediate) would never be replayed once the watcher is created later.
  stopAuthUserIdWatch = watch(currentAuthUserId, (userId) => {
    void coordinateAuthenticated(userId);
  });

  await coordinateAuthenticated(currentAuthUserId());
});

onUnmounted(() => {
  disposed = true;
  stopAuthUserIdWatch?.();
  stopAuthUserIdWatch = null;
});
</script>

<template>
  <slot />
</template>
