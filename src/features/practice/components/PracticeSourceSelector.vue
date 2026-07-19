<script lang="ts">
export type PracticeSource = "daily_review" | "topic_practice";
</script>

<script setup lang="ts">
defineProps<{
  modelValue: PracticeSource;
}>();

const emit = defineEmits<{
  "update:modelValue": [source: PracticeSource];
}>();

const sourceOptions: readonly {
  value: PracticeSource;
  label: string;
  description: string;
}[] = [
  {
    value: "daily_review",
    label: "今日複習",
    description: "依到期題目、弱項與熟悉題自動安排。",
  },
  {
    value: "topic_practice",
    label: "指定主題",
    description: "選擇一個或多個想加強的 Vim 主題。",
  },
];
</script>

<template>
  <fieldset
    class="option-fieldset"
    data-testid="practice-source-selector"
  >
    <legend>練習來源</legend>
    <div class="choice-card-grid">
      <label
        v-for="option in sourceOptions"
        :key="option.value"
        class="choice-card"
      >
        <input
          type="radio"
          name="practice-source"
          :value="option.value"
          :checked="modelValue === option.value"
          @change="emit('update:modelValue', option.value)"
        >
        <span>
          <strong>{{ option.label }}</strong>
          <small>{{ option.description }}</small>
        </span>
      </label>
    </div>
  </fieldset>
</template>
