<script setup lang="ts">
import type { QuestionCount } from "../../../types/learning";

defineProps<{
  dueCount: number;
  questionCount: QuestionCount;
}>();
</script>

<template>
  <section
    class="daily-review-summary"
    aria-labelledby="daily-review-summary-title"
  >
    <div>
      <h2 id="daily-review-summary-title">
        今日安排
      </h2>
      <p>
        有
        <strong data-testid="due-count">{{ dueCount }}</strong>
        題已到期或需要再次練習。
      </p>
    </div>
    <p class="review-count">
      本輪
      <strong data-testid="selected-review-count">{{ questionCount }}</strong>
      題
    </p>
  </section>
</template>

<style scoped>
.daily-review-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.25rem;
  border: 1px solid #374151;
  border-radius: 1rem;
  background: #1f2937;
}

h2,
p {
  margin: 0;
}

h2 {
  margin-bottom: 0.5rem;
  color: #f9fafb;
}

strong {
  color: #86efac;
}

.review-count {
  flex: none;
  color: #d1d5db;
}
</style>
