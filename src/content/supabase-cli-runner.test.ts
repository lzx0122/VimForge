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
});
