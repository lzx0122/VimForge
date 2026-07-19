<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  description: string;
  accessibilityLabel: string;
}>();
</script>

<template>
  <article
    class="metric-card"
    data-testid="metric-card"
    :aria-label="accessibilityLabel"
  >
    <dl>
      <dt>{{ label }}</dt>
      <dd class="metric-card-value">
        {{ value }}
      </dd>
      <dd class="metric-card-description">
        {{ description }}
      </dd>
    </dl>
  </article>
</template>

<style scoped>
.metric-card {
  height: 100%;
  padding: 1.1rem;
  border: 1px solid #4b5563;
  border-radius: 0.8rem;
  background: #111827;
}

dl,
dd {
  margin: 0;
}

dt {
  color: #9ca3af;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.metric-card-value {
  margin-top: 0.45rem;
  color: #f9fafb;
  font-size: 1.85rem;
  font-weight: 800;
  line-height: 1.1;
}

.metric-card-description {
  margin-top: 0.45rem;
  color: #86efac;
  font-size: 0.92rem;
}
</style>
