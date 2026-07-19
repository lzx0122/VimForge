<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

import { useAuthStore } from "../../stores/auth-store";
import { useSyncStore } from "../../stores/sync-store";

const authStore = useAuthStore();
const syncStore = useSyncStore();
let ready = false;

const stopAuthWatch = watch(
  () => authStore.isAuthenticated,
  (authenticated) => {
    if (ready) {
      void syncStore.setAuthenticated(authenticated);
    }
  },
);

onMounted(async () => {
  await syncStore.initialize();
  if (!authStore.initialized) {
    await authStore.initialize();
  }
  ready = true;
  await syncStore.setAuthenticated(authStore.isAuthenticated);
});

onUnmounted(() => {
  stopAuthWatch();
});
</script>

<template>
  <aside
    v-if="syncStore.showOfflineBanner"
    class="offline-sync-banner"
    role="status"
    aria-live="polite"
  >
    <p>目前無法同步，紀錄已保存在這台裝置。</p>
    <button
      v-if="
        authStore.isAuthenticated &&
          syncStore.online &&
          syncStore.pendingCount > 0
      "
      type="button"
      :disabled="syncStore.syncing"
      @click="syncStore.syncPending()"
    >
      {{ syncStore.syncing ? "同步中…" : "重試同步" }}
    </button>
  </aside>
</template>

<style scoped>
.offline-sync-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: 72rem;
  margin: 1rem auto 0;
  padding: 0.85rem 1rem;
  border: 1px solid #f59e0b;
  border-radius: 0.75rem;
  color: #fef3c7;
  background: #451a03;
}

p {
  margin: 0;
}

button {
  flex: none;
  padding: 0.55rem 0.8rem;
  border: 1px solid #fbbf24;
  border-radius: 0.5rem;
  color: #fef3c7;
  background: transparent;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}
</style>
