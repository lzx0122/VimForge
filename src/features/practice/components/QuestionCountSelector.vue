<script setup lang="ts">
import {
  QUESTION_COUNTS,
  type QuestionCount,
} from "../../../types";

defineProps<{
  modelValue: QuestionCount;
}>();

const emit = defineEmits<{
  "update:modelValue": [count: QuestionCount];
}>();
</script>

<template>
  <fieldset
    class="option-fieldset"
    data-testid="question-count-selector"
  >
    <legend>題量</legend>
    <div class="option-row">
      <label
        v-for="count in QUESTION_COUNTS"
        :key="count"
        class="choice-pill"
      >
        <input
          type="radio"
          name="question-count"
          :value="count"
          :checked="modelValue === count"
          @change="emit('update:modelValue', count)"
        >
        <span>{{ count }} 題</span>
      </label>
    </div>
  </fieldset>
</template>
