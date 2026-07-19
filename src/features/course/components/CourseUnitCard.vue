<script setup lang="ts">
import { RouterLink } from "vue-router";

import type { CourseUnitSummary } from "../repositories/course-repository";

defineProps<{
  unit: CourseUnitSummary;
}>();

const DIFFICULTY_LABELS: Record<CourseUnitSummary["difficulty"], string> = {
  beginner: "入門",
  intermediate: "進階",
  advanced: "高階",
};
</script>

<template>
  <article
    class="course-unit-card"
    data-testid="course-unit-card"
    :data-unit="unit.slug"
  >
    <div>
      <p class="course-unit-meta">
        {{ unit.exerciseCount }} 題 · {{ unit.estimatedMinutes }} 分鐘 ·
        {{ DIFFICULTY_LABELS[unit.difficulty] }}
      </p>
      <h2>{{ unit.title }}</h2>
      <p class="course-unit-description">
        {{ unit.description }}
      </p>
      <ul
        v-if="unit.primarySkills.length > 0"
        class="course-unit-skills"
      >
        <li
          v-for="skill in unit.primarySkills"
          :key="skill.id"
        >
          {{ skill.name }}
        </li>
      </ul>
    </div>
    <RouterLink :to="`/courses/${unit.slug}`">
      進入單元
    </RouterLink>
  </article>
</template>
