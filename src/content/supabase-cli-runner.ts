import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";

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
  const command = options.command ?? "supabase";
  const runner = options.runner ?? spawnSupabase;
  let result: SupabaseProcessResult;
  try {
    const processOptions: SupabaseProcessOptions = {};
    if (options.cwd !== undefined) processOptions.cwd = options.cwd;
    if (options.env !== undefined) processOptions.env = options.env;
    if (options.stdin !== undefined) processOptions.stdin = options.stdin;
    if (options.timeoutMs !== undefined) processOptions.timeoutMs = options.timeoutMs;
    result = await runner(command, args, processOptions);
  } catch {
    throw new Error("Supabase CLI command could not be executed.");
  }
  if (result.exitCode !== 0) {
    const suffix = result.exitCode === null ? "without an exit code" : `with exit code ${result.exitCode}`;
    throw new Error(`Supabase CLI command failed ${suffix}.`);
  }
  return result.stdout;
}
