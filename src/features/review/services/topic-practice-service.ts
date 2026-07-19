import type { MasteryLevel } from "../../../domain/mastery/mastery-config";
import type { QuestionCount } from "../../../types/learning";

export interface TopicPracticeCandidate {
  exerciseId: string;
  topicSlugs: readonly string[];
  masteryLevel: MasteryLevel;
  sameDayAttemptCount: number;
  lastPracticedAt: string | null;
}

export interface TopicPracticePlanInput {
  selectedTopics: readonly string[];
  questionCount: QuestionCount;
  candidates: readonly TopicPracticeCandidate[];
  dueExerciseIds: readonly string[];
}

export interface TopicPracticeExercise {
  exerciseId: string;
  masteryGainMultiplier: number;
}

export interface TopicPracticePlan {
  exercises: TopicPracticeExercise[];
  preservedDueExerciseIds: string[];
}

function normalizedRepeatCount(repeatCount: number): number {
  if (!Number.isFinite(repeatCount) || repeatCount <= 0) {
    return 0;
  }

  return Math.floor(repeatCount);
}

export function sameDayMasteryMultiplier(
  previousAttemptsToday: number,
): number {
  const repeatCount = normalizedRepeatCount(previousAttemptsToday);

  return Math.round((1 / (1 + repeatCount)) * 100) / 100;
}

function lastPracticedTime(lastPracticedAt: string | null): number {
  if (lastPracticedAt === null) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(lastPracticedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function createTopicPracticePlan(
  input: TopicPracticePlanInput,
): TopicPracticePlan {
  const selectedTopics = new Set(
    input.selectedTopics.filter((topic) => topic.length > 0),
  );

  if (selectedTopics.size === 0) {
    throw new Error("Select at least one topic for topic practice.");
  }

  const rankedCandidates = input.candidates
    .map((practiceCandidate, index) => ({ practiceCandidate, index }))
    .filter(({ practiceCandidate }) =>
      practiceCandidate.topicSlugs.some((topic) =>
        selectedTopics.has(topic),
      ),
    )
    .sort((left, right) => {
      const masteryDifference =
        left.practiceCandidate.masteryLevel -
        right.practiceCandidate.masteryLevel;
      const repeatDifference =
        normalizedRepeatCount(left.practiceCandidate.sameDayAttemptCount) -
        normalizedRepeatCount(right.practiceCandidate.sameDayAttemptCount);
      const practiceTimeDifference =
        lastPracticedTime(left.practiceCandidate.lastPracticedAt) -
        lastPracticedTime(right.practiceCandidate.lastPracticedAt);

      return (
        masteryDifference ||
        repeatDifference ||
        practiceTimeDifference ||
        left.index - right.index
      );
    });
  const selectedExerciseIds = new Set<string>();
  const exercises: TopicPracticeExercise[] = [];

  for (const { practiceCandidate } of rankedCandidates) {
    if (exercises.length >= input.questionCount) {
      break;
    }
    if (
      practiceCandidate.exerciseId.length === 0 ||
      selectedExerciseIds.has(practiceCandidate.exerciseId)
    ) {
      continue;
    }

    selectedExerciseIds.add(practiceCandidate.exerciseId);
    exercises.push({
      exerciseId: practiceCandidate.exerciseId,
      masteryGainMultiplier: sameDayMasteryMultiplier(
        practiceCandidate.sameDayAttemptCount,
      ),
    });
  }

  return {
    exercises,
    preservedDueExerciseIds: [...input.dueExerciseIds],
  };
}
