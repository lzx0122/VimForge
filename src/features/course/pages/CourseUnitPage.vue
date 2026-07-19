<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import { openVimForgeDatabase } from "../../../infrastructure/indexed-db/database";
import { SessionRepository } from "../../../infrastructure/indexed-db/session-repository";
import { reportError } from "../../../infrastructure/monitoring/error-reporter";
import { SupabaseCourseRepository } from "../../../infrastructure/supabase/supabase-course-repository";
import { SupabaseExerciseRepository } from "../../../infrastructure/supabase/supabase-exercise-repository";
import { usePracticeStore } from "../../../stores/practice-store";
import { PracticeSessionStarter } from "../../practice/services/practice-session-starter";
import type { CourseUnitDetail } from "../repositories/course-repository";
import { CoursePracticeService } from "../services/course-practice-service";

type UnitLoadState = "loading" | "missing" | "empty" | "detail" | "read-error";

const DIFFICULTY_LABELS: Record<CourseUnitDetail["difficulty"], string> = {
  beginner: "入門",
  intermediate: "進階",
  advanced: "高階",
};

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  tutorial: "教學",
  guided: "引導",
  challenge: "挑戰",
  review: "複習",
};

const route = useRoute();
const router = useRouter();
const practiceStore = usePracticeStore();

const unitSlug = computed(() => String(route.params.unitSlug));
const loadState = ref<UnitLoadState>("loading");
const unit = ref<CourseUnitDetail | null>(null);
const isStarting = ref(false);
const startError = ref<string | null>(null);

const exerciseTypeCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const exercise of unit.value?.exercises ?? []) {
    counts.set(exercise.exerciseType, (counts.get(exercise.exerciseType) ?? 0) + 1);
  }
  return [...counts.entries()];
});

async function loadUnit(): Promise<void> {
  loadState.value = "loading";
  startError.value = null;
  try {
    const repository = new SupabaseCourseRepository();
    const detail = await repository.getPublishedUnitBySlug(unitSlug.value);
    if (detail === null) {
      unit.value = null;
      loadState.value = "missing";
      return;
    }
    unit.value = detail;
    loadState.value = detail.exerciseCount === 0 ? "empty" : "detail";
  } catch (error: unknown) {
    reportError("course-unit.load", error);
    unit.value = null;
    loadState.value = "read-error";
  }
}

async function startUnit(): Promise<void> {
  if (isStarting.value || unit.value === null) {
    return;
  }

  isStarting.value = true;
  startError.value = null;
  try {
    const database = await openVimForgeDatabase();
    let session;
    try {
      const service = new CoursePracticeService(
        new SupabaseCourseRepository(),
        new SupabaseExerciseRepository(),
        new PracticeSessionStarter(
          new SessionRepository(database),
          practiceStore,
        ),
      );
      session = await service.startUnit(unitSlug.value);
    } finally {
      database.close();
    }
    await router.push({
      name: "practice",
      params: { sessionId: session.id },
    });
  } catch (error: unknown) {
    reportError("course-unit.start", error);
    startError.value = "無法開始本單元，請確認連線後再試。";
  } finally {
    isStarting.value = false;
  }
}

onMounted(() => {
  void loadUnit();
});
</script>

<template>
  <section class="page-section">
    <h1>課程單元</h1>
  </section>

  <p v-if="loadState === 'loading'">
    正在載入單元內容…
  </p>

  <div
    v-else-if="loadState === 'missing'"
    role="alert"
    class="courses-error"
  >
    <p>找不到這個課程單元，可能尚未發布或不存在。</p>
    <RouterLink to="/courses">
      返回課程地圖
    </RouterLink>
  </div>

  <div
    v-else-if="loadState === 'read-error'"
    role="alert"
    class="courses-error"
  >
    <p>暫時無法載入課程單元，請稍後重試。</p>
    <button
      type="button"
      data-testid="course-unit-retry"
      @click="loadUnit"
    >
      重試
    </button>
  </div>

  <div
    v-else-if="unit !== null"
    class="course-unit-detail"
  >
    <h2>{{ unit.title }}</h2>
    <p>{{ unit.slug }}</p>
    <p class="course-unit-meta">
      {{ unit.exerciseCount }} 題 · {{ unit.estimatedMinutes }} 分鐘 ·
      {{ DIFFICULTY_LABELS[unit.difficulty] }}
    </p>
    <p class="course-unit-description">
      {{ unit.description }}
    </p>

    <ul
      v-if="unit.skills.length > 0"
      class="course-unit-skills"
    >
      <li
        v-for="skill in unit.skills"
        :key="skill.id"
      >
        {{ skill.name }}
      </li>
    </ul>

    <ul
      v-if="exerciseTypeCounts.length > 0"
      class="course-unit-type-counts"
      data-testid="exercise-type-counts"
    >
      <li
        v-for="[exerciseType, count] in exerciseTypeCounts"
        :key="exerciseType"
      >
        {{ EXERCISE_TYPE_LABELS[exerciseType] ?? exerciseType }}：{{ count }}
      </li>
    </ul>

    <p v-if="loadState === 'empty'">
      此單元目前沒有可練習的題目。
    </p>
    <template v-else>
      <button
        type="button"
        :disabled="isStarting"
        @click="startUnit"
      >
        {{ isStarting ? "正在建立題組…" : "開始本單元" }}
      </button>
      <p
        v-if="startError"
        role="alert"
      >
        {{ startError }}
      </p>
    </template>
  </div>
</template>
