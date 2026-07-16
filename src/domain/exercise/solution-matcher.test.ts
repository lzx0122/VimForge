import { describe, expect, it } from "vitest";

import type { NormalizedAction } from "../../types";
import {
  matchSolution,
  type SolutionCandidate,
} from "./solution-matcher";

const recommendedActions: NormalizedAction[] = [
  { type: "vim_command", command: 'di"' },
];
const acceptedActions: NormalizedAction[] = [
  { type: "vim_command", command: 'ci"' },
  { type: "insert_text", text: "value", textLength: 5 },
  { type: "mode_change", mode: "normal" },
];
const inefficientActions: NormalizedAction[] = [
  { type: "vim_command", command: "llllx" },
];

const solutions: SolutionCandidate[] = [
  {
    normalizedActions: recommendedActions,
    keystrokeCount: 3,
    isRecommended: true,
  },
  {
    normalizedActions: acceptedActions,
    keystrokeCount: 3,
    isRecommended: false,
  },
  {
    normalizedActions: inefficientActions,
    keystrokeCount: 5,
    isRecommended: false,
  },
];

describe("matchSolution", () => {
  it("returns recommended for an exact recommended action match", () => {
    expect(
      matchSolution({
        actions: recommendedActions,
        completed: true,
        solutions,
      }),
    ).toBe("recommended");
  });

  it("returns accepted for an equally efficient known solution", () => {
    expect(
      matchSolution({
        actions: acceptedActions,
        completed: true,
        solutions,
      }),
    ).toBe("accepted");
  });

  it("returns valid_but_inefficient for a known longer solution", () => {
    expect(
      matchSolution({
        actions: inefficientActions,
        completed: true,
        solutions,
      }),
    ).toBe("valid_but_inefficient");
  });

  it("returns unknown_valid for an unknown sequence with a correct result", () => {
    const unknownActions: NormalizedAction[] = [
      { type: "vim_command", command: "xxxxxxxx" },
    ];

    expect(
      matchSolution({
        actions: unknownActions,
        completed: true,
        solutions,
      }),
    ).toBe("unknown_valid");
  });

  it("does not classify an unknown sequence when the exercise is incomplete", () => {
    expect(
      matchSolution({
        actions: [{ type: "vim_command", command: "x" }],
        completed: false,
        solutions,
      }),
    ).toBeNull();
  });

  it("compares action payloads instead of object identity", () => {
    const copiedActions: NormalizedAction[] = [
      { type: "vim_command", command: 'ci"' },
      { type: "insert_text", text: "value", textLength: 5 },
      { type: "mode_change", mode: "normal" },
    ];

    expect(
      matchSolution({
        actions: copiedActions,
        completed: true,
        solutions,
      }),
    ).toBe("accepted");
  });

  it("prioritizes a recommended match regardless of solution order", () => {
    const duplicateAcceptedSolution: SolutionCandidate = {
      normalizedActions: recommendedActions,
      keystrokeCount: 3,
      isRecommended: false,
    };

    expect(
      matchSolution({
        actions: recommendedActions,
        completed: true,
        solutions: [duplicateAcceptedSolution, ...solutions],
      }),
    ).toBe("recommended");
  });
});
