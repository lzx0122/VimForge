import {
  onScopeDispose,
  readonly,
  ref,
  watch,
  type Ref,
} from "vue";

function timestamp(startedAt: string): number | null {
  const parsedTimestamp = Date.parse(startedAt);
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
}

function calculateElapsedSeconds(startedAt: string, now: number): number {
  const startedAtTimestamp = timestamp(startedAt);
  if (startedAtTimestamp === null) {
    return 0;
  }

  return Math.max(0, Math.floor((now - startedAtTimestamp) / 1_000));
}

export function useAttemptElapsedTime(
  startedAt: Readonly<Ref<string>>,
  active: Readonly<Ref<boolean>>,
): Readonly<Ref<number>> {
  const elapsedSeconds = ref(0);
  let intervalId: number | null = null;

  function stopRefresh(): void {
    if (intervalId === null) {
      return;
    }

    window.clearInterval(intervalId);
    intervalId = null;
  }

  function refresh(): void {
    elapsedSeconds.value = calculateElapsedSeconds(startedAt.value, Date.now());
  }

  watch(
    [startedAt, active],
    () => {
      stopRefresh();
      refresh();

      if (!active.value || timestamp(startedAt.value) === null) {
        return;
      }

      intervalId = window.setInterval(refresh, 1_000);
    },
    { immediate: true },
  );

  onScopeDispose(stopRefresh);

  return readonly(elapsedSeconds);
}
