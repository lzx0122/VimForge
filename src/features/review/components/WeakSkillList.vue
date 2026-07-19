<script setup lang="ts">
interface WeakSkillSummary {
  skillId: string;
  skillSlug: string;
  name: string;
  priority: number;
  relatedExerciseCount: number;
}

defineProps<{
  skills: readonly WeakSkillSummary[];
}>();
</script>

<template>
  <section
    class="weak-skill-panel"
    aria-labelledby="weak-skills-title"
  >
    <h2 id="weak-skills-title">
      主要加強技能
    </h2>
    <ul v-if="skills.length > 0">
      <li
        v-for="skill in skills"
        :key="skill.skillId"
      >
        <strong>{{ skill.name }}</strong>
        <span>加強優先度 {{ Math.round(skill.priority) }}</span>
        <span>{{ skill.relatedExerciseCount }} 題相關練習</span>
      </li>
    </ul>
    <p v-else>
      目前沒有明顯弱項，今日題組會以到期內容與熟悉題抽查為主。
    </p>
  </section>
</template>

<style scoped>
.weak-skill-panel {
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
  grid-template-columns: minmax(10rem, 1fr) auto auto;
  gap: 1rem;
  padding: 0.8rem 0;
  border-bottom: 1px solid #374151;
}

li:last-child {
  border-bottom: 0;
}

span,
p {
  color: #d1d5db;
}

p {
  margin: 0;
}
</style>
