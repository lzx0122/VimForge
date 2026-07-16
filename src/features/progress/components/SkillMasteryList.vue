<script setup lang="ts">
defineProps<{
  skills: readonly {
    id: string;
    name: string;
    masteryLevel: 0 | 1 | 2 | 3 | 4 | 5;
    masteryScore: number;
  }[];
}>();
</script>

<template>
  <section
    class="progress-panel"
    aria-labelledby="skill-mastery-title"
  >
    <h2 id="skill-mastery-title">
      技能熟練度
    </h2>
    <ul v-if="skills.length > 0">
      <li
        v-for="skill in skills"
        :key="skill.id"
      >
        <div class="skill-heading">
          <strong>{{ skill.name }}</strong>
          <span>Level {{ skill.masteryLevel }} / 5</span>
        </div>
        <progress
          :value="skill.masteryLevel"
          max="5"
          :aria-label="`${skill.name}熟練度 ${skill.masteryLevel} / 5`"
        />
        <small>熟練分數 {{ skill.masteryScore }} / 100</small>
      </li>
    </ul>
    <p v-else>
      完成練習後，技能熟練度會顯示在這裡。
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
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: grid;
  gap: 0.45rem;
}

.skill-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

progress {
  width: 100%;
  accent-color: #4ade80;
}

span,
small,
p {
  color: #d1d5db;
}

p {
  margin: 0;
}
</style>
