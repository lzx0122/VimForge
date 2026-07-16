<script setup lang="ts">
import { RouterLink } from "vue-router";

defineProps<{
  units: readonly {
    id: string;
    slug: string;
    title: string;
    completedExercises: number;
    totalExercises: number;
  }[];
}>();

function completedCount(completed: number, total: number): number {
  return Math.min(Math.max(0, completed), Math.max(0, total));
}
</script>

<template>
  <section aria-labelledby="unit-progress-title">
    <h2 id="unit-progress-title">
      單元完成度
    </h2>
    <div
      v-if="units.length > 0"
      class="unit-progress-grid"
    >
      <RouterLink
        v-for="unit in units"
        :key="unit.id"
        class="unit-progress-card"
        :data-unit-slug="unit.slug"
        :to="`/courses/${unit.slug}`"
      >
        <strong>{{ unit.title }}</strong>
        <span>
          {{ completedCount(unit.completedExercises, unit.totalExercises) }} /
          {{ unit.totalExercises }} 題
        </span>
        <progress
          :value="completedCount(unit.completedExercises, unit.totalExercises)"
          :max="Math.max(1, unit.totalExercises)"
          :aria-label="`${unit.title}完成 ${completedCount(
            unit.completedExercises,
            unit.totalExercises,
          )} / ${unit.totalExercises} 題`"
        />
      </RouterLink>
    </div>
    <p v-else>
      還沒有單元完成紀錄。
    </p>
  </section>
</template>

<style scoped>
h2 {
  color: #f9fafb;
}

.unit-progress-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.unit-progress-card {
  display: grid;
  gap: 0.65rem;
  padding: 1rem;
  border: 1px solid #374151;
  border-radius: 0.8rem;
  color: #f9fafb;
  text-decoration: none;
  background: #1f2937;
}

.unit-progress-card span,
p {
  color: #d1d5db;
}

progress {
  width: 100%;
  accent-color: #4ade80;
}
</style>
