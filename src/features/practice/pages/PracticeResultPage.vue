<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const sessionId = computed(() => String(route.params.sessionId));
</script>

<template>
  <section class="page-section">
    <h1>練習結果</h1>
    <p>題組：{{ sessionId }}</p>
  </section>
</template>
