import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  hashCatalog,
  parseCatalogSnapshot,
  validateCatalogSnapshot,
  type CatalogSnapshot,
} from "../src/content/catalog-contract";
import {
  runSupabase as defaultRunSupabase,
  type CliOptions,
} from "../src/content/supabase-cli-runner";

/** The private query returns one JSON value and never exposes catalog credentials. */
export const PRODUCTION_EXPORT_QUERY = `
with unit_payload as (
  select
    u.id,
    jsonb_build_object(
      'slug', u.slug,
      'title', u.title,
      'description', u.description,
      'difficulty', u.difficulty,
      'estimatedMinutes', u.estimated_minutes,
      'displayOrder', u.display_order,
      'isPublished', u.is_published,
      'skills', coalesce((
        select jsonb_agg(jsonb_build_object(
          'slug', s.slug,
          'name', s.name,
          'description', s.description,
          'category', s.category,
          'difficulty', s.difficulty,
          'primary', us.is_primary,
          'displayOrder', us.display_order
        ) order by us.display_order, s.slug)
        from public.unit_skills us
        join public.skills s on s.id = us.skill_id
        where us.unit_id = u.id
      ), '[]'::jsonb),
      'exercises', coalesce((
        select jsonb_agg(jsonb_build_object(
          'slug', e.slug,
          'title', e.title,
          'instruction', e.instruction,
          'language', e.language,
          'exerciseType', e.exercise_type,
          'difficulty', e.difficulty,
          'initialContent', e.initial_content,
          'expectedContent', e.expected_content,
          'initialCursor', e.initial_cursor,
          'completionRule', e.completion_rule,
          'supportedModes', to_jsonb(e.supported_modes),
          'targetDurationMs', e.target_duration_ms,
          'version', e.version,
          'isPublished', e.is_published,
          'displayOrder', e.display_order,
          'skills', coalesce((
            select jsonb_agg(jsonb_build_object(
              'skillSlug', s2.slug,
              'weight', es.weight,
              'primary', es.is_primary
            ) order by s2.slug)
            from public.exercise_skills es
            join public.skills s2 on s2.id = es.skill_id
            where es.exercise_id = e.id
          ), '[]'::jsonb),
          'solutions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'sequence', sol.sequence,
              'normalizedActions', sol.normalized_actions,
              'keystrokeCount', sol.keystroke_count,
              'recommended', sol.is_recommended,
              'explanation', sol.explanation,
              'displayOrder', sol.display_order
            ) order by sol.display_order, sol.id)
            from public.exercise_solutions sol
            where sol.exercise_id = e.id
          ), '[]'::jsonb),
          'hints', coalesce((
            select jsonb_agg(jsonb_build_object(
              'level', h.level,
              'content', h.content,
              'commandPreview', h.command_preview
            ) order by h.level)
            from public.exercise_hints h
            where h.exercise_id = e.id
          ), '[]'::jsonb)
        ) order by e.display_order, e.slug)
        from public.exercises e
        where e.unit_id = u.id
      ), '[]'::jsonb)
    ) as unit_json
  from public.learning_units u
)
select jsonb_build_object(
  'projectRef', current_setting('app.settings.project_ref', true),
  'releaseState', (select to_jsonb(state) from private.catalog_release_state as state limit 1),
  'snapshot', jsonb_build_object(
    'schemaVersion', 1,
    'units', coalesce((select jsonb_agg(unit_json order by (unit_json->>'displayOrder')::integer) from unit_payload), '[]'::jsonb)
  )
) as catalog_export;
`;

export type SupabaseInvoker = (
  args: readonly string[],
  options?: CliOptions,
) => Promise<string>;

export interface ProductionExportOptions {
  baseSnapshotPath?: string;
  /** Alias accepted by callers that use the shorter name. */
  basePath?: string;
  expectedProjectRef?: string;
  expectedRevision?: number;
  expectedHash?: string;
  outputDirectory?: string;
  /** Alias accepted by callers that use the shorter name. */
  outputDir?: string;
  now?: () => Date;
  cliOptions?: CliOptions;
  runSupabase?: SupabaseInvoker;
  /** Alias useful for tests and wrappers. */
  run?: SupabaseInvoker;
}

export interface ProductionExportResult {
  path: string;
  snapshot: CatalogSnapshot;
  projectRef: string;
  exerciseCount: number;
}

interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function parseReleaseState(value: unknown): { revision: number; hash: string } {
  if (!isRecord(value)) {
    throw new Error("Production output did not include a release state object.");
  }
  const rawRevision = value.revision ?? value.catalogRevision ?? value.catalog_revision;
  if (typeof rawRevision !== "number" || !Number.isInteger(rawRevision) || rawRevision <= 0) {
    throw new Error("Production release state has an invalid revision.");
  }
  const hash = readString(value, "catalogHash", "catalog_hash", "hash");
  if (hash === undefined || !/^sha256:[0-9a-f]{64}$/u.test(hash)) {
    throw new Error("Production release state has an invalid catalog hash.");
  }
  return { revision: rawRevision, hash };
}

function parseJsonOutput(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as unknown;
      } catch {
        // Fall through to the safe error below.
      }
    }
    throw new Error("Production Supabase output was not valid JSON.");
  }
}

function unwrapPayload(value: unknown): JsonRecord {
  if (Array.isArray(value)) {
    const first = value[0];
    return isRecord(first) ? unwrapPayload(first) : {};
  }
  if (!isRecord(value)) return {};
  for (const key of ["catalog_export", "catalogExport", "export"]) {
    const nested = value[key];
    if (isRecord(nested)) return nested;
  }
  return value;
}

function productionSnapshot(payload: JsonRecord, releaseState: unknown, now: () => Date): CatalogSnapshot {
  const release = parseReleaseState(releaseState);
  const rawSnapshot = payload.snapshot ?? payload.catalog;
  const snapshot = isRecord(rawSnapshot)
    ? rawSnapshot
    : payload;
  const units = snapshot.units;
  if (!Array.isArray(units)) {
    throw new Error("Production output did not include catalog units and relations.");
  }
  const candidate = {
    schemaVersion: 1 as const,
    catalogRevision: release.revision,
    catalogHash: "sha256:" + "0".repeat(64),
    exportedAt: now().toISOString(),
    units,
  };
  const parsed = parseCatalogSnapshot(candidate);
  const ordered = {
    ...parsed,
    units: [...parsed.units].sort((left, right) => left.displayOrder - right.displayOrder),
  } satisfies CatalogSnapshot;
  const canonicalHash = hashCatalog(ordered);
  if (release.hash !== canonicalHash) {
    throw new Error("Production release hash does not match the exported catalog.");
  }
  const withHash = { ...ordered, catalogHash: canonicalHash };
  const errors = validateCatalogSnapshot(withHash);
  if (errors.length > 0) {
    throw new Error(`Production catalog is invalid: ${errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  }
  return withHash;
}

function loadExpectedMetadata(options: ProductionExportOptions): { revision: number; hash: string } {
  if (options.expectedRevision !== undefined && options.expectedHash !== undefined) {
    return { revision: options.expectedRevision, hash: options.expectedHash };
  }
  const path = resolve(options.baseSnapshotPath ?? options.basePath ?? "content/catalog.json");
  let parsed: CatalogSnapshot;
  try {
    parsed = parseCatalogSnapshot(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    throw new Error("Repository base catalog snapshot could not be read.");
  }
  const errors = validateCatalogSnapshot(parsed);
  if (errors.length > 0 || hashCatalog(parsed) !== parsed.catalogHash) {
    throw new Error("Repository base catalog snapshot is invalid or has a stale hash.");
  }
  return { revision: parsed.catalogRevision, hash: parsed.catalogHash };
}

/** Export the complete production catalog using only the authenticated CLI. */
export async function exportProductionCatalog(
  options: ProductionExportOptions = {},
): Promise<ProductionExportResult> {
  const expectedProjectRef = options.expectedProjectRef ?? process.env.SUPABASE_PROJECT_REF;
  if (typeof expectedProjectRef !== "string" || expectedProjectRef.trim().length === 0) {
    throw new Error("Expected production project ref is required before querying.");
  }
  const expected = loadExpectedMetadata(options);
  const invoke = options.runSupabase ?? options.run ?? defaultRunSupabase;
  const raw = await invoke(
    ["--project-ref", expectedProjectRef, "db", "query", "--linked", "--output", "json"],
    { ...options.cliOptions, stdin: PRODUCTION_EXPORT_QUERY },
  );
  const payload = unwrapPayload(parseJsonOutput(raw));
  const projectRef = readString(payload, "projectRef", "project_ref")
    ?? (isRecord(payload.project) ? readString(payload.project, "ref", "projectRef", "project_ref") : undefined);
  if (projectRef === undefined) {
    throw new Error("Production output did not identify the linked project.");
  }
  if (projectRef !== expectedProjectRef) {
    throw new Error("Production linked project does not match the expected project.");
  }
  const rawRelease = payload.releaseState ?? payload.release_state;
  const snapshot = productionSnapshot(payload, rawRelease, options.now ?? (() => new Date()));
  if (snapshot.catalogRevision !== expected.revision) {
    throw new Error("Production catalog revision does not match the repository base snapshot.");
  }
  if (snapshot.catalogHash !== expected.hash) {
    throw new Error("Production catalog hash does not match the repository base snapshot.");
  }
  const outputDirectory = resolve(options.outputDirectory ?? options.outputDir ?? "content/exports");
  mkdirSync(outputDirectory, { recursive: true });
  const path = resolve(outputDirectory, `catalog-${snapshot.catalogRevision}-${snapshot.catalogHash}.json`);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return {
    path,
    snapshot,
    projectRef,
    exerciseCount: snapshot.units.reduce((count, unit) => count + unit.exercises.length, 0),
  };
}

function runCli(): void {
  void exportProductionCatalog({ expectedProjectRef: process.argv[2] })
    .then((result) => {
      console.log(`Exported ${result.path} revision=${result.snapshot.catalogRevision} exercises=${result.exerciseCount} hash=${result.snapshot.catalogHash}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Production catalog export failed.");
      process.exitCode = 1;
    });
}

const entryPath = process.argv[1];
if (entryPath !== undefined && resolve(entryPath) === resolve(process.cwd(), "scripts/content-export-production.ts")) {
  runCli();
}
