<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const unitSlug = computed(() => String(route.params.unitSlug));
</script>

<template>
  <section class="page-section">
    <h1>課程單元</h1>
    <p>{{ unitSlug }}</p>
  </section>
</template>
