import { describe, expect, it, vi } from "vitest";

import { createAttemptDraftSaveScheduler } from "./attempt-draft-save-scheduler";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function tick(times = 1): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

describe("createAttemptDraftSaveScheduler", () => {
  it("collapses three synchronous schedule() calls into one save after one microtask", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(save).not.toHaveBeenCalled();

    await tick();

    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("flush() drives a scheduled save to completion without waiting for another microtask tick to be awaited externally", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    scheduler.schedule();
    await scheduler.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("runs a second save afterward when schedule() occurs during an in-flight save", async () => {
    const deferreds = [createDeferred<void>(), createDeferred<void>()];
    let callIndex = 0;
    const save = vi
      .fn()
      .mockImplementation(() => deferreds[callIndex++]!.promise);
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    scheduler.schedule();
    await tick();
    expect(save).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    deferreds[0]!.resolve();
    await tick();
    expect(save).toHaveBeenCalledTimes(2);

    deferreds[1]!.resolve();
    await scheduler.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("runs saves serially, never starting a save before the previous one resolves", async () => {
    const deferreds = [createDeferred<void>(), createDeferred<void>()];
    const resolvedFlags = [false, false];
    let callIndex = 0;
    const save = vi.fn().mockImplementation(() => {
      const index = callIndex;
      if (index > 0) {
        expect(resolvedFlags[index - 1]).toBe(true);
      }
      callIndex += 1;
      return deferreds[index]!.promise;
    });
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    scheduler.schedule();
    await tick();

    scheduler.schedule();
    resolvedFlags[0] = true;
    deferreds[0]!.resolve();
    await tick();

    resolvedFlags[1] = true;
    deferreds[1]!.resolve();
    await scheduler.flush();

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("calls onError on a failed save and retries successfully on a later flush()", async () => {
    const error = new Error("save failed");
    const save = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    scheduler.schedule();
    await scheduler.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);

    await scheduler.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("dispose() persists dirty state before resolving", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    scheduler.schedule();
    await scheduler.dispose();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("ignores schedule() calls after dispose() resolves", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    await scheduler.dispose();
    scheduler.schedule();
    await tick(3);

    expect(save).not.toHaveBeenCalled();
  });

  it("lets the save callback read state current at execution time, not at schedule time", async () => {
    let latestValue = "initial";
    const observedValues: string[] = [];
    const save = vi.fn().mockImplementation(async () => {
      observedValues.push(latestValue);
    });
    const onError = vi.fn();
    const scheduler = createAttemptDraftSaveScheduler({ save, onError });

    scheduler.schedule();
    latestValue = "changed-before-microtask-runs";
    await scheduler.flush();

    expect(observedValues).toEqual(["changed-before-microtask-runs"]);
  });
});
