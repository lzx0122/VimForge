import type { LocalSettings } from "../../../infrastructure/indexed-db/settings-repository";

export type SettingsMergeSource = "local" | "cloud" | "none";

export interface SettingsMergeResult {
  settings: LocalSettings | null;
  source: SettingsMergeSource;
}

export interface SettingsMergeLocalPort {
  get(): Promise<LocalSettings | null>;
  save(settings: LocalSettings): Promise<void>;
}

export interface SettingsMergeCloudPort {
  get(userId: string): Promise<LocalSettings | null>;
  save(userId: string, settings: LocalSettings): Promise<void>;
}

export interface SettingsMergeDependencies {
  userId: string;
  local: SettingsMergeLocalPort;
  cloud: SettingsMergeCloudPort;
  /**
   * sound_enabled is a per-device preference that is never read from or
   * written to the cloud (see SupabaseSettingsRepository). Whatever the
   * merge decides for every other field, the final settings always carry
   * this value instead of whichever side happened to "win".
   */
  preserveSoundEnabled: boolean;
}

type MergeAction =
  | { kind: "none" }
  | { kind: "upload-local"; settings: LocalSettings }
  | { kind: "save-cloud"; settings: LocalSettings }
  | { kind: "keep-local-no-write"; settings: LocalSettings };

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * A boolean sibling of the strict timestamp validators used elsewhere
 * (cloud-learning-state-mapper.ts, cloud-hydration-metadata-repository.ts):
 * range-checks every component instead of trusting Date.parse(), which
 * silently normalizes out-of-range values (minute 60, month 13, Feb 30)
 * instead of rejecting them.
 */
function isValidTimestamp(value: string): boolean {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  if (
    offsetSign !== undefined &&
    (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)
  ) {
    return false;
  }

  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

function resolveMergeAction(
  local: LocalSettings | null,
  cloud: LocalSettings | null,
): MergeAction {
  if (local === null && cloud === null) {
    return { kind: "none" };
  }
  if (local === null) {
    return { kind: "save-cloud", settings: cloud as LocalSettings };
  }
  if (cloud === null) {
    return { kind: "upload-local", settings: local };
  }

  const localValid = isValidTimestamp(local.updatedAt);
  const cloudValid = isValidTimestamp(cloud.updatedAt);

  if (localValid && !cloudValid) {
    return { kind: "upload-local", settings: local };
  }
  if (cloudValid && !localValid) {
    return { kind: "save-cloud", settings: cloud };
  }
  if (!localValid && !cloudValid) {
    return { kind: "keep-local-no-write", settings: local };
  }

  const localMillis = new Date(local.updatedAt).getTime();
  const cloudMillis = new Date(cloud.updatedAt).getTime();
  if (cloudMillis > localMillis) {
    return { kind: "save-cloud", settings: cloud };
  }
  if (localMillis > cloudMillis) {
    return { kind: "upload-local", settings: local };
  }
  return { kind: "keep-local-no-write", settings: local };
}

function hasSameUpdatedAt(
  a: LocalSettings | null,
  b: LocalSettings | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.updatedAt === b.updatedAt;
}

function withPreservedSoundEnabled(
  settings: LocalSettings,
  preserveSoundEnabled: boolean,
): LocalSettings {
  return { ...settings, soundEnabled: preserveSoundEnabled };
}

async function applyAction(
  action: MergeAction,
  dependencies: SettingsMergeDependencies,
): Promise<SettingsMergeResult> {
  if (action.kind === "none") {
    return { settings: null, source: "none" };
  }
  if (action.kind === "save-cloud") {
    const settings = withPreservedSoundEnabled(
      action.settings,
      dependencies.preserveSoundEnabled,
    );
    await dependencies.local.save(settings);
    return { settings, source: "cloud" };
  }
  if (action.kind === "upload-local") {
    const settings = withPreservedSoundEnabled(
      action.settings,
      dependencies.preserveSoundEnabled,
    );
    await dependencies.cloud.save(dependencies.userId, settings);
    return { settings, source: "local" };
  }

  return {
    settings: withPreservedSoundEnabled(
      action.settings,
      dependencies.preserveSoundEnabled,
    ),
    source: "local",
  };
}

/**
 * Merges local and cloud Settings per the rules in the P1 plan: newer
 * valid updatedAt wins, ties and mutual invalidity favor local, and a
 * missing side always loses to whichever side exists.
 *
 * When cloud initially wins, local is re-read once immediately before
 * applying that decision (compare-and-swap): if the user changed local
 * settings while the cloud round trip was in flight, the merge is
 * recomputed against the freshest local snapshot instead of clobbering
 * it. Only one re-read/recompute cycle is performed - a further local
 * change during the final save is accepted as a rare, benign race that
 * the next hydration will reconcile.
 */
export async function mergeCloudSettings(
  dependencies: SettingsMergeDependencies,
): Promise<SettingsMergeResult> {
  const initialLocal = await dependencies.local.get();
  const cloud = await dependencies.cloud.get(dependencies.userId);

  let action = resolveMergeAction(initialLocal, cloud);

  if (action.kind === "save-cloud") {
    const latestLocal = await dependencies.local.get();
    if (!hasSameUpdatedAt(latestLocal, initialLocal)) {
      action = resolveMergeAction(latestLocal, cloud);
    }
  }

  return applyAction(action, dependencies);
}
