<script setup lang="ts">
import { RouterView } from "vue-router";

import AppHeader from "../../components/common/AppHeader.vue";
import AppNavigation from "../../components/common/AppNavigation.vue";
</script>

<template>
  <div class="app-layout">
    <AppHeader />
    <AppNavigation />
    <main class="page-container">
      <RouterView />
    </main>
  </div>
</template>
