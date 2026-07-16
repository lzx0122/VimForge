<script setup lang="ts">
import { onMounted, ref } from "vue";

defineProps<{
  hasAttemptDraft: boolean;
}>();

defineEmits<{
  resume: [];
  resetAttempt: [];
  abandon: [];
}>();

const resumeButton = ref<HTMLButtonElement | null>(null);

onMounted(() => {
  resumeButton.value?.focus();
});
</script>

<template>
  <div class="dialog-backdrop">
    <section
      class="resume-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-session-title"
      aria-describedby="resume-session-description"
    >
      <p class="eyebrow">
        本機進度
      </p>
      <h2 id="resume-session-title">
        發現尚未完成的練習
      </h2>
      <p id="resume-session-description">
        <template v-if="hasAttemptDraft">
          未完成的單題內容仍保存在這台裝置。你可以接著操作，或只重設這一題。
        </template>
        <template v-else>
          題組進度仍保存在這台裝置。你可以從目前進度繼續。
        </template>
      </p>

      <div class="dialog-actions">
        <button
          ref="resumeButton"
          type="button"
          class="primary-action"
          data-action="resume"
          @click="$emit('resume')"
        >
          {{ hasAttemptDraft ? "恢復未完成內容" : "繼續題組" }}
        </button>
        <button
          v-if="hasAttemptDraft"
          type="button"
          class="secondary-action"
          data-action="reset-attempt"
          @click="$emit('resetAttempt')"
        >
          重設這一題
        </button>
        <button
          type="button"
          class="danger-action"
          data-action="abandon"
          @click="$emit('abandon')"
        >
          放棄題組
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: rgb(8 15 12 / 78%);
}

.resume-dialog {
  width: min(100%, 32rem);
  padding: clamp(1.5rem, 4vw, 2.25rem);
  border: 1px solid var(--color-border, #355247);
  border-radius: 1rem;
  background: var(--color-surface, #14221c);
  box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%);
}

.eyebrow {
  margin: 0 0 0.5rem;
  color: var(--color-accent, #8ce8b5);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: clamp(1.4rem, 4vw, 1.8rem);
}

#resume-session-description {
  margin: 0.9rem 0 0;
  color: var(--color-text-muted, #bdcbc5);
  line-height: 1.65;
}

.dialog-actions {
  display: grid;
  gap: 0.65rem;
  margin-top: 1.5rem;
}

button {
  min-height: 2.75rem;
  padding: 0.7rem 1rem;
  border: 1px solid transparent;
  border-radius: 0.65rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

button:focus-visible {
  outline: 3px solid var(--color-accent, #8ce8b5);
  outline-offset: 3px;
}

.primary-action {
  color: #0b1a13;
  background: var(--color-accent, #8ce8b5);
}

.secondary-action {
  color: var(--color-text, #f5faf7);
  border-color: var(--color-border, #527064);
  background: transparent;
}

.danger-action {
  color: #ffd8d3;
  border-color: #7e3f3a;
  background: #3a211f;
}
</style>
