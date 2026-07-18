# Production Release Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the WebKit feedback-scroll race, reconcile the corrected revision 2 catalog hash through an immutable forward migration, and safely deploy the verified application to Vercel production.

**Architecture:** `PracticePage` will wait one browser animation frame after Vue renders feedback so WebKit's focused CodeMirror caret scroll finishes before the result scroll runs. Production catalog inspection will separate the authoritative release-state hash from the canonical hash calculated from exported rows, allowing a read-only semantic comparison before a guarded hash-only migration. Production deployment will use an archive of the verified commit so unrelated dirty working-tree files cannot enter the Vercel build.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright, Supabase CLI 2.79.0, PostgreSQL migrations, Vercel CLI, Vite.

## Global Constraints

- Preserve editor focus after automatic completion; do not call `focus()` or `blur()`.
- Keep `feedback-scroll-service.ts` synchronous and responsible only for browser API guards, reduced-motion detection, and scroll options.
- Never edit, rerun, repair, reset, or seed the already-applied migration history.
- Preserve catalog revision `2` and its original `published_at` value while changing only the release-state hash.
- Continue only when production catalog data is semantically identical to `content/catalog-v2.json`.
- Stop and plan a revision 3 release if production data differs from the local revision 2 snapshot.
- Production writes require a final explicit user confirmation after all dry-runs and verification pass.
- Leave unrelated modified and untracked working-tree files untouched and exclude them from deployment.

## File Structure

- Modify: `src/features/practice/pages/PracticePage.vue` — coordinate Vue render completion and one animation-frame delay before scrolling.
- Modify: `tests/e2e/scoring-feedback.spec.ts` — retain cross-browser viewport coverage and verify editor focus after automatic completion.
- Modify: `scripts/content-export-production.ts` — expose a read-only production inspection result without weakening the normal strict export path.
- Modify: `scripts/content-export.test.ts` — prove inspection tolerates a stale release-state hash while strict export still rejects it.
- Create: `src/content/catalog-hash-reconciliation.ts` — pure semantic and release-state preflight for hash reconciliation.
- Create: `src/content/catalog-hash-reconciliation.test.ts` — unit coverage for accepted and rejected reconciliation states.
- Create: `scripts/content-inspect-reconciliation.ts` — authenticated, read-only CLI inspection using the linked Supabase project.
- Modify: `package.json` — add the reconciliation inspection script while retaining the pinned Supabase CLI dependency.
- Modify: `package-lock.json` — retain the pinned Supabase CLI dependency already represented in the working tree.
- Restore from `HEAD`: `content/release-manifest.json` — preserve the original applied release evidence.
- Restore from `HEAD`: `supabase/migrations/20260717111721_catalog_release.sql` — preserve immutable applied SQL.
- Modify: `content/catalog-v2.json` — retain revision 2 with corrected hash `sha256:1718189565ac1db67ffc6358ce2e5972b67d82dea70571b13c4c9f212dd1c196`.
- Create via Supabase CLI: the single file matching `supabase/migrations/*_reconcile_catalog_revision_2_hash.sql` — guarded forward migration.
- Create: `scripts/catalog-hash-reconciliation-migration.test.ts` — contract test for the generated forward migration.

---

### Task 1: Stabilize Automatic-Completion Scrolling in WebKit

**Files:**
- Modify: `src/features/practice/pages/PracticePage.vue:350-407`
- Modify: `tests/e2e/scoring-feedback.spec.ts:211-290`

**Interfaces:**
- Consumes: Vue `nextTick(): Promise<void>` and browser `requestAnimationFrame(callback)`.
- Produces: page-local `waitForNextAnimationFrame(): Promise<void>`; unchanged `scrollFeedbackIntoView(anchor: HTMLElement | null): void` call contract.

- [ ] **Step 1: Reproduce the current WebKit race before editing**

Run:

```bash
npx playwright test tests/e2e/scoring-feedback.spec.ts \
  --project=webkit \
  --grep "automatically completes" \
  --repeat-each=6 \
  --workers=1
```

Expected: at least one run fails at `toBeInViewport()` because WebKit scrolls back to the focused editor after the result initially enters the viewport.

- [ ] **Step 2: Strengthen the existing E2E assertion for the focus invariant**

Add this immediately after the viewport assertion in the automatic-completion test:

```ts
await expect(editor).toBeFocused();
```

The relevant block becomes:

```ts
await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
await expect(page.locator("#exercise-feedback-title")).toBeInViewport({
  ratio: 0.5,
  timeout: 10_000,
});
await expect(editor).toBeFocused();
```

- [ ] **Step 3: Add the minimal animation-frame coordination**

Add a page-local helper near the other small utility functions in `PracticePage.vue`:

```ts
function waitForNextAnimationFrame(): Promise<void> {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
```

Then change the successful outcome tail to:

```ts
feedback.value = outcome.feedback;
unmetMessages.value = [];
await nextTick();
await waitForNextAnimationFrame();
scrollFeedbackIntoView(feedbackAnchor.value);
```

Do not change `feedback-scroll-service.ts` and do not alter focus.

- [ ] **Step 4: Verify the WebKit race is gone repeatedly**

Run:

```bash
npx playwright test tests/e2e/scoring-feedback.spec.ts \
  --project=webkit \
  --grep "automatically completes" \
  --repeat-each=10 \
  --workers=1
```

Expected: `10 passed`; the title reaches at least 50% viewport intersection and `.cm-content` remains focused every time.

- [ ] **Step 5: Verify both scoring-feedback flows in all browsers**

Run:

```bash
npx playwright test tests/e2e/scoring-feedback.spec.ts
```

Expected: all completion, movement, restart, hint, and skip cases pass in Chromium, Firefox, and WebKit.

- [ ] **Step 6: Commit the WebKit fix**

```bash
git add \
  src/features/practice/pages/PracticePage.vue \
  src/features/practice/services/feedback-scroll-service.ts \
  src/features/practice/services/feedback-scroll-service.test.ts \
  tests/e2e/scoring-feedback.spec.ts
git commit -m "fix: stabilize practice feedback scrolling" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

This commit intentionally includes the previously reviewed task 1-3 source and tests because they are still uncommitted and are required for the production feature.

---

### Task 2: Add Read-Only Production Catalog Inspection

**Files:**
- Modify: `scripts/content-export-production.ts`
- Modify: `scripts/content-export.test.ts`
- Create: `src/content/catalog-hash-reconciliation.ts`
- Create: `src/content/catalog-hash-reconciliation.test.ts`
- Create: `scripts/content-inspect-reconciliation.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `inspectProductionCatalog(options: ProductionExportOptions): Promise<ProductionCatalogInspectionResult>`.
- Produces: `assertCatalogHashReconciliation(input: CatalogHashReconciliationInput): void`.
- CLI: `npm run content:inspect-reconciliation -- "$PROJECT_REF" content/catalog-v2.json "$EXPECTED_STATE_HASH"`.

- [ ] **Step 1: Write failing inspection tests**

In `scripts/content-export.test.ts`, import `inspectProductionCatalog` and add a test proving the inspection path computes the canonical snapshot even when release state still carries the old hash:

```ts
it("inspects canonical production data without accepting a stale release hash as a valid export", async () => {
  const target = JSON.parse(
    readFileSync(resolve(process.cwd(), "content/catalog-v2.json"), "utf8"),
  ) as CatalogSnapshot;
  const staleHash = "sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467";
  const run = vi.fn(async (args: readonly string[]) => args.includes("--help")
    ? "Usage: supabase db query [flags]\n  --linked\n  --output string"
    : JSON.stringify({
        projectRef: "expected-project",
        releaseState: { revision: 2, catalog_hash: staleHash },
        snapshot: { schemaVersion: 1, units: target.units },
      }));

  const inspection = await inspectProductionCatalog({
    expectedProjectRef: "expected-project",
    linkedProjectRef: "expected-project",
    runSupabase: run,
  });

  expect(inspection.releaseState).toEqual({ revision: 2, hash: staleHash });
  expect(inspection.snapshot.catalogHash).toBe(target.catalogHash);
  await expect(exportProductionCatalog({
    expectedProjectRef: "expected-project",
    linkedProjectRef: "expected-project",
    expectedRevision: 2,
    expectedHash: target.catalogHash,
    runSupabase: run,
  })).rejects.toThrow(/release hash/i);
});
```

- [ ] **Step 2: Run the export test and confirm failure**

Run:

```bash
npx vitest run scripts/content-export.test.ts
```

Expected: FAIL because `inspectProductionCatalog` and `ProductionCatalogInspectionResult` do not exist.

- [ ] **Step 3: Refactor production parsing into strict export plus inspection**

In `scripts/content-export-production.ts`, add:

```ts
export interface ProductionCatalogInspectionResult {
  snapshot: CatalogSnapshot;
  releaseState: {
    revision: number;
    hash: string;
  };
  projectRef: string;
  exerciseCount: number;
}
```

Change the snapshot builder to accept a known revision and compute the canonical hash without comparing it to release state:

```ts
function productionSnapshot(
  payload: JsonRecord,
  revision: number,
  now: () => Date,
): CatalogSnapshot {
  const rawSnapshot = payload.snapshot ?? payload.catalog;
  const snapshot = isRecord(rawSnapshot) ? rawSnapshot : payload;
  const units = snapshot.units;
  if (!Array.isArray(units)) {
    throw new Error("Production output did not include catalog units and relations.");
  }
  const candidate = {
    schemaVersion: 1 as const,
    catalogRevision: revision,
    catalogHash: "sha256:" + "0".repeat(64),
    exportedAt: now().toISOString(),
    units,
  };
  const parsed = parseCatalogSnapshot(candidate);
  const ordered = {
    ...parsed,
    units: [...parsed.units].sort((left, right) => left.displayOrder - right.displayOrder),
  } satisfies CatalogSnapshot;
  const withHash = { ...ordered, catalogHash: hashCatalog(ordered) };
  const errors = validateCatalogSnapshot(withHash);
  if (errors.length > 0) {
    throw new Error(
      `Production catalog is invalid: ${errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }
  return withHash;
}
```

Extract the authenticated query/link logic into:

```ts
export async function inspectProductionCatalog(
  options: ProductionExportOptions = {},
): Promise<ProductionCatalogInspectionResult> {
  const expectedProjectRef = options.expectedProjectRef ?? process.env.SUPABASE_PROJECT_REF;
  if (typeof expectedProjectRef !== "string" || expectedProjectRef.trim().length === 0) {
    throw new Error("Expected production project ref is required before querying.");
  }
  const invoke = options.runSupabase ?? options.run ?? defaultRunSupabase;
  const linkedProjectRef = options.linkedProjectRef ?? readLinkedProjectRef(options.cliOptions?.cwd);
  if (linkedProjectRef === undefined || linkedProjectRef !== expectedProjectRef) {
    throw new Error("Production linked project does not match the expected project.");
  }
  const capabilityOutput = await invoke(["db", "query", "--help"], options.cliOptions);
  assertDbQueryCapability(capabilityOutput);
  const raw = await invoke(
    ["db", "query", "--linked", "--output", "json", PRODUCTION_EXPORT_QUERY],
    options.cliOptions,
  );
  const parsedOutput = parseJsonOutput(raw);
  const observedProjectRef = projectRefFromPayload(parsedOutput);
  if (observedProjectRef !== undefined && observedProjectRef !== expectedProjectRef) {
    throw new Error("Production linked project does not match the expected project.");
  }
  const payload = unwrapPayload(parsedOutput);
  const releaseState = parseReleaseState(payload.releaseState ?? payload.release_state);
  const snapshot = productionSnapshot(
    payload,
    releaseState.revision,
    options.now ?? (() => new Date()),
  );
  return {
    snapshot,
    releaseState,
    projectRef: linkedProjectRef,
    exerciseCount: snapshot.units.reduce(
      (count, unit) => count + unit.exercises.length,
      0,
    ),
  };
}
```

Then make `exportProductionCatalog()` call `inspectProductionCatalog()`, enforce `releaseState.hash === snapshot.catalogHash`, enforce repository expected revision/hash, and only then write the export file. Preserve all existing strict-export errors.

- [ ] **Step 4: Run export tests**

```bash
npx vitest run scripts/content-export.test.ts
```

Expected: PASS, including the new stale-state inspection test and all existing strict export protections.

- [ ] **Step 5: Write failing pure reconciliation tests**

Create `src/content/catalog-hash-reconciliation.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { CatalogSnapshot } from "./catalog-contract";
import { assertCatalogHashReconciliation } from "./catalog-hash-reconciliation";

const OLD_HASH = "sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467";

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
```

- [ ] **Step 6: Run the reconciliation test and confirm failure**

```bash
npx vitest run src/content/catalog-hash-reconciliation.test.ts
```

Expected: FAIL because `assertCatalogHashReconciliation` does not exist.

- [ ] **Step 7: Implement the pure reconciliation guard**

Create `src/content/catalog-hash-reconciliation.ts`:

```ts
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
```

- [ ] **Step 8: Run the pure tests**

```bash
npx vitest run \
  src/content/catalog-hash-reconciliation.test.ts \
  scripts/content-export.test.ts
```

Expected: PASS.

- [ ] **Step 9: Add the read-only reconciliation CLI**

Create `scripts/content-inspect-reconciliation.ts`:

```ts
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
```

Add this script to `package.json`:

```json
"content:inspect-reconciliation": "vite-node --script scripts/content-inspect-reconciliation.ts"
```

- [ ] **Step 10: Verify the new CLI through mocked tests and type-check**

Run:

```bash
npx vitest run \
  src/content/catalog-hash-reconciliation.test.ts \
  scripts/content-export.test.ts
npm run type-check
```

Expected: all tests PASS and type-check exits 0.

- [ ] **Step 11: Commit the inspection tooling**

```bash
git add \
  scripts/content-export-production.ts \
  scripts/content-export.test.ts \
  scripts/content-inspect-reconciliation.ts \
  src/content/catalog-hash-reconciliation.ts \
  src/content/catalog-hash-reconciliation.test.ts \
  package.json \
  package-lock.json
git commit -m "feat: verify production catalog reconciliation" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Restore Historical Evidence and Prepare the Forward Migration

**Files:**
- Restore: `content/release-manifest.json`
- Restore: `supabase/migrations/20260717111721_catalog_release.sql`
- Modify: `content/catalog-v2.json`
- Create via CLI: `supabase/migrations/*_reconcile_catalog_revision_2_hash.sql`
- Create: `scripts/catalog-hash-reconciliation-migration.test.ts`

**Interfaces:**
- Consumes: corrected target hash `sha256:1718189565ac1db67ffc6358ce2e5972b67d82dea70571b13c4c9f212dd1c196`.
- Consumes: original applied hash `sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467`.
- Produces: one pending migration whose filename ends with `_reconcile_catalog_revision_2_hash.sql`.

- [ ] **Step 1: Confirm the only historical-artifact edits are the known hash mutations**

Run:

```bash
git diff -- \
  content/release-manifest.json \
  supabase/migrations/20260717111721_catalog_release.sql
```

Expected: only `targetHash`, `migrationHash`, and the applied migration's final catalog hash differ. Stop if any catalog-row SQL or count differs.

- [ ] **Step 2: Restore immutable applied evidence**

```bash
git restore --source=HEAD -- \
  content/release-manifest.json \
  supabase/migrations/20260717111721_catalog_release.sql
```

Run:

```bash
git diff --exit-code -- \
  content/release-manifest.json \
  supabase/migrations/20260717111721_catalog_release.sql
```

Expected: exit 0; both files match the committed evidence.

- [ ] **Step 3: Read the linked project ref without printing credentials**

```bash
PROJECT_REF="$(tr -d '\n' < supabase/.temp/project-ref)"
test -n "$PROJECT_REF"
printf 'Linked Supabase project ref: %s\n' "$PROJECT_REF"
```

Expected: the intended production project ref from the existing Supabase link.

- [ ] **Step 4: Run the read-only production semantic comparison**

```bash
PROJECT_REF="$(tr -d '\n' < supabase/.temp/project-ref)"
OLD_HASH="sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467"
npm run content:inspect-reconciliation -- \
  "$PROJECT_REF" \
  content/catalog-v2.json \
  "$OLD_HASH"
```

Expected: `Verified reconciliation target` with revision `2`, the old current hash, the corrected target hash, and `100` exercises. If it fails, stop and create a revision 3 plan; do not create or apply a reconciliation migration.

- [ ] **Step 5: Generate the migration file with the pinned CLI**

```bash
npm run supabase:cli -- migration new reconcile_catalog_revision_2_hash
MIGRATION_PATH="$(find supabase/migrations -maxdepth 1 -type f \
  -name '*_reconcile_catalog_revision_2_hash.sql' \
  -print | sort | tail -n 1)"
test -n "$MIGRATION_PATH"
printf 'Generated migration: %s\n' "$MIGRATION_PATH"
```

Expected: exactly one newly generated migration path ending in `_reconcile_catalog_revision_2_hash.sql`.

- [ ] **Step 6: Write a failing migration contract test**

Create `scripts/catalog-hash-reconciliation-migration.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const directory = resolve(process.cwd(), "supabase/migrations");
  const names = readdirSync(directory).filter((name) =>
    name.endsWith("_reconcile_catalog_revision_2_hash.sql"),
  );
  expect(names).toHaveLength(1);
  return readFileSync(resolve(directory, names[0]!), "utf8");
}

describe("catalog hash reconciliation migration", () => {
  it("guards the old revision 2 hash and updates only catalog_hash", () => {
    const sql = migrationSql();
    expect(sql).toContain("revision = 2");
    expect(sql).toContain(
      "sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467",
    );
    expect(sql).toContain(
      "sha256:1718189565ac1db67ffc6358ce2e5972b67d82dea70571b13c4c9f212dd1c196",
    );
    expect(sql).toContain("get diagnostics updated_rows = row_count");
    expect(sql).toContain("if updated_rows <> 1 then");
    expect(sql).not.toMatch(/published_at\s*=/u);
    expect(sql).not.toMatch(/public\.(learning_units|skills|exercises|exercise_)/u);
  });
});
```

- [ ] **Step 7: Run the migration contract test and confirm failure**

```bash
npx vitest run scripts/catalog-hash-reconciliation-migration.test.ts
```

Expected: FAIL because the CLI-created migration is empty.

- [ ] **Step 8: Write the guarded forward migration**

Recompute the generated path and write the exact SQL in one shell invocation:

```bash
MIGRATION_PATH="$(find supabase/migrations -maxdepth 1 -type f \
  -name '*_reconcile_catalog_revision_2_hash.sql' \
  -print | sort | tail -n 1)"
test -n "$MIGRATION_PATH"
MIGRATION_PATH="$MIGRATION_PATH" node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";

const sql = `begin;

do $$
declare
  updated_rows integer;
begin
  update private.catalog_release_state
  set catalog_hash = 'sha256:1718189565ac1db67ffc6358ce2e5972b67d82dea70571b13c4c9f212dd1c196'
  where singleton = true
    and revision = 2
    and catalog_hash = 'sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467';

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'Catalog release state did not match revision 2 with the expected previous hash.';
  end if;
end
$$;

commit;
`;

writeFileSync(process.env.MIGRATION_PATH, sql, "utf8");
NODE
```

This intentionally does not assign `revision` or `published_at`.

- [ ] **Step 9: Run the migration contract and catalog tests**

```bash
npx vitest run \
  scripts/catalog-hash-reconciliation-migration.test.ts \
  src/content/catalog-hash-reconciliation.test.ts \
  scripts/content-export.test.ts
```

Expected: PASS.

- [ ] **Step 10: Confirm the linked remote sees exactly one pending migration**

```bash
npm run supabase:cli -- migration list --linked
npm run supabase:cli -- db push --linked --dry-run
```

Expected: the remote history includes `20260717111721`; dry-run lists exactly the new `_reconcile_catalog_revision_2_hash.sql` migration and no other migration.

- [ ] **Step 11: Commit the corrected snapshot and forward migration**

```bash
MIGRATION_PATH="$(find supabase/migrations -maxdepth 1 -type f \
  -name '*_reconcile_catalog_revision_2_hash.sql' \
  -print | sort | tail -n 1)"
test -n "$MIGRATION_PATH"
git add \
  content/catalog-v2.json \
  scripts/catalog-hash-reconciliation-migration.test.ts \
  "$MIGRATION_PATH"
git commit -m "fix: reconcile catalog release hash" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

Do not add `content/release-manifest.json` or the applied migration; after restoration they should have no diff.

---

### Task 4: Install Vercel CLI and Complete Read-Only Preflight

**Files:**
- Read: `.vercel/project.json`
- Read: `vercel.json`
- No repository file changes.

**Interfaces:**
- Produces: authenticated global `vercel` command and a recorded production-preflight summary.

- [ ] **Step 1: Install the user-approved global Vercel CLI**

```bash
npm install --global vercel@latest
vercel --version
```

Expected: installation succeeds and `vercel --version` prints the installed version.

- [ ] **Step 2: Confirm authentication and linked project**

```bash
vercel whoami
node -e '
const project = require("./.vercel/project.json");
if (project.projectName !== "vimforge") process.exit(1);
console.log(JSON.stringify({ projectName: project.projectName, projectId: project.projectId, orgId: project.orgId }));
'
vercel project ls
```

Expected: authenticated account is printed, `.vercel/project.json` names `vimforge`, and the project appears in the account/team project list.

- [ ] **Step 3: Inspect production environment-variable names**

```bash
vercel env ls production
```

Expected: both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` exist for Production. Stop if either is missing.

Inspect the output and stop if any of these names exist:

```text
VITE_SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_SECRET_KEY
VITE_GOOGLE_CLIENT_SECRET
```

Do not print or retrieve environment-variable values.

- [ ] **Step 4: Inspect observability capabilities before production**

```bash
vercel --help
```

If the help output lists a drains command, run its read-only list operation shown by `vercel drains --help`. Also run the read-only integration list operation shown by `vercel integration --help` or `vercel integrations --help`, whichever exists.

Record one of these outcomes:

- at least one healthy drain;
- an active error-tracking integration;
- no monitoring integration, requiring an explicit warning acknowledgment before deployment.

Do not create, delete, or modify drains or integrations during preflight.

- [ ] **Step 5: Record current deployment target and domains**

Run the project-inspection command shown by `vercel project --help`, then:

```bash
vercel ls
```

Expected: the linked `vimforge` project and recent deployment aliases/domains are visible. Record the production domain for final smoke tests.

---

### Task 5: Run the Full Release Verification and Present the Production Gate

**Files:**
- No new source changes expected.
- Read: `docs/superpowers/specs/2026-07-18-production-release-reconciliation-design.md`
- Read: `docs/deployment.md`

**Interfaces:**
- Produces: a complete release summary and explicit user confirmation request.

- [ ] **Step 1: Run static and unit verification**

```bash
npm run type-check
npm run lint
npm test
npm run build
```

Expected: all commands exit 0. The Vite chunk-size warning is informational; any build error is a blocker.

- [ ] **Step 2: Run the complete browser suite**

```bash
npm run test:e2e
```

Expected: all 54 Playwright cases pass across Chromium, Firefox, and WebKit.

- [ ] **Step 3: Repeat the previously flaky WebKit path after the full suite**

```bash
npx playwright test tests/e2e/scoring-feedback.spec.ts \
  --project=webkit \
  --grep "automatically completes" \
  --repeat-each=10 \
  --workers=1
```

Expected: `10 passed`.

- [ ] **Step 4: Re-run production catalog and migration preflight**

```bash
PROJECT_REF="$(tr -d '\n' < supabase/.temp/project-ref)"
OLD_HASH="sha256:a1ea1b9f32fc9b3ed6ef25b8989c7f5c465ad10df10df6af62e2cb2d4aa96467"
npm run content:validate -- content/catalog-v2.json
npm run content:inspect-reconciliation -- \
  "$PROJECT_REF" \
  content/catalog-v2.json \
  "$OLD_HASH"
npm run supabase:cli -- migration list --linked
npm run supabase:cli -- db push --linked --dry-run
```

Expected: snapshot validation succeeds, semantic inspection succeeds, and exactly one reconciliation migration is pending.

- [ ] **Step 5: Confirm only committed code will be deployed**

```bash
git status --short
git log -4 --oneline
git diff --exit-code -- \
  src/features/practice/pages/PracticePage.vue \
  src/features/practice/services/feedback-scroll-service.ts \
  src/features/practice/services/feedback-scroll-service.test.ts \
  tests/e2e/scoring-feedback.spec.ts \
  scripts/content-export-production.ts \
  scripts/content-export.test.ts \
  scripts/content-inspect-reconciliation.ts \
  src/content/catalog-hash-reconciliation.ts \
  src/content/catalog-hash-reconciliation.test.ts \
  scripts/catalog-hash-reconciliation-migration.test.ts \
  content/catalog-v2.json \
  package.json \
  package-lock.json \
  supabase/migrations
```

Expected: unrelated working-tree files may remain, but every intended release file has no uncommitted diff because it is included in the reviewed commits.

- [ ] **Step 6: Present the mandatory final production confirmation**

Present one summary containing:

```text
Supabase project: linked project ref from supabase/.temp/project-ref
Current release state: revision 2, old hash
Pending DB write: exactly one guarded hash-only reconciliation migration
Target release state: revision 2, corrected hash
Vercel project: vimforge
Production env: required variables present, forbidden variables absent
Observability: drains/integration status and any warning
Verification: type-check, lint, 355+ Vitest tests, build, 54 Playwright tests, repeated WebKit test
Deployment source: exact git commit SHA from git rev-parse --short HEAD
Unrelated dirty files: excluded by git archive deployment
```

Use `AskUserQuestion` with one explicit option that authorizes both writes and one option that stops. Do not run `db push` or `vercel --prod` before the user authorizes them.

---

### Task 6: Apply the Guarded Migration and Deploy the Verified Commit

**Files:**
- No source changes.
- External writes: linked Supabase production project and linked Vercel production project.

**Interfaces:**
- Consumes: explicit user approval from Task 5.
- Produces: verified revision 2 corrected release state and a READY Vercel production deployment URL.

- [ ] **Step 1: Apply the single approved Supabase migration**

```bash
npm run supabase:cli -- db push --linked
```

Expected: exactly the reconciliation migration is applied. Any guard exception or extra migration is a blocker; do not continue to Vercel.

- [ ] **Step 2: Verify production data and corrected release state**

```bash
PROJECT_REF="$(tr -d '\n' < supabase/.temp/project-ref)"
NEW_HASH="sha256:1718189565ac1db67ffc6358ce2e5972b67d82dea70571b13c4c9f212dd1c196"
npm run content:inspect-reconciliation -- \
  "$PROJECT_REF" \
  content/catalog-v2.json \
  "$NEW_HASH"
npm run supabase:cli -- migration list --linked
npm run supabase:cli -- db push --linked --dry-run
```

Expected: semantic inspection succeeds with revision 2 and the corrected hash; migration list includes the reconciliation migration; dry-run reports the remote database is up to date.

- [ ] **Step 3: Build a clean deployment directory from the verified commit**

```bash
DEPLOY_COMMIT="$(git rev-parse HEAD)"
DEPLOY_DIR="$(mktemp -d)"
git archive "$DEPLOY_COMMIT" | tar -x -C "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/.vercel"
cp .vercel/project.json "$DEPLOY_DIR/.vercel/project.json"
printf '%s' "$DEPLOY_DIR" > /tmp/vimforge-deploy-dir
printf '%s' "$DEPLOY_COMMIT" > /tmp/vimforge-deploy-commit
printf 'Prepared commit %s in %s\n' "$DEPLOY_COMMIT" "$DEPLOY_DIR"
```

Expected: the deployment directory contains only committed files plus the Vercel link. Unrelated dirty working-tree files are absent.

- [ ] **Step 4: Deploy the clean archive to Vercel production**

```bash
set -o pipefail
DEPLOY_DIR="$(tr -d '\n' < /tmp/vimforge-deploy-dir)"
test -d "$DEPLOY_DIR"
vercel --prod --cwd "$DEPLOY_DIR" 2>&1 | tee /tmp/vimforge-vercel-deploy.log
DEPLOYMENT_URL="$(grep -Eo 'https://[^[:space:]]+\.vercel\.app' /tmp/vimforge-vercel-deploy.log | tail -n 1)"
test -n "$DEPLOYMENT_URL"
printf '%s' "$DEPLOYMENT_URL" > /tmp/vimforge-deployment-url
printf 'Deployment URL: %s\n' "$DEPLOYMENT_URL"
```

If the command fails or no deployment URL is captured, inspect the build output and stop; do not blindly retry.

- [ ] **Step 5: Inspect the deployment**

Read the URL captured by the deployment step and inspect it:

```bash
DEPLOYMENT_URL="$(tr -d '\n' < /tmp/vimforge-deployment-url)"
test -n "$DEPLOYMENT_URL"
vercel inspect "$DEPLOYMENT_URL"
```

Expected: deployment state `READY`.

- [ ] **Step 6: Smoke-test production SPA routes**

```bash
DEPLOYMENT_URL="$(tr -d '\n' < /tmp/vimforge-deployment-url)"
test -n "$DEPLOYMENT_URL"
for route in \
  / \
  /courses/text-objects \
  '/practice/setup?mode=memory_review' \
  /auth/callback
do
  curl -fsS -o /dev/null -w "%{http_code} ${route}\n" "${DEPLOYMENT_URL}${route}"
done
```

Expected: every route returns HTTP 200 and serves the SPA rather than a 404.

- [ ] **Step 7: Drive production practice behavior in a browser**

Use the browser-run workflow against `DEPLOYMENT_URL` without request mocks:

1. Open `/practice/setup?mode=memory_review` as a guest.
2. Start a practice session.
3. Complete one exercise and confirm the result heading is fully visible, editor content remains, and editor focus is retained.
4. Start another guest session, skip an exercise, and confirm `尚未完成` enters the viewport.
5. Navigate with the feedback action and confirm the next-question/result route works.

Do not authenticate or write privileged production data. Guest attempts remain local until a user signs in.

- [ ] **Step 8: Scan early production errors**

After the deployment has been READY for at least 60 seconds, run:

```bash
DEPLOYMENT_URL="$(tr -d '\n' < /tmp/vimforge-deployment-url)"
test -n "$DEPLOYMENT_URL"
vercel logs "$DEPLOYMENT_URL" --level error --since 1h
```

Expected: no runtime errors or HTTP 500 responses. If errors appear, report the first five unique messages and investigate before declaring success.

- [ ] **Step 9: Report the deployment result**

Report:

```text
URL
Target: production
Status: READY
Commit SHA
Framework: Vite
Build duration
Supabase revision/hash verification
Playwright and runtime smoke results
Post-deploy error scan
Drains/monitoring status
```

Do not claim success if any migration verification, route smoke test, browser flow, or error scan failed.
