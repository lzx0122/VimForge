import { canonicalizeCatalog } from "./catalog-canonicalizer";
import { hashCatalog, validateCatalogSnapshot } from "./catalog-contract";
import type { CatalogSnapshot } from "./catalog-types";

export interface CatalogHashReconciliationInput {
  productionSnapshot: CatalogSnapshot;
  targetSnapshot: CatalogSnapshot;
  productionReleaseState: {
    revision: number;
    hash: string;
  };
  expectedCurrentHash: string;
}

export function assertCatalogHashReconciliation(
  input: CatalogHashReconciliationInput,
): void {
  const { productionSnapshot, targetSnapshot, productionReleaseState } = input;
  if (productionReleaseState.revision !== targetSnapshot.catalogRevision) {
    throw new Error("Production catalog revision does not match the reconciliation target.");
  }
  if (productionReleaseState.hash !== input.expectedCurrentHash) {
    throw new Error("Production release state hash is not the expected stale hash.");
  }
  const targetErrors = validateCatalogSnapshot(targetSnapshot);
  if (targetErrors.length > 0 || hashCatalog(targetSnapshot) !== targetSnapshot.catalogHash) {
    throw new Error("Target catalog snapshot is invalid or has a stale hash.");
  }
  if (productionSnapshot.catalogHash !== targetSnapshot.catalogHash) {
    throw new Error("Production canonical catalog hash does not match the target hash.");
  }
  if (canonicalizeCatalog(productionSnapshot) !== canonicalizeCatalog(targetSnapshot)) {
    throw new Error("Production semantic data does not match the target snapshot.");
  }
}
