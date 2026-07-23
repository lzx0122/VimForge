export interface AttemptDraftSaveScheduler {
  schedule(): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export function createAttemptDraftSaveScheduler(options: {
  save: () => Promise<void>;
  onError: (error: unknown) => void;
}): AttemptDraftSaveScheduler {
  let dirty = false;
  let disposed = false;
  let microtaskQueued = false;
  let runPromise: Promise<void> | null = null;

  function runLoop(): Promise<void> {
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
            break;
          }
        }
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
    if (runPromise !== null) {
      await runPromise;
      return;
    }
    if (dirty) {
      await runLoop();
    }
  }

  async function dispose(): Promise<void> {
    await flush();
    disposed = true;
  }

  return { schedule, flush, dispose };
}
