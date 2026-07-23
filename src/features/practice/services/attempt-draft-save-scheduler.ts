export interface AttemptDraftSaveScheduler {
  schedule(): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

type RunResult = "completed" | "failed";

export function createAttemptDraftSaveScheduler(options: {
  save: () => Promise<void>;
  onError: (error: unknown) => void;
}): AttemptDraftSaveScheduler {
  let dirty = false;
  let disposed = false;
  let microtaskQueued = false;
  let runPromise: Promise<RunResult> | null = null;

  function runLoop(): Promise<RunResult> {
    if (runPromise !== null) {
      return runPromise;
    }

    const currentRun: Promise<RunResult> = (async () => {
      while (dirty) {
        dirty = false;
        try {
          await options.save();
        } catch (error) {
          dirty = true;
          options.onError(error);
          return "failed";
        }
      }
      return "completed";
    })();

    runPromise = currentRun;
    // `currentRun` can already be settled by the time this line runs (a
    // synchronous throw from options.save() never suspends the async
    // function), so clearing runPromise here instead of in a `finally`
    // avoids the outer assignment above overwriting a clear that already
    // happened. The identity check stops this from clobbering a newer run
    // that replaced `currentRun` in the meantime.
    void currentRun.then(
      () => {
        if (runPromise === currentRun) {
          runPromise = null;
        }
      },
      () => {
        if (runPromise === currentRun) {
          runPromise = null;
        }
      },
    );

    return currentRun;
  }

  function queueMicrotaskRun(): void {
    if (microtaskQueued) {
      return;
    }
    microtaskQueued = true;
    queueMicrotask(() => {
      microtaskQueued = false;
      void runLoop();
    });
  }

  function schedule(): void {
    if (disposed) {
      return;
    }
    dirty = true;
    queueMicrotaskRun();
  }

  async function flush(): Promise<void> {
    for (;;) {
      if (runPromise !== null) {
        const result = await runPromise;
        if (result === "failed") {
          return;
        }
        continue;
      }
      if (dirty) {
        const result = await runLoop();
        if (result === "failed") {
          return;
        }
        continue;
      }
      if (microtaskQueued) {
        await Promise.resolve();
        continue;
      }
      return;
    }
  }

  async function dispose(): Promise<void> {
    await flush();
    disposed = true;
  }

  return { schedule, flush, dispose };
}
