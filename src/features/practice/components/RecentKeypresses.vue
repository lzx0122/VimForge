<script setup lang="ts">
defineProps<{
  keys: readonly string[];
}>();
</script>

<template>
  <div
    v-if="keys.length > 0"
    class="recent-keypresses"
    aria-label="最近按鍵"
  >
    <span
      v-for="(key, index) in keys"
      :key="`${index}-${key}`"
      class="recent-key"
      data-testid="recent-key"
    >
      {{ key }}
    </span>
  </div>
</template>

<style scoped>
.recent-keypresses {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.recent-key {
  padding: 0.15rem 0.5rem;
  border: 1px solid rgba(216, 222, 233, 0.16);
  border-radius: 0.4rem;
  color: #d8dee9;
  background: #1b2029;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.8rem;
}
</style>
