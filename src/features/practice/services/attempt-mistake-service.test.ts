import { describe, expect, it } from "vitest";

import type { CheckedEditorSnapshot } from "./attempt-mistake-service";
import {
  createEditorSnapshotFingerprint,
  recordFailedCheck,
} from "./attempt-mistake-service";

function snapshot(
  overrides: Partial<CheckedEditorSnapshot> = {},
): CheckedEditorSnapshot {
  return {
    content: "wrong",
    cursor: { line: 0, column: 3 },
    mode: "normal",
    ...overrides,
  };
}

describe("createEditorSnapshotFingerprint", () => {
  it("builds the exact content/line/column/mode fingerprint", () => {
    expect(createEditorSnapshotFingerprint(snapshot())).toBe(
      '["wrong",0,3,"normal"]',
    );
  });
});

describe("recordFailedCheck", () => {
  it("increments the first failed check from 0 to 1", () => {
    const result = recordFailedCheck({
      snapshot: snapshot(),
      mistakeCount: 0,
      lastMistakeFingerprint: null,
    });

    expect(result).toEqual({
      mistakeCount: 1,
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
      incremented: true,
    });
  });

  it("does not increment again for the same snapshot", () => {
    const result = recordFailedCheck({
      snapshot: snapshot(),
      mistakeCount: 1,
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
    });

    expect(result).toEqual({
      mistakeCount: 1,
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
      incremented: false,
    });
  });

  it("increments again when the content changes", () => {
    const result = recordFailedCheck({
      snapshot: snapshot({ content: "still wrong" }),
      mistakeCount: 1,
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
    });

    expect(result.mistakeCount).toBe(2);
    expect(result.incremented).toBe(true);
    expect(result.lastMistakeFingerprint).toBe(
      '["still wrong",0,3,"normal"]',
    );
  });

  it("increments again when the cursor changes", () => {
    const result = recordFailedCheck({
      snapshot: snapshot({ cursor: { line: 0, column: 4 } }),
      mistakeCount: 1,
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
    });

    expect(result.mistakeCount).toBe(2);
    expect(result.incremented).toBe(true);
  });

  it("increments again when the mode changes", () => {
    const result = recordFailedCheck({
      snapshot: snapshot({ mode: "insert" }),
      mistakeCount: 1,
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
    });

    expect(result.mistakeCount).toBe(2);
    expect(result.incremented).toBe(true);
  });

  it("treats a negative input mistake count as 0 before incrementing", () => {
    const result = recordFailedCheck({
      snapshot: snapshot(),
      mistakeCount: -5,
      lastMistakeFingerprint: null,
    });

    expect(result.mistakeCount).toBe(1);
    expect(result.incremented).toBe(true);
  });

  it("treats a negative input mistake count as 0 when the snapshot already matches", () => {
    const result = recordFailedCheck({
      snapshot: snapshot(),
      mistakeCount: -5,
      lastMistakeFingerprint: '["wrong",0,3,"normal"]',
    });

    expect(result.mistakeCount).toBe(0);
    expect(result.incremented).toBe(false);
  });

  it("does not mutate the input snapshot", () => {
    const input = Object.freeze({
      content: "wrong",
      cursor: Object.freeze({ line: 0, column: 3 }),
      mode: "normal" as const,
    });

    expect(() =>
      recordFailedCheck({
        snapshot: input,
        mistakeCount: 0,
        lastMistakeFingerprint: null,
      }),
    ).not.toThrow();
    expect(input).toEqual(
      snapshot({ content: "wrong", cursor: { line: 0, column: 3 } }),
    );
  });
});
