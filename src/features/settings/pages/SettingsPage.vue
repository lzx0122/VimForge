<script setup lang="ts">
import { onMounted } from "vue";

import QuestionCountSelector from "../../practice/components/QuestionCountSelector.vue";
import { useSettingsStore } from "../../../stores/settings-store";
import type { QuestionCount } from "../../../types/learning";

const settingsStore = useSettingsStore();

onMounted(async () => {
  if (!settingsStore.initialized) {
    await settingsStore.initialize();
  }
});

function inputElement(event: Event): HTMLInputElement | null {
  return event.currentTarget instanceof HTMLInputElement
    ? event.currentTarget
    : null;
}

function updateFontSize(event: Event): void {
  const input = inputElement(event);
  if (input !== null) {
    void settingsStore.updateSettings({
      editorFontSize: Number(input.value),
    });
  }
}

function updateBoolean(
  key: "showLineNumbers" | "showKeypresses" | "soundEnabled",
  event: Event,
): void {
  const input = inputElement(event);
  if (input !== null) {
    void settingsStore.updateSettings({ [key]: input.checked });
  }
}

function updateQuestionCount(questionCount: QuestionCount): void {
  void settingsStore.updateSettings({
    preferredQuestionCount: questionCount,
  });
}
</script>

<template>
  <section class="page-section">
    <h1>設定</h1>
    <p>調整顯示與編輯器偏好。</p>
  </section>

  <form
    class="settings-panel"
    @submit.prevent
  >
    <label class="range-setting">
      <span>編輯器字體大小：{{ settingsStore.editorFontSize }} px</span>
      <input
        data-testid="editor-font-size"
        type="range"
        min="12"
        max="28"
        step="1"
        :value="settingsStore.editorFontSize"
        @input="updateFontSize"
      >
    </label>

    <label class="toggle-setting">
      <input
        data-testid="show-line-numbers"
        type="checkbox"
        :checked="settingsStore.showLineNumbers"
        @change="updateBoolean('showLineNumbers', $event)"
      >
      <span>顯示行號</span>
    </label>

    <label class="toggle-setting">
      <input
        data-testid="show-keypresses"
        type="checkbox"
        :checked="settingsStore.showKeypresses"
        @change="updateBoolean('showKeypresses', $event)"
      >
      <span>顯示最近按鍵</span>
    </label>

    <label class="toggle-setting">
      <input
        data-testid="sound-enabled"
        type="checkbox"
        :checked="settingsStore.soundEnabled"
        @change="updateBoolean('soundEnabled', $event)"
      >
      <span>開啟音效</span>
    </label>

    <QuestionCountSelector
      :model-value="settingsStore.preferredQuestionCount"
      @update:model-value="updateQuestionCount"
    />
  </form>

  <p
    v-if="settingsStore.errorMessage !== null"
    class="settings-error"
    role="alert"
  >
    {{ settingsStore.errorMessage }}
  </p>
  <p
    v-else
    data-testid="settings-status"
    role="status"
  >
    <template v-if="settingsStore.saving">
      正在保存設定…
    </template>
    <template v-else-if="settingsStore.persistenceStatus === 'synced'">
      設定已同步至登入帳號。
    </template>
    <template v-else>
      設定已保存在這台裝置。
    </template>
  </p>
</template>

<style scoped>
.settings-panel {
  display: grid;
  gap: 1rem;
  max-width: 42rem;
  padding: 1.5rem;
  border: 1px solid #374151;
  border-radius: 1rem;
  background: #1f2937;
}

.range-setting {
  display: grid;
  gap: 0.75rem;
}

.range-setting input {
  width: 100%;
  accent-color: #4ade80;
}

.toggle-setting {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toggle-setting input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #4ade80;
}

.settings-error {
  color: #fca5a5;
}
</style>
