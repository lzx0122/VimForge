<script setup lang="ts">
import { RouterLink } from "vue-router";

import type { StaticCourseUnit } from "../data/static-units";

defineProps<{
  unit: StaticCourseUnit;
}>();
</script>

<template>
  <article
    class="course-unit-card"
    data-testid="course-unit-card"
    :data-unit="unit.slug"
  >
    <div>
      <p class="course-unit-count">
        {{ unit.exerciseCount }} 題
      </p>
      <h2>{{ unit.title }}</h2>
      <code>{{ unit.commands }}</code>
      <p
        v-if="unit.prerequisiteSuggestion"
        class="prerequisite-suggestion"
      >
        {{ unit.prerequisiteSuggestion }}
      </p>
      <p
        v-else
        class="prerequisite-suggestion"
      >
        適合從這裡開始。
      </p>
    </div>
    <RouterLink :to="`/courses/${unit.slug}`">
      進入單元
    </RouterLink>
  </article>
</template>
