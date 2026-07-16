import type { QuestionCount } from "../../types/learning";

export interface PracticeCandidate {
  exerciseId: string;
  skillIds: readonly string[];
  priority: number;
}

export interface PracticeCandidatePools {
  dueOrIncorrect: readonly PracticeCandidate[];
  weak: readonly PracticeCandidate[];
  familiar: readonly PracticeCandidate[];
  stale: readonly PracticeCandidate[];
  sameDifficulty: readonly PracticeCandidate[];
}

export interface PracticeSelectionInput {
  questionCount: QuestionCount;
  touchedSkillIds: readonly string[];
  pools: PracticeCandidatePools;
}

interface SelectionRatio {
  dueOrIncorrect: number;
  weak: number;
  familiar: number;
}

export const PRACTICE_SELECTION_RATIOS: Readonly<
  Record<QuestionCount, SelectionRatio>
> = {
  5: { dueOrIncorrect: 3, weak: 1, familiar: 1 },
  10: { dueOrIncorrect: 7, weak: 2, familiar: 1 },
  20: { dueOrIncorrect: 14, weak: 4, familiar: 2 },
};

function byDescendingPriority(
  candidates: readonly PracticeCandidate[],
): PracticeCandidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftPriority = Number.isFinite(left.candidate.priority)
        ? left.candidate.priority
        : Number.NEGATIVE_INFINITY;
      const rightPriority = Number.isFinite(right.candidate.priority)
        ? right.candidate.priority
        : Number.NEGATIVE_INFINITY;

      return rightPriority - leftPriority || left.index - right.index;
    })
    .map(({ candidate }) => candidate);
}

function hasOnlyTouchedSkills(
  candidate: PracticeCandidate,
  touchedSkillIds: ReadonlySet<string>,
): boolean {
  return (
    candidate.exerciseId.length > 0 &&
    candidate.skillIds.length > 0 &&
    candidate.skillIds.every((skillId) => touchedSkillIds.has(skillId))
  );
}

export function selectPracticeExercises(
  input: PracticeSelectionInput,
): string[] {
  const touchedSkillIds = new Set(input.touchedSkillIds);
  const selectedIds = new Set<string>();
  const selected: string[] = [];
  const ratio = PRACTICE_SELECTION_RATIOS[input.questionCount];

  const selectFrom = (
    candidates: readonly PracticeCandidate[],
    maximum: number,
  ): void => {
    let added = 0;

    for (const candidate of byDescendingPriority(candidates)) {
      if (
        selected.length >= input.questionCount ||
        added >= maximum
      ) {
        return;
      }
      if (
        selectedIds.has(candidate.exerciseId) ||
        !hasOnlyTouchedSkills(candidate, touchedSkillIds)
      ) {
        continue;
      }

      selectedIds.add(candidate.exerciseId);
      selected.push(candidate.exerciseId);
      added += 1;
    }
  };

  selectFrom(input.pools.dueOrIncorrect, ratio.dueOrIncorrect);
  selectFrom(input.pools.weak, ratio.weak);
  selectFrom(input.pools.familiar, ratio.familiar);

  const fillRemainingFrom = [
    input.pools.weak,
    input.pools.stale,
    input.pools.sameDifficulty,
    input.pools.dueOrIncorrect,
    input.pools.familiar,
  ] as const;

  for (const candidates of fillRemainingFrom) {
    selectFrom(candidates, input.questionCount - selected.length);
  }

  return selected;
}
