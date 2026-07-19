<script setup lang="ts">
defineProps<{
  attempts: readonly {
    id: string;
    exerciseTitle: string;
    completed: boolean;
    accuracyScore: number;
    occurredAt: string;
    errorSummary: string | null;
  }[];
}>();

function occurredAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "時間未知";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
</script>

<template>
  <section
    class="progress-panel"
    aria-labelledby="recent-attempts-title"
  >
    <h2 id="recent-attempts-title">
      最近練習
    </h2>
    <ul v-if="attempts.length > 0">
      <li
        v-for="attempt in attempts"
        :key="attempt.id"
        :data-attempt-id="attempt.id"
      >
        <div>
          <strong>{{ attempt.exerciseTitle }}</strong>
          <p
            v-if="attempt.errorSummary !== null"
            class="attempt-error"
          >
            {{ attempt.errorSummary }}
          </p>
          <p v-else>
            {{ attempt.completed ? "已完成" : "未完成" }}
          </p>
        </div>
        <span>準確 {{ attempt.accuracyScore }}</span>
        <time :datetime="attempt.occurredAt">
          {{ occurredAtLabel(attempt.occurredAt) }}
        </time>
      </li>
    </ul>
    <p v-else>
      還沒有最近練習紀錄。
    </p>
  </section>
</template>

<style scoped>
.progress-panel {
  padding: 1.25rem;
  border: 1px solid #374151;
  border-radius: 1rem;
}

h2 {
  margin: 0 0 1rem;
  color: #f9fafb;
}

ul {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) auto auto;
  align-items: start;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #374151;
}

li:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

p {
  margin: 0.25rem 0 0;
  color: #d1d5db;
}

.attempt-error {
  color: #fca5a5;
}

span,
time {
  color: #d1d5db;
  white-space: nowrap;
}
</style>
