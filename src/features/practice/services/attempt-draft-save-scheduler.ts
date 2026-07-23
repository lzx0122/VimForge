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

    runPromise = (async () => {
      try {
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
      } finally {
        runPromise = null;
      }
    })();

    return runPromise;
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
