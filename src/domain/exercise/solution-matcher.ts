import type { NormalizedAction } from "../../types";

export type SolutionMatch =
  | "recommended"
  | "accepted"
  | "valid_but_inefficient"
  | "unknown_valid";

export interface SolutionCandidate {
  normalizedActions: readonly NormalizedAction[];
  keystrokeCount: number;
  isRecommended: boolean;
}

export interface SolutionMatchInput {
  actions: readonly NormalizedAction[];
  completed: boolean;
  solutions: readonly SolutionCandidate[];
}

function actionMatches(
  actual: NormalizedAction,
  candidate: NormalizedAction,
) {
  switch (actual.type) {
    case "vim_command":
      return (
        candidate.type === "vim_command" &&
        actual.command === candidate.command
      );
    case "insert_text":
      return (
        candidate.type === "insert_text" &&
        actual.text === candidate.text &&
        actual.textLength === candidate.textLength
      );
    case "mode_change":
      return (
        candidate.type === "mode_change" && actual.mode === candidate.mode
      );
    case "undo":
      return candidate.type === "undo";
    case "reset":
      return candidate.type === "reset";
    case "search":
      return (
        candidate.type === "search" &&
        actual.query === candidate.query &&
        actual.direction === candidate.direction
      );
  }
}

function actionSequencesMatch(
  actual: readonly NormalizedAction[],
  candidate: readonly NormalizedAction[],
) {
  return (
    actual.length === candidate.length &&
    actual.every((action, index) => {
      const candidateAction = candidate[index];
      return candidateAction
        ? actionMatches(action, candidateAction)
        : false;
    })
  );
}

export function matchSolution({
  actions,
  completed,
  solutions,
}: SolutionMatchInput): SolutionMatch | null {
  if (!completed) {
    return null;
  }

  const matchedSolutions = solutions.filter((solution) =>
    actionSequencesMatch(actions, solution.normalizedActions),
  );
  if (matchedSolutions.length === 0) {
    return "unknown_valid";
  }
  if (matchedSolutions.some((solution) => solution.isRecommended)) {
    return "recommended";
  }

  const recommendedKeystrokeCounts = solutions
    .filter((solution) => solution.isRecommended)
    .map((solution) => solution.keystrokeCount);
  const recommendedKeystrokeCount = Math.min(...recommendedKeystrokeCounts);
  const matchedKeystrokeCount = Math.min(
    ...matchedSolutions.map((solution) => solution.keystrokeCount),
  );

  return matchedKeystrokeCount > recommendedKeystrokeCount
    ? "valid_but_inefficient"
    : "accepted";
}
