import type { VimMode } from "../../../types/learning";

export interface CheckedEditorSnapshot {
  content: string;
  cursor: {
    line: number;
    column: number;
  };
  mode: VimMode;
}

export interface FailedCheckResult {
  mistakeCount: number;
  lastMistakeFingerprint: string;
  incremented: boolean;
}

function normalizeNonNegativeInteger(value: number): number {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function createEditorSnapshotFingerprint(
  snapshot: CheckedEditorSnapshot,
): string {
  return JSON.stringify([
    snapshot.content,
    snapshot.cursor.line,
    snapshot.cursor.column,
    snapshot.mode,
  ]);
}

/**
 * A mistake is counted only when the learner presses the explicit check
 * button and the current snapshot is still incomplete (P1 fixed decision):
 * the same content/cursor/mode fingerprint can count only once, so pressing
 * check repeatedly against an unchanged snapshot never inflates the count.
 */
export function recordFailedCheck(input: {
  snapshot: CheckedEditorSnapshot;
  mistakeCount: number;
  lastMistakeFingerprint: string | null;
}): FailedCheckResult {
  const fingerprint = createEditorSnapshotFingerprint(input.snapshot);
  const baseline = normalizeNonNegativeInteger(input.mistakeCount);
  const alreadyCounted = fingerprint === input.lastMistakeFingerprint;

  return {
    mistakeCount: alreadyCounted ? baseline : baseline + 1,
    lastMistakeFingerprint: fingerprint,
    incremented: !alreadyCounted,
  };
}
