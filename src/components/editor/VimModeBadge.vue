<script setup lang="ts">
import type { VimMode } from "../../types";

defineProps<{
  mode: VimMode;
}>();

const modeLabels: Readonly<Record<VimMode, string>> = {
  normal: "Normal",
  insert: "Insert",
  visual: "Visual",
  replace: "Replace",
  command: "Command",
};
</script>

<template>
  <span
    class="vim-mode-badge"
    role="status"
    :data-mode="mode"
    :aria-label="`Vim mode: ${modeLabels[mode]}`"
  >
    {{ modeLabels[mode] }}
  </span>
</template>
