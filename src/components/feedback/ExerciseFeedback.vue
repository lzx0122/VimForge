<script lang="ts">
import type { LearningMode } from "../../types";
import type { MasteryLevel } from "../../domain/mastery/mastery-config";

export interface ExerciseFeedbackProps {
  completed: boolean;
  learningMode: LearningMode;
  accuracyScore: number;
  speedScore: number;
  previousMasteryLevel: MasteryLevel;
  nextMasteryLevel: MasteryLevel;
  userSequence: string;
  recommendedSequence: string;
  improvementReason: string;
  actualKeystrokeCount: number;
  recommendedKeystrokeCount: number;
}
</script>

<script setup lang="ts">
import { computed } from "vue";

import MetricCard from "./MetricCard.vue";

const props = defineProps<ExerciseFeedbackProps>();

const emit = defineEmits<{
  requestNext: [];
}>();

const MASTERY_LABELS: Readonly<
  Record<ExerciseFeedbackProps["nextMasteryLevel"], string>
> = {
  0: "未學習",
  1: "不熟",
  2: "練習中",
  3: "熟悉",
  4: "熟練",
  5: "已掌握",
};

function accuracyDescription(score: number) {
  if (score === 100) {
    return "一次完成";
  }
  if (score >= 80) {
    return "穩定";
  }
  if (score >= 60) {
    return "可再精準";
  }
  return "需要重試";
}

function speedDescription(score: number) {
  if (score === 0) {
    return "未完成";
  }
  if (score >= 90) {
    return "極快";
  }
  if (score >= 75) {
    return "流暢";
  }
  if (score >= 50) {
    return "普通";
  }
  return "可再精簡";
}

const accuracySummary = computed(() =>
  accuracyDescription(props.accuracyScore),
);
const speedSummary = computed(() => speedDescription(props.speedScore));
const masterySummary = computed(
  () => MASTERY_LABELS[props.nextMasteryLevel],
);
const speedLabel = computed(() =>
  props.learningMode === "beginner" ? "速度（參考）" : "速度",
);
const speedAccessibilityLabel = computed(
  () => `${speedLabel.value}：${props.speedScore} 分，${speedSummary.value}`,
);
const keystrokeGap = computed(
  () => props.actualKeystrokeCount - props.recommendedKeystrokeCount,
);
const formattedKeystrokeGap = computed(() =>
  keystrokeGap.value > 0 ? `+${keystrokeGap.value}` : `${keystrokeGap.value}`,
);
</script>

<template>
  <article
    class="exercise-feedback"
    aria-labelledby="exercise-feedback-title"
  >
    <section
      class="exercise-feedback-completion"
      data-feedback-section="completion"
    >
      <p class="exercise-feedback-eyebrow">
        單題結果
      </p>
      <h2
        id="exercise-feedback-title"
        role="status"
      >
        {{ completed ? "完成！" : "尚未完成" }}
      </h2>
    </section>

    <div class="exercise-feedback-metrics">
      <section data-feedback-section="accuracy">
        <MetricCard
          label="準確"
          :value="`${accuracyScore}`"
          :description="accuracySummary"
          :accessibility-label="`準確：${accuracyScore} 分，${accuracySummary}`"
        />
      </section>

      <section
        data-feedback-section="speed"
        :class="{ 'is-subdued': learningMode === 'beginner' }"
      >
        <MetricCard
          :label="speedLabel"
          :value="`${speedScore}`"
          :description="speedSummary"
          :accessibility-label="speedAccessibilityLabel"
        />
        <p
          v-if="learningMode === 'efficiency'"
          class="keystroke-gap"
          data-testid="keystroke-gap"
        >
          按鍵差距：{{ formattedKeystrokeGap }}
          <span>
            （實際 {{ actualKeystrokeCount }} / 推薦 {{ recommendedKeystrokeCount }}）
          </span>
        </p>
      </section>

      <section data-feedback-section="mastery">
        <MetricCard
          label="熟練"
          :value="`${previousMasteryLevel} → ${nextMasteryLevel}`"
          :description="masterySummary"
          :accessibility-label="`熟練：${previousMasteryLevel} 到 ${nextMasteryLevel}，${masterySummary}`"
        />
      </section>
    </div>

    <section
      class="exercise-feedback-solutions"
      data-feedback-section="solutions"
      aria-labelledby="exercise-feedback-solutions-title"
    >
      <h3 id="exercise-feedback-solutions-title">
        解法比較
      </h3>
      <div class="solution-grid">
        <div>
          <h4>你的操作</h4>
          <code>{{ userSequence }}</code>
        </div>
        <div>
          <h4>推薦操作</h4>
          <code>{{ recommendedSequence }}</code>
        </div>
      </div>
      <p class="improvement-reason">
        {{ improvementReason }}
      </p>
    </section>

    <button
      type="button"
      class="next-exercise-button"
      @click="emit('requestNext')"
    >
      下一題
    </button>
  </article>
</template>

<style scoped>
.exercise-feedback {
  display: grid;
  gap: 1.5rem;
  max-width: 58rem;
  padding: 1.5rem;
  border: 1px solid #374151;
  border-radius: 1.1rem;
  background: #1f2937;
}

.exercise-feedback-eyebrow {
  margin: 0 0 0.35rem;
  color: #86efac;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3,
h4 {
  margin: 0;
  color: #f9fafb;
}

h2 {
  font-size: 2rem;
}

.exercise-feedback-metrics,
.solution-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.exercise-feedback-metrics > section {
  min-width: 0;
}

.exercise-feedback-metrics > .is-subdued :deep(.metric-card) {
  border-style: dashed;
  background: #18202d;
}

.keystroke-gap {
  margin: 0.65rem 0 0;
  color: #fbbf24;
  font-size: 0.88rem;
  font-weight: 800;
}

.keystroke-gap span {
  color: #d1d5db;
  font-weight: 500;
}

.exercise-feedback-solutions {
  display: grid;
  gap: 1rem;
  padding-top: 1.25rem;
  border-top: 1px solid #374151;
}

.solution-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.solution-grid > div {
  display: grid;
  gap: 0.55rem;
  min-width: 0;
  padding: 1rem;
  border-radius: 0.75rem;
  background: #111827;
}

.solution-grid code {
  overflow-wrap: anywhere;
  color: #86efac;
  font-size: 0.92rem;
}

.improvement-reason {
  margin: 0;
  color: #d1d5db;
  line-height: 1.65;
}

.next-exercise-button {
  justify-self: end;
  padding: 0.75rem 1rem;
  border: 0;
  border-radius: 0.6rem;
  color: #052e16;
  background: #4ade80;
  cursor: pointer;
  font-weight: 800;
}

@media (max-width: 44rem) {
  .exercise-feedback-metrics,
  .solution-grid {
    grid-template-columns: 1fr;
  }

  .next-exercise-button {
    justify-self: stretch;
  }
}
</style>
