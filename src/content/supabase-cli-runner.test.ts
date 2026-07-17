import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readLinkedProjectRef } from "./supabase-cli-runner";

describe("Supabase CLI linked project discovery", () => {
  it("reads the project ref created by supabase link without requiring local Docker", () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "vimforge-linked-project-"));
    mkdirSync(resolve(cwd, "supabase", ".temp"), { recursive: true });
    writeFileSync(resolve(cwd, "supabase", ".temp", "project-ref"), "prod-ref\n", "utf8");

    expect(readLinkedProjectRef(cwd)).toBe("prod-ref");
  });
});
