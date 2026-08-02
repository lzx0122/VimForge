import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readLinkedProjectRef, runSupabase } from "./supabase-cli-runner";

describe("Supabase CLI linked project discovery", () => {
  it("reads the project ref created by supabase link without requiring local Docker", () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "vimforge-linked-project-"));
    mkdirSync(resolve(cwd, "supabase", ".temp"), { recursive: true });
    writeFileSync(resolve(cwd, "supabase", ".temp", "project-ref"), "prod-ref\n", "utf8");

    expect(readLinkedProjectRef(cwd)).toBe("prod-ref");
  });

  it("uses successful CLI stderr when informational output is not written to stdout", async () => {
    await expect(runSupabase(["db", "push", "--linked", "--dry-run"], {
      runner: async () => ({
        stdout: "",
        stderr: "Would push these migrations:\n • 20260717111721_catalog_release.sql",
        exitCode: 0,
      }),
    })).resolves.toContain("20260717111721_catalog_release.sql");
  });

  it("preserves successful output split across stdout and stderr", async () => {
    await expect(runSupabase(["db", "push", "--linked", "--dry-run"], {
      runner: async () => ({
        stdout: "DRY RUN: migrations will *not* be pushed to the database.",
        stderr: "Would push these migrations:\n • 20260717111721_catalog_release.sql",
        exitCode: 0,
      }),
    })).resolves.toContain("20260717111721_catalog_release.sql");
  });

  it("preserves a plain ASCII round trip through the real child process path", async () => {
    const script = "process.stdout.write('hello-world');";

    const output = await runSupabase(["-e", script], { command: process.execPath });

    expect(output).toBe("hello-world");
  });

  it("preserves a CJK character whose UTF-8 bytes are split across stdout chunks", async () => {
    // 還 (U+9084) is UTF-8 bytes E9 82 84. Splitting the write after the first
    // byte forces Node to deliver it across two separate 'data' events, which
    // is exactly what happens over a real OS pipe / child process stdout.
    const script = [
      "const part1 = Buffer.concat([Buffer.from('prefix-', 'utf8'), Buffer.from([0xE9])]);",
      "const part2 = Buffer.concat([Buffer.from([0x82, 0x84]), Buffer.from('-suffix', 'utf8')]);",
      "process.stdout.write(part1, () => { setTimeout(() => { process.stdout.write(part2); }, 20); });",
    ].join("\n");

    const output = await runSupabase(["-e", script], { command: process.execPath });

    expect(output).toBe("prefix-還-suffix");
    expect(output).not.toContain("�");
  });

  it("preserves a CJK character whose UTF-8 bytes are split across stderr chunks", async () => {
    const script = [
      "const part1 = Buffer.concat([Buffer.from('prefix-', 'utf8'), Buffer.from([0xE9])]);",
      "const part2 = Buffer.concat([Buffer.from([0x82, 0x84]), Buffer.from('-suffix', 'utf8')]);",
      "process.stderr.write(part1, () => { setTimeout(() => { process.stderr.write(part2); }, 20); });",
    ].join("\n");

    const output = await runSupabase(["-e", script], { command: process.execPath });

    expect(output).toBe("prefix-還-suffix");
    expect(output).not.toContain("�");
  });
});
