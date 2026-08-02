import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalizeCatalog } from "../src/content/catalog-canonicalizer";
import { parseCatalogSnapshot } from "../src/content/catalog-contract";

/**
 * content/catalog.json is the diff base every release tool reads by default
 * (content:prepare-release, content:publish:production's preflight). It must
 * always equal the current checked-in canonical production baseline —
 * content/catalog-v2.json today — or release tooling silently diffs against
 * stale data. See docs/content-release-checklist.md.
 */
describe("canonical baseline pointer", () => {
  it("content/catalog.json matches the current canonical production baseline (content/catalog-v2.json)", () => {
    const pointer = parseCatalogSnapshot(
      JSON.parse(readFileSync(resolve(process.cwd(), "content/catalog.json"), "utf8")) as unknown,
    );
    const canonical = parseCatalogSnapshot(
      JSON.parse(readFileSync(resolve(process.cwd(), "content/catalog-v2.json"), "utf8")) as unknown,
    );

    expect(pointer.catalogRevision).toBe(canonical.catalogRevision);
    expect(pointer.catalogHash).toBe(canonical.catalogHash);
    expect(canonicalizeCatalog(pointer)).toBe(canonicalizeCatalog(canonical));
  });
});
