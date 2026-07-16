<script setup lang="ts">
defineProps<{
  isFocused: boolean;
}>();
</script>

<template>
  <p
    v-if="!isFocused"
    class="editor-focus-notice"
    role="status"
  >
    點擊編輯器以繼續
  </p>
</template>
