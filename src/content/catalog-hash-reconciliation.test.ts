import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { CatalogSnapshot } from "./catalog-contract";
import { assertCatalogHashReconciliation } from "./catalog-hash-reconciliation";

const OLD_HASH =
  "sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467";

function target(): CatalogSnapshot {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "content/catalog-v2.json"), "utf8"),
  ) as CatalogSnapshot;
}

describe("catalog hash reconciliation", () => {
  it("accepts identical revision 2 data with the expected stale state hash", () => {
    const snapshot = target();

    expect(() => assertCatalogHashReconciliation({
      productionSnapshot: snapshot,
      targetSnapshot: snapshot,
      productionReleaseState: { revision: 2, hash: OLD_HASH },
      expectedCurrentHash: OLD_HASH,
    })).not.toThrow();
  });

  it("rejects changed production data", () => {
    const snapshot = target();
    const changed = {
      ...snapshot,
      units: snapshot.units.slice(1),
    };

    expect(() => assertCatalogHashReconciliation({
      productionSnapshot: changed,
      targetSnapshot: snapshot,
      productionReleaseState: { revision: 2, hash: OLD_HASH },
      expectedCurrentHash: OLD_HASH,
    })).toThrow(/semantic data/i);
  });

  it("rejects an unexpected revision or current state hash", () => {
    const snapshot = target();

    expect(() => assertCatalogHashReconciliation({
      productionSnapshot: snapshot,
      targetSnapshot: snapshot,
      productionReleaseState: { revision: 3, hash: OLD_HASH },
      expectedCurrentHash: OLD_HASH,
    })).toThrow(/revision/i);
    expect(() => assertCatalogHashReconciliation({
      productionSnapshot: snapshot,
      targetSnapshot: snapshot,
      productionReleaseState: { revision: 2, hash: snapshot.catalogHash },
      expectedCurrentHash: OLD_HASH,
    })).toThrow(/release state hash/i);
  });
});
