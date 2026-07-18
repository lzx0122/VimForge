import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertCatalogHashReconciliation } from "../src/content/catalog-hash-reconciliation";
import { parseCatalogSnapshot } from "../src/content/catalog-contract";
import { inspectProductionCatalog } from "./content-export-production";

async function runCli(): Promise<void> {
  const [projectRef, targetPath, expectedCurrentHash] = process.argv.slice(2);
  if (!projectRef || !targetPath || !expectedCurrentHash) {
    throw new Error(
      "Usage: npm run content:inspect-reconciliation -- <project-ref> <target.json> <expected-state-hash>",
    );
  }
  const targetSnapshot = parseCatalogSnapshot(
    JSON.parse(readFileSync(resolve(targetPath), "utf8")) as unknown,
  );
  const inspection = await inspectProductionCatalog({ expectedProjectRef: projectRef });
  assertCatalogHashReconciliation({
    productionSnapshot: inspection.snapshot,
    targetSnapshot,
    productionReleaseState: inspection.releaseState,
    expectedCurrentHash,
  });
  console.log(
    `Verified reconciliation target project=${inspection.projectRef} revision=${inspection.releaseState.revision} current=${inspection.releaseState.hash} target=${targetSnapshot.catalogHash} exercises=${inspection.exerciseCount}`,
  );
}

void runCli().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Production reconciliation inspection failed.");
  process.exitCode = 1;
});
