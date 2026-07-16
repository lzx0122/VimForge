import { effectScope, nextTick, ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAttemptElapsedTime } from "./use-attempt-elapsed-time";

interface ElapsedHarness {
  active: Ref<boolean>;
  elapsedSeconds: Readonly<Ref<number>>;
  startedAt: Ref<string>;
  stop: () => void;
}

function createHarness(
  startedAtValue = "2026-07-16T04:00:00.000Z",
  activeValue = true,
): ElapsedHarness {
  const scope = effectScope();
  const startedAt = ref(startedAtValue);
  const active = ref(activeValue);
  const elapsedSeconds = scope.run(() =>
    useAttemptElapsedTime(startedAt, active),
  );
  if (!elapsedSeconds) {
    throw new Error("expected elapsed-time composable to initialize");
  }

  return {
    active,
    elapsedSeconds,
    startedAt,
    stop: () => scope.stop(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-07-16T04:00:10.000Z");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAttemptElapsedTime", () => {
  it("derives elapsed seconds from wall-clock time on every refresh", () => {
    const harness = createHarness();

    expect(harness.elapsedSeconds.value).toBe(10);

    vi.setSystemTime("2026-07-16T04:00:30.000Z");
    vi.advanceTimersByTime(1_000);

    expect(harness.elapsedSeconds.value).toBe(31);
    harness.stop();
  });

  it("stops refreshing after the attempt becomes inactive", async () => {
    const harness = createHarness();
    vi.setSystemTime("2026-07-16T04:00:12.000Z");

    harness.active.value = false;
    await nextTick();

    expect(harness.elapsedSeconds.value).toBe(12);
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime("2026-07-16T04:01:00.000Z");
    vi.advanceTimersByTime(5_000);
    expect(harness.elapsedSeconds.value).toBe(12);
    harness.stop();
  });

  it("clears its refresh interval when the owning scope stops", () => {
    const harness = createHarness();

    expect(vi.getTimerCount()).toBe(1);
    harness.stop();
    harness.stop();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("recalculates when an active attempt start time changes", async () => {
    const harness = createHarness();

    harness.startedAt.value = "2026-07-16T04:00:05.000Z";
    await nextTick();

    expect(harness.elapsedSeconds.value).toBe(5);
    expect(vi.getTimerCount()).toBe(1);
    harness.stop();
  });

  it("does not schedule refreshes for an invalid start time", () => {
    const harness = createHarness("not-a-date");

    expect(harness.elapsedSeconds.value).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    harness.stop();
  });
});
