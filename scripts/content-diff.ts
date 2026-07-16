import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  diffCatalog,
  type CatalogDiff,
} from "../src/content/catalog-diff";
import {
  hashCatalog,
  parseCatalogSnapshot,
  validateCatalogSnapshot,
  type CatalogSnapshot,
} from "../src/content/catalog-contract";

export interface CatalogDiffFileResult {
  base: CatalogSnapshot;
  next: CatalogSnapshot;
  diff: CatalogDiff;
}

function readSnapshot(path: string, label: string): CatalogSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error(`${label} catalog is not valid JSON.`);
  }
  let snapshot: CatalogSnapshot;
  try {
    snapshot = parseCatalogSnapshot(value);
  } catch {
    throw new Error(`${label} catalog does not match the catalog schema.`);
  }
  const errors = validateCatalogSnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`${label} catalog is invalid: ${errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  }
  if (hashCatalog(snapshot) !== snapshot.catalogHash) {
    throw new Error(`${label} catalog hash is stale or does not match its content.`);
  }
  return snapshot;
}

export function diffCatalogFiles(basePath: string, nextPath: string): CatalogDiffFileResult {
  const base = readSnapshot(resolve(basePath), "Base");
  const next = readSnapshot(resolve(nextPath), "Modified");
  return { base, next, diff: diffCatalog(base, next) };
}

function displayValue(value: unknown): string {
  const rendered = JSON.stringify(value);
  return rendered === undefined ? "undefined" : rendered;
}

export function formatCatalogDiff(diff: CatalogDiff): string {
  const lines: string[] = [
    `Added: ${diff.added.length}`,
    `Changed: ${diff.changed.length}`,
    `Unpublish: ${diff.removed.length}`,
    `Unchanged: ${diff.unchanged.length}`,
  ];
  for (const change of diff.changed) {
    lines.push(`Changed ${change.slug}:`);
    for (const field of change.fields) {
      lines.push(`  ${field.field}: ${displayValue(field.before)} -> ${displayValue(field.after)}`);
    }
  }
  for (const item of diff.added) lines.push(`Added ${item.slug}`);
  for (const item of diff.removed) lines.push(`Unpublish ${item.slug}`);
  return lines.join("\n");
}

interface CliArguments {
  basePath: string;
  modifiedPath: string;
  allowLargeChange: boolean;
}

function parseArguments(args: readonly string[]): CliArguments {
  let basePath = "content/catalog.json";
  let modifiedPath: string | undefined;
  let allowLargeChange = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--allow-large-change") {
      allowLargeChange = true;
    } else if (argument === "--base") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("Usage: npm run content:diff -- [--base base.json] modified.json [--allow-large-change]");
      basePath = value;
      index += 1;
    } else if (argument !== undefined && !argument.startsWith("--") && modifiedPath === undefined) {
      modifiedPath = argument;
    }
  }
  if (modifiedPath === undefined) {
    throw new Error("Usage: npm run content:diff -- [--base base.json] modified.json [--allow-large-change]");
  }
  return { basePath, modifiedPath, allowLargeChange };
}

function runCli(): void {
  try {
    const argumentsValue = parseArguments(process.argv.slice(2));
    const result = diffCatalogFiles(argumentsValue.basePath, argumentsValue.modifiedPath);
    if (result.diff.largeChange && !argumentsValue.allowLargeChange) {
      throw new Error("Catalog diff exceeds the 25% large-change threshold; rerun with --allow-large-change.");
    }
    console.log(formatCatalogDiff(result.diff));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "Catalog diff failed.");
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && resolve(entryPath) === resolve(process.cwd(), "scripts/content-diff.ts")) {
  runCli();
}

