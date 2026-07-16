import { describe, expect, it, vi } from "vitest";

import { runSupabase } from "../src/content/supabase-cli-runner";
import { exportProductionCatalog } from "./content-export-production";

describe("production catalog export", () => {
  it("rejects output that does not identify the expected linked project or release state", async () => {
    const run = vi.fn(async () => JSON.stringify({ projectRef: "other-project" }));

    await expect(exportProductionCatalog({
      expectedProjectRef: "expected-project",
      expectedRevision: 1,
      expectedHash: "sha256:" + "0".repeat(64),
      runSupabase: run,
      outputDirectory: "/tmp/vimforge-export-test",
    })).rejects.toThrow(/project|release/i);
    expect(run).toHaveBeenCalled();
  });

  it("runs the CLI through the injectable runner without exposing command output", async () => {
    const runner = vi.fn(async (_command: string, args: readonly string[]) => ({
      stdout: args.join(" "),
      stderr: "",
      exitCode: 0,
    }));

    await expect(runSupabase(["status", "--linked"], { runner })).resolves.toContain("status --linked");
    expect(runner).toHaveBeenCalledWith(
      "supabase",
      ["status", "--linked"],
      expect.objectContaining({}),
    );
  });
});
