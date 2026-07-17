import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface SupabaseProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface SupabaseProcessOptions extends SpawnOptionsWithoutStdio {
  stdin?: string;
  timeoutMs?: number;
}

export type SupabaseProcessRunner = (
  command: string,
  args: readonly string[],
  options: SupabaseProcessOptions,
) => Promise<SupabaseProcessResult>;

export interface CliOptions {
  /** Injectable process execution used by unit tests and release tooling. */
  runner?: SupabaseProcessRunner;
  /** The repository-pinned binary can be supplied by the caller when needed. */
  command?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
}

/** Keep production tooling on a known CLI release and never download it implicitly. */
export const SUPABASE_CLI_VERSION = "2.79.0";
export const DEFAULT_SUPABASE_CLI_COMMAND = "npx";
export const DEFAULT_SUPABASE_CLI_PREFIX = [
  "--no-install",
  `supabase@${SUPABASE_CLI_VERSION}`,
] as const;

/**
 * `supabase status` inspects the local Docker stack, not the linked hosted
 * project. `supabase link` records the hosted project ref in this file.
 */
export function readLinkedProjectRef(cwd = process.cwd()): string | undefined {
  try {
    const value = readFileSync(resolve(cwd, "supabase", ".temp", "project-ref"), "utf8").trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function spawnSupabase(
  command: string,
  args: readonly string[],
  options: SupabaseProcessOptions,
): Promise<SupabaseProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      ...options,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
        child.kill("SIGTERM");
        if (!settled) {
          settled = true;
          reject(new Error("Supabase CLI command timed out."));
        }
      }, options.timeoutMs);
    const finish = (callback: () => void): void => {
      if (timeout !== undefined) clearTimeout(timeout);
      if (!settled) {
        settled = true;
        callback();
      }
    };
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", () => {
      finish(() => reject(new Error("Unable to start the Supabase CLI.")));
    });
    child.once("close", (exitCode) => {
      finish(() => resolve({ stdout, stderr, exitCode }));
    });
    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

/**
 * Run the Supabase CLI without logging its arguments, stderr, or environment.
 * Production callers must pass explicit linked-project flags in `args`.
 */
export async function runSupabase(
  args: readonly string[],
  options: CliOptions = {},
): Promise<string> {
  const command = options.command ?? DEFAULT_SUPABASE_CLI_COMMAND;
  const runner = options.runner ?? spawnSupabase;
  const commandArgs = options.command === undefined
    ? [...DEFAULT_SUPABASE_CLI_PREFIX, ...args]
    : [...args];
  let result: SupabaseProcessResult;
  try {
    const processOptions: SupabaseProcessOptions = {};
    if (options.cwd !== undefined) processOptions.cwd = options.cwd;
    if (options.env !== undefined) processOptions.env = options.env;
    if (options.stdin !== undefined) processOptions.stdin = options.stdin;
    if (options.timeoutMs !== undefined) processOptions.timeoutMs = options.timeoutMs;
    result = await runner(command, commandArgs, processOptions);
  } catch {
    throw new Error("Supabase CLI command could not be executed.");
  }
  if (result.exitCode !== 0) {
    const suffix = result.exitCode === null ? "without an exit code" : `with exit code ${result.exitCode}`;
    throw new Error(`Supabase CLI command failed ${suffix}.`);
  }
  return result.stdout;
}
