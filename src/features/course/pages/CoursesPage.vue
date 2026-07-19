<script setup lang="ts">
import { onMounted, ref } from "vue";

import { SupabaseCourseRepository } from "../../../infrastructure/supabase/supabase-course-repository";
import CourseUnitCard from "../components/CourseUnitCard.vue";
import type { CourseUnitSummary } from "../repositories/course-repository";

type CoursesLoadState = "loading" | "loaded" | "empty" | "error";

const loadState = ref<CoursesLoadState>("loading");
const units = ref<CourseUnitSummary[]>([]);

async function loadUnits(): Promise<void> {
  loadState.value = "loading";
  try {
    const repository = new SupabaseCourseRepository();
    const publishedUnits = await repository.listPublishedUnits();
    units.value = [...publishedUnits];
    loadState.value = publishedUnits.length === 0 ? "empty" : "loaded";
  } catch {
    loadState.value = "error";
  }
}

onMounted(() => {
  void loadUnits();
});
</script>

<template>
  <section class="page-section">
    <h1>課程地圖</h1>
    <p>所有 Vim 課程單元都可以自由進入。</p>
  </section>

  <p v-if="loadState === 'loading'">
    正在載入課程…
  </p>
  <p v-else-if="loadState === 'empty'">
    目前沒有已發布的課程單元。
  </p>
  <div
    v-else-if="loadState === 'error'"
    role="alert"
    class="courses-error"
  >
    <p>暫時無法載入課程內容，請稍後重試。</p>
    <button
      type="button"
      data-testid="courses-retry"
      @click="loadUnits"
    >
      重試
    </button>
  </div>
  <div
    v-else
    class="course-unit-grid"
  >
    <CourseUnitCard
      v-for="unit in units"
      :key="unit.slug"
      :unit="unit"
    />
  </div>
</template>
