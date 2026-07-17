<script setup lang="ts">
import { computed } from "vue";

import type { NormalizedAction } from "../../../types";
import { explainExpectedVimKeys } from "../services/vim-key-guide";

const props = defineProps<{
  expectedActions: readonly NormalizedAction[];
}>();

const explanations = computed(() => explainExpectedVimKeys(props.expectedActions));
</script>

<template>
  <details
    class="vim-key-guide"
    data-testid="vim-key-guide"
  >
    <summary>本題按鍵解說</summary>
    <ul
      v-if="explanations.length > 0"
      class="vim-key-guide-list"
      aria-label="本題使用的 Vim 按鍵"
    >
      <li
        v-for="explanation in explanations"
        :key="explanation.key"
        data-testid="vim-key-explanation"
      >
        <kbd>{{ explanation.key }}</kbd>
        <span>{{ explanation.description }}</span>
      </li>
    </ul>
    <p
      v-else
      class="vim-key-guide-empty"
    >
      本題沒有可解說的 Vim 按鍵。
    </p>
  </details>
</template>

<style scoped>
.vim-key-guide {
  border: 1px solid #374151;
  border-radius: 0.75rem;
  background: #18202d;
}

.vim-key-guide summary {
  padding: 0.85rem 1rem;
  color: #f9fafb;
  cursor: pointer;
  font-weight: 800;
}

.vim-key-guide-list {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding: 0 1rem 1rem;
  list-style: none;
}

.vim-key-guide-list li {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: #d1d5db;
}

kbd {
  min-width: 2.25rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid #6b7280;
  border-radius: 0.35rem;
  color: #f9fafb;
  background: #111827;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-align: center;
}

.vim-key-guide-empty {
  margin: 0;
  padding: 0 1rem 1rem;
  color: #9ca3af;
}
</style>
