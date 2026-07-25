<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

import { reportError } from "../../infrastructure/monitoring/error-reporter";
import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useSyncStore } from "../../stores/sync-store";

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const syncStore = useSyncStore();

let stopAuthUserIdWatch: (() => void) | null = null;

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
  await safely("app.bootstrap-sync", () => syncStore.initialize());
  if (!authStore.initialized) {
    await safely("app.bootstrap-auth", () => authStore.initialize());
  }

  await coordinateAuthenticated(authStore.currentUser?.id ?? null);

  stopAuthUserIdWatch = watch(
    () => authStore.currentUser?.id ?? null,
    (userId) => {
      void coordinateAuthenticated(userId);
    },
  );
});

onUnmounted(() => {
  stopAuthUserIdWatch?.();
  stopAuthUserIdWatch = null;
});
</script>

<template>
  <slot />
</template>
