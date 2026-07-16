<script setup lang="ts">
import { RouterLink } from "vue-router";

const navigationItems = [
  { label: "首頁", to: "/" },
  { label: "課程", to: "/courses" },
  { label: "複習", to: "/review" },
  { label: "進度", to: "/progress" },
  { label: "設定", to: "/settings" },
];
</script>

<template>
  <nav
    class="app-navigation"
    aria-label="主要導覽"
  >
    <RouterLink
      v-for="item in navigationItems"
      :key="item.to"
      :to="item.to"
    >
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
