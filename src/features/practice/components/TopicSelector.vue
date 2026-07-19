<script setup lang="ts">
import { TOPIC_DEFINITIONS } from "../data/topic-definitions";

const props = defineProps<{
  modelValue: readonly string[];
  required?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [topics: string[]];
}>();

function toggleTopic(slug: string) {
  if (props.modelValue.includes(slug)) {
    emit(
      "update:modelValue",
      props.modelValue.filter((topic) => topic !== slug),
    );
    return;
  }

  emit("update:modelValue", [...props.modelValue, slug]);
}
</script>

<template>
  <fieldset
    class="option-fieldset"
    data-testid="topic-selector"
    :aria-describedby="required && modelValue.length === 0
      ? 'topic-selection-error'
      : undefined"
    :aria-invalid="required && modelValue.length === 0"
  >
    <legend>主題</legend>
    <div class="topic-grid">
      <label
        v-for="topic in TOPIC_DEFINITIONS"
        :key="topic.slug"
        class="choice-pill"
      >
        <input
          type="checkbox"
          :value="topic.slug"
          :checked="modelValue.includes(topic.slug)"
          @change="toggleTopic(topic.slug)"
        >
        <span>{{ topic.label }}</span>
      </label>
    </div>
    <p
      v-if="required && modelValue.length === 0"
      id="topic-selection-error"
      class="selection-error"
      role="alert"
    >
      至少選擇一個主題。
    </p>
  </fieldset>
</template>

<style scoped>
.selection-error {
  margin: 0.75rem 0 0;
  color: #fca5a5;
}
</style>
