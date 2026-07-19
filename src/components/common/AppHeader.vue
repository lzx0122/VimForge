<script setup lang="ts">
import { RouterLink } from "vue-router";

import GoogleSignInButton from "../../features/auth/components/GoogleSignInButton.vue";
</script>

<template>
  <header class="app-header">
    <RouterLink
      class="brand-link"
      to="/"
    >
      Vim Practice
    </RouterLink>
    <div class="app-header-actions">
      <p>用真實程式碼建立 Vim 肌肉記憶</p>
      <GoogleSignInButton />
    </div>
  </header>
</template>
