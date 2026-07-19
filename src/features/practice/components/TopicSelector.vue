<script setup lang="ts">
interface TopicOption {
  slug: string;
  label: string;
}

const topicOptions: readonly TopicOption[] = [
  { slug: "mode-switching", label: "模式切換" },
  { slug: "basic-movement", label: "基礎移動" },
  { slug: "word-movement", label: "單字移動" },
  { slug: "line-find", label: "行內跳轉" },
  { slug: "delete-change", label: "刪除與修改" },
  { slug: "copy-paste", label: "複製貼上" },
  { slug: "search", label: "全文搜尋" },
  { slug: "text-objects", label: "文字物件" },
  { slug: "visual-mode", label: "Visual Mode" },
  { slug: "composition", label: "綜合操作" },
];

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
        v-for="topic in topicOptions"
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
