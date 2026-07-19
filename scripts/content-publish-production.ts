import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import {
  parseCatalogSnapshot,
  type CatalogSnapshot,
} from "../src/content/catalog-contract";
import {
  preflightProductionPublish,
  type PublishInput,
  type PublishManifest,
} from "../src/content/publish-preflight";
import {
  readLinkedProjectRef,
  runSupabase as defaultRunSupabase,
  type CliOptions,
} from "../src/content/supabase-cli-runner";

export type PublishInvoker = (args: readonly string[], options?: CliOptions) => Promise<string>;

export interface PublishProductionInput {
  expectedProjectRef: string;
  baseSnapshot: CatalogSnapshot;
  targetSnapshot: CatalogSnapshot;
  manifest: PublishManifest;
  migrationSql: string;
  /** Test and embedding hook; the CLI entry point always prompts interactively. */
  typedProjectRef?: string;
  confirmProjectRef?: string;
  projectRefConfirmation?: string;
  confirmation?: string;
  /** Exact text entered for the final, independent publish confirmation. */
  finalConfirmation?: string;
  publishConfirmation?: string;
  /** Test and embedding hook for mocked migration inspection. */
  linkedProjectRef?: string;
  pendingMigrations?: readonly string[];
  runSupabase?: PublishInvoker;
  cliOptions?: CliOptions;
  prompt?: (question: string) => Promise<string>;
  /** Optional manifest path used only to resolve a relative migration path. */
  migrationPath?: string;
  confirmLargeChange?: boolean;
}

export interface PublishResult {
  success: true;
  projectRef: string;
  revision: number;
  hash: string;
  summary: PublishManifest["counts"];
}

const RELEASE_STATE_QUERY = `select json_build_object('revision', revision, 'catalogHash', catalog_hash) as release_state from private.catalog_release_state where singleton = true;`;
const FINAL_PUBLISH_CONFIRMATION = "PUBLISH";

function parseJson(raw: string): unknown {
  const text = raw.trim();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as unknown;
      } catch {
        // Use the safe error below.
      }
    }
    return undefined;
  }
}

function records(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => records(item));
  if (typeof value !== "object" || value === null) return [value];
  const record = value as Record<string, unknown>;
  const nested = [record.data, record.result, record.rows, record.migrations, record.pending, record.release_state, record.releaseState];
  const children = nested.flatMap((item) => item === undefined ? [] : records(item));
  return children.length > 0 ? children : [value];
}

export function pendingFromDryRun(raw: string): string[] {
  const listedMigrations = raw.split(/Would push these migrations:\s*/iu)[1];
  if (listedMigrations !== undefined) {
    const listed = listedMigrations.match(/\b\d{8,}[^\s,)]*\.sql\b/gu) ?? [];
    return [...new Set(listed.map((value) => basename(value)))];
  }
  const values: string[] = [];
  for (const item of records(parseJson(raw))) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    for (const key of ["name", "migration", "migrationName", "version"]) {
      const value = record[key];
      if (typeof value === "string" && /\d{8,}.*\.sql$/u.test(value)) values.push(value);
    }
  }
  if (values.length > 0) return [...new Set(values.map((value) => basename(value)))];
  return [...new Set((raw.match(/\b\d{8,}[^\s,)]*\.sql\b/gu) ?? []).map((value) => basename(value)))];
}

function releaseState(raw: string): { revision: number; hash: string } {
  const parsed = parseJson(raw);
  for (const item of records(parsed)) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const nested = record.releaseState ?? record.release_state;
    const candidate = typeof nested === "object" && nested !== null ? nested as Record<string, unknown> : record;
    const revision = candidate.revision ?? candidate.catalogRevision ?? candidate.catalog_revision;
    const hash = candidate.catalogHash ?? candidate.catalog_hash ?? candidate.hash;
    if (typeof revision === "number" && Number.isInteger(revision) && typeof hash === "string") {
      return { revision, hash };
    }
  }
  throw new Error("Post-publish release state was missing or invalid.");
}

async function interactiveProjectConfirmation(expected: string): Promise<string> {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await reader.question(`Type the production project ref (${expected}) to continue: `);
  } finally {
    reader.close();
  }
}

async function interactiveFinalConfirmation(expected: string): Promise<string> {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await reader.question(`Type ${FINAL_PUBLISH_CONFIRMATION} to apply this catalog release to ${expected}: `);
  } finally {
    reader.close();
  }
}

function safeError(message: string): Error {
  return new Error(message);
}

/** Guarded production publisher. The db push command is unreachable until all checks and typed confirmation pass. */
export async function publishProduction(input: PublishProductionInput): Promise<PublishResult> {
  const invoke = input.runSupabase ?? defaultRunSupabase;
  let linkedProjectRef = input.linkedProjectRef;
  if (linkedProjectRef === undefined) {
    linkedProjectRef = readLinkedProjectRef(input.cliOptions?.cwd);
    if (linkedProjectRef === undefined) throw safeError("Linked Supabase project could not be identified.");
  }
  let pending = input.pendingMigrations;
  if (pending === undefined) {
    let dryRun: string;
    try {
      dryRun = await invoke(["db", "push", "--linked", "--dry-run"], input.cliOptions);
    } catch {
      throw safeError("Unable to inspect pending Supabase migrations.");
    }
    pending = pendingFromDryRun(dryRun);
  }
  const typedProjectRef = input.typedProjectRef
    ?? input.confirmProjectRef
    ?? input.projectRefConfirmation
    ?? input.confirmation
    ?? await (input.prompt ?? interactiveProjectConfirmation)(input.expectedProjectRef);
  const migrationPath = input.migrationPath ?? input.manifest.migrationPath;
  const preflightInput: PublishInput = {
    expectedProjectRef: input.expectedProjectRef,
    linkedProjectRef,
    typedProjectRef,
    baseSnapshot: input.baseSnapshot,
    targetSnapshot: input.targetSnapshot,
    migrationPath,
    migrationSql: input.migrationSql,
    pendingMigrations: pending,
    manifest: input.manifest,
    confirmLargeChange: input.confirmLargeChange ?? false,
  };
  const preflight = preflightProductionPublish(preflightInput);
  const { added, changed, unpublished, unchanged } = preflight.summary;
  console.log(`Catalog release summary: added ${added}, changed ${changed}, unpublished ${unpublished}, unchanged ${unchanged}.`);
  const finalConfirmation = input.finalConfirmation
    ?? input.publishConfirmation
    ?? (input.prompt === undefined
      ? await interactiveFinalConfirmation(input.expectedProjectRef)
      : await input.prompt(`Type ${FINAL_PUBLISH_CONFIRMATION} to apply this catalog release to ${input.expectedProjectRef}: `));
  if (finalConfirmation !== FINAL_PUBLISH_CONFIRMATION) {
    throw safeError(`Final publish confirmation must be exactly ${FINAL_PUBLISH_CONFIRMATION}.`);
  }
  let pushError = false;
  try {
    await invoke(["db", "push", "--linked"], input.cliOptions);
  } catch {
    pushError = true;
  }
  if (pushError) {
    throw safeError("Production publish failed: the catalog migration was not applied. Review Supabase status and retry.");
  }
  let rawState: string;
  try {
    rawState = await invoke(["db", "query", "--linked", "--output", "json", RELEASE_STATE_QUERY], input.cliOptions);
  } catch {
    throw safeError("Production publish could not be verified; retain the migration evidence and prepare a forward fix.");
  }
  const state = releaseState(rawState);
  if (state.revision !== input.manifest.targetRevision || state.hash !== input.manifest.targetHash) {
    throw safeError("Production publish verification failed: release revision or catalog hash does not match the manifest.");
  }
  return {
    success: true,
    projectRef: input.expectedProjectRef,
    revision: state.revision,
    hash: state.hash,
    summary: preflight.summary,
  };
}

function loadCliInput(): PublishProductionInput {
  const argumentsValue = process.argv.slice(2);
  const positionalArguments = argumentsValue.filter((argument) => !argument.startsWith("-"));
  const manifestPath = resolve(positionalArguments[0] ?? "content/release-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PublishManifest;
  const baseSnapshot = parseCatalogSnapshot(JSON.parse(readFileSync("content/catalog.json", "utf8")) as unknown);
  const targetPath = positionalArguments[1] ?? manifest.targetPath;
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    throw safeError("Release manifest target snapshot path is missing.");
  }
  const targetSnapshot = parseCatalogSnapshot(JSON.parse(readFileSync(targetPath, "utf8")) as unknown);
  const migrationPath = resolve(manifest.migrationPath);
  return {
    expectedProjectRef: process.env.SUPABASE_PROJECT_REF ?? "",
    baseSnapshot,
    targetSnapshot,
    manifest,
    migrationSql: readFileSync(migrationPath, "utf8"),
    migrationPath: manifest.migrationPath,
    confirmLargeChange: argumentsValue.includes("--confirm-large-change"),
  };
}

async function runCli(): Promise<void> {
  try {
    const result = await publishProduction(loadCliInput());
    console.log(`Published catalog revision ${result.revision} (${result.hash}) to ${result.projectRef}.`);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "Production publish failed.");
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && resolve(entryPath) === resolve(process.cwd(), "scripts/content-publish-production.ts")) {
  void runCli();
}
