<script setup lang="ts">
import { RouterView } from "vue-router";

import AppHeader from "../../components/common/AppHeader.vue";
import AppNavigation from "../../components/common/AppNavigation.vue";
import OfflineSyncBanner from "../../components/common/OfflineSyncBanner.vue";
import AppBootstrap from "../providers/AppBootstrap.vue";
</script>

<template>
  <AppBootstrap>
    <div class="app-layout">
      <AppHeader />
      <AppNavigation />
      <OfflineSyncBanner />
      <main class="page-container">
        <RouterView />
      </main>
    </div>
  </AppBootstrap>
</template>
