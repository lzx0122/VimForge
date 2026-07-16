<script setup lang="ts">
import CourseUnitCard from "../components/CourseUnitCard.vue";
import { STATIC_COURSE_UNITS } from "../data/static-units";
</script>

<template>
  <section class="page-section">
    <h1>課程地圖</h1>
    <p>所有 Vim 課程單元都可以自由進入。</p>
  </section>
  <div class="course-unit-grid">
    <CourseUnitCard
      v-for="unit in STATIC_COURSE_UNITS"
      :key="unit.slug"
      :unit="unit"
    />
  </div>
</template>
