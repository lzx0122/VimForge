<script setup lang="ts">
import { onMounted, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";

import { useAuthStore } from "../../../stores/auth-store";

const authStore = useAuthStore();
const router = useRouter();

watch(
  () => authStore.session,
  async (session) => {
    if (session !== null) {
      await router.replace({ name: "home" });
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await authStore.initialize();
});
</script>

<template>
  <section class="page-section">
    <h1>正在完成登入</h1>
    <p v-if="!authStore.initialized">
      Google 登入完成後會回到練習平台。
    </p>
    <p
      v-else-if="authStore.errorMessage !== null"
      role="alert"
    >
      {{ authStore.errorMessage }}
    </p>
    <p v-else-if="authStore.session === null">
      找不到有效的登入工作階段。請回到首頁後再試一次。
    </p>
    <p v-else>
      登入完成，正在返回首頁…
    </p>
    <RouterLink to="/">
      回到首頁
    </RouterLink>
  </section>
</template>
