<script setup lang="ts">
import { onMounted } from "vue";

import { useAuthStore } from "../../../stores/auth-store";

const authStore = useAuthStore();

onMounted(async () => {
  if (!authStore.initialized) {
    await authStore.initialize();
  }
});
</script>

<template>
  <div class="google-auth-control">
    <button
      v-if="!authStore.isAuthenticated"
      type="button"
      :disabled="authStore.pending"
      @click="authStore.signInWithGoogle()"
    >
      {{ authStore.pending ? "正在前往 Google…" : "使用 Google 登入" }}
    </button>
    <button
      v-else
      type="button"
      :disabled="authStore.pending"
      @click="authStore.signOut()"
    >
      {{ authStore.pending ? "正在登出…" : "登出" }}
    </button>
    <p
      v-if="authStore.errorMessage !== null"
      role="alert"
    >
      {{ authStore.errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.google-auth-control {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
}

button {
  padding: 0.75rem 1rem;
  border: 0;
  border-radius: 0.6rem;
  color: #052e16;
  background: #4ade80;
  cursor: pointer;
  font-weight: 800;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

p {
  margin: 0;
  color: #fca5a5;
}
</style>
