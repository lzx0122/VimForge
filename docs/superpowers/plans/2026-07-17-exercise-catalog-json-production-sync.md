# Exercise Catalog JSON Production Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the maintainer export the production VimForge catalog as complete JSON, ask ChatGPT to add or modify exercises, validate and diff the returned snapshot locally, then publish one guarded data migration to production Supabase without deleting historical exercise records.

**Architecture:** A pure TypeScript content module owns the canonical snapshot schema, canonical hashing, validation, semantic diffing, version decisions, and SQL literal generation. Thin CLI scripts call those pure modules, use the authenticated Supabase CLI only for production export/publish, and never use a browser credential or local Supabase instance. Production reconciliation is keyed by stable unit, skill, and exercise slugs; missing exercises become unpublished while their database IDs and historical references remain intact.

**Tech Stack:** TypeScript, Node.js 20.19+, existing Vite/Vitest toolchain, Supabase CLI pinned to the repository's chosen version, PostgreSQL migrations/RLS, `vite-node` scripts.

## Global Constraints

- Do not require or run a local Supabase instance for this workflow.
- Production changes must be shipped as a reviewed migration; never use production `db reset` or `--include-seed`.
- A JSON exercise absent from a later snapshot is reconciled as `is_published = false`, never as a hard delete.
- Existing exercise slugs are immutable; changed exercises preserve their database IDs.
- Exercise version increments when title, instruction, language, exercise type, difficulty, editor content, cursor, completion rule, supported modes, duration, skill relationships/weights, solutions, or hints change; publication-only and ordering changes do not increment it.
- The catalog differ blocks stale base hashes, renamed slugs, duplicate slugs, incomplete snapshots, and affected changes above 25% unless the operator explicitly confirms the large change.
- Never put service-role keys, database passwords, access tokens, or Supabase secrets in JSON, frontend code, logs, fixtures, or committed files.
- The first release must run `npm run type-check`, `npm run lint`, `npm run test`, and `npm run build`; no browser E2E test is required unless a browser preview is added.
- Every implementation Task uses TDD: add a focused failing test, run it, implement the minimum behavior, rerun the focused test, then run the relevant full suite before committing.

---

### Task 1: Canonical catalog contract, validation, and hashing

**Files:**
- Create: `src/content/catalog-types.ts`
- Create: `src/content/catalog-contract.ts`
- Create: `src/content/catalog-canonicalizer.ts`
- Create: `src/content/catalog-contract.test.ts`
- Modify: `src/types/index.ts` only if the shared `NormalizedAction` type is not already exported

**Interfaces:**
- Consumes: existing `SupportedLanguage`, `ExerciseType`, `Difficulty`, `LearningMode`, `VimMode`, `CursorPosition`, `CompletionRule`, `NormalizedAction`, and repository catalog row shapes.
- Produces:
  - `CatalogSnapshot`, `CatalogUnit`, `CatalogSkill`, `CatalogExercise`, `CatalogSolution`, `CatalogHint`.
  - `parseCatalogSnapshot(input: unknown): CatalogSnapshot`.
  - `validateCatalogSnapshot(snapshot: CatalogSnapshot): readonly CatalogValidationError[]`.
  - `canonicalizeCatalog(snapshot: CatalogSnapshot): string`.
  - `hashCatalog(snapshot: CatalogSnapshot): string`.
  - `exerciseVersionChanged(before: CatalogExercise, after: CatalogExercise): boolean`.

- [ ] **Step 1: Write the failing contract tests**

Add tests that use a small inline catalog fixture with one unit, one skill, one exercise, one recommended solution, and four hints. Assert that:

```ts
expect(parseCatalogSnapshot(fixture).schemaVersion).toBe(1);
expect(validateCatalogSnapshot(fixture)).toEqual([]);
expect(hashCatalog(fixture)).toMatch(/^sha256:[0-9a-f]{64}$/);
```

Add failing cases for a duplicate exercise slug, a cursor column beyond the initial line, weights that do not sum to `1`, missing hint level `4`, and a renamed existing slug in a base/next pair. Add a version test proving that `isPublished` and display order do not increment a version while `expectedContent` does.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npx vitest run src/content/catalog-contract.test.ts
```

Expected: FAIL because the catalog contract module and its exported functions do not exist.

- [ ] **Step 3: Implement the canonical types and pure contract**

Define the snapshot shape as:

```ts
export interface CatalogSnapshot {
  schemaVersion: 1;
  catalogRevision: number;
  catalogHash: string;
  exportedAt: string;
  units: CatalogUnit[];
}
```

Use explicit `CatalogExercise[]`; do not carry the old `variants[].count` authoring expansion into the exported format. Reuse existing literal unions and normalized action types. Implement type guards without `any`, return path-aware errors such as `units[0].exercises[2].initialCursor.column`, and canonicalize recursively with sorted object keys while preserving semantic array order. Exclude `catalogHash` and `exportedAt` from the hashed payload.

Implement `exerciseVersionChanged` by comparing exactly the exercise-owned fields listed in Global Constraints, including normalized solutions, hints, and skill links.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
npx vitest run src/content/catalog-contract.test.ts
```

Expected: all contract, validation, canonicalization, and version-decision tests PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/content/catalog-types.ts src/content/catalog-contract.ts src/content/catalog-canonicalizer.ts src/content/catalog-contract.test.ts src/types/index.ts
git commit -m "feat: add exercise catalog json contract"
```

### Task 2: Convert the existing catalog and expose offline validation

**Files:**
- Create: `content/catalog.json`
- Create: `scripts/content-validate.ts`
- Create: `scripts/content-validate.test.ts`
- Modify: `scripts/validate-seed.ts` to reuse the shared catalog contract for expanded exercise checks
- Modify: `scripts/validate-seed.test.ts` to preserve the existing 10-unit/100-exercise assertions
- Modify: `package.json` scripts with `content:validate`
- Modify: `docs/exercise-authoring-guide.md`

**Interfaces:**
- Consumes: `parseCatalogSnapshot`, `validateCatalogSnapshot`, and `hashCatalog` from Task 1; the current `$catalog$` block in `supabase/seed.sql`.
- Produces:
  - `export function validateCatalogFile(path: string): CatalogValidationReport`.
  - `npm run content:validate -- content/catalog.json` with deterministic stdout and nonzero exit on errors.
  - A fully expanded `content/catalog.json` representing the current verified catalog.

- [ ] **Step 1: Write failing conversion and CLI tests**

Add a fixture test that expands one `variants[].count` block into explicit exercises with stable slugs and ordinal substitutions. Add a CLI test that writes a temporary invalid snapshot and asserts `validateCatalogFile` returns path-based errors without modifying the input. Keep the existing seed validator test unchanged for the current 100-exercise baseline.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
npx vitest run scripts/content-validate.test.ts scripts/validate-seed.test.ts
```

Expected: FAIL because the expanded snapshot converter and CLI validator are not implemented.

- [ ] **Step 3: Implement deterministic seed-to-snapshot conversion**

Extract the `$catalog$` JSON from `supabase/seed.sql`, expand each variant count in declared order, and assign the existing slug convention (`<unit-slug>-01`, `<unit-slug>-02`, ...). Copy unit-level skills, solutions, and hints into each explicit exercise. Set `catalogRevision` to `1`, calculate `catalogHash`, and write stable pretty-printed JSON to `content/catalog.json`.

Implement `scripts/content-validate.ts` as a pure file reader plus process wrapper. It must print `Validated <units> units and <exercises> exercises.` on success and print every validation error to stderr with exit code `1` on failure. Do not connect to Supabase.

- [ ] **Step 4: Update the authoring guide**

Document the explicit exercise JSON shape, the ChatGPT prompt requirements (complete JSON, stable slugs, no Markdown fences, no ordinal-only duplicates), and the exact command:

```bash
npm run content:validate -- content/catalog.json
```

State that production export snapshots, not hand-edited SQL, are the starting point for a ChatGPT editing cycle.

- [ ] **Step 5: Run focused tests and the validator**

Run:

```bash
npx vitest run scripts/content-validate.test.ts scripts/validate-seed.test.ts
npm run content:validate -- content/catalog.json
```

Expected: all tests PASS and the validator reports the existing 10 units and 100 exercises.

- [ ] **Step 6: Commit the offline catalog contract**

```bash
git add content/catalog.json scripts/content-validate.ts scripts/content-validate.test.ts scripts/validate-seed.ts scripts/validate-seed.test.ts package.json docs/exercise-authoring-guide.md
git commit -m "feat: add offline exercise catalog validation"
```

### Task 3: Production snapshot export, semantic diff, and release plan

**Files:**
- Create: `src/content/catalog-diff.ts`
- Create: `src/content/catalog-diff.test.ts`
- Create: `src/content/supabase-cli-runner.ts`
- Create: `scripts/content-export-production.ts`
- Create: `scripts/content-diff.ts`
- Create: `scripts/content-export.test.ts`
- Modify: `package.json` scripts with `content:export:production` and `content:diff`

**Interfaces:**
- Consumes: the Task 1 snapshot contract and Task 2 validator; an authenticated production Supabase CLI database query; the repository's last published `catalogRevision` and `catalogHash`.
- Produces:
  - `diffCatalog(base: CatalogSnapshot, next: CatalogSnapshot): CatalogDiff`.
  - `CatalogDiff` with `added`, `changed`, `removed`, `unchanged` arrays and a `largeChange` boolean.
  - `runSupabase(args: readonly string[], options: CliOptions): Promise<string>` with injectable process execution.
  - `content:export:production` and `content:diff` commands.

- [ ] **Step 1: Write failing diff and CLI-runner tests**

Create base/next fixtures covering one added slug, one changed `expectedContent`, one removed slug, one unchanged slug, a stale base revision, and a 26% affected catalog. Assert:

```ts
expect(diff.added.map((item) => item.slug)).toEqual(["new-exercise"]);
expect(diff.removed[0].action).toBe("unpublish");
expect(diff.largeChange).toBe(true);
```

Mock `runSupabase` and assert that production export rejects a command output that does not identify the expected linked project or release state.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx vitest run src/content/catalog-diff.test.ts scripts/content-export.test.ts
```

Expected: FAIL because the diff model, CLI runner, and export command do not exist.

- [ ] **Step 3: Implement pure semantic diffing**

Compare by stable slug. Mark a record changed when any exercise-owned field differs. Treat a missing next record as `{ action: "unpublish" }`, never as a deletion. Reject renamed slugs by comparing slug sets and base metadata. Compute the 25% threshold as `Math.ceil((added + changed + removed) / baseExerciseCount * 100) > 25`.

- [ ] **Step 4: Implement the authenticated CLI runner and production export**

Use an injectable child-process runner to invoke the repository-pinned Supabase CLI with explicit linked-project arguments. Query the private catalog release state and all catalog relations through the authenticated CLI connection, serialize them to the explicit JSON shape, calculate the canonical hash, and write `content/exports/catalog-<revision>-<hash>.json`. Never print the database URL, password, access token, or raw query response.

The command must stop if production revision/hash does not match the repository's last published snapshot. Its success output must include the snapshot path, revision, exercise count, and hash only.

- [ ] **Step 5: Implement the diff CLI**

`content:diff` reads the exported base snapshot and ChatGPT-modified snapshot, runs validation on both, prints field-level changes and the added/changed/unpublish/unchanged counts, and exits nonzero for stale hashes, renamed slugs, invalid JSON, or a large change without `--allow-large-change`.

- [ ] **Step 6: Run focused tests and commit**

```bash
npx vitest run src/content/catalog-diff.test.ts scripts/content-export.test.ts
git add src/content/catalog-diff.ts src/content/catalog-diff.test.ts src/content/supabase-cli-runner.ts scripts/content-export-production.ts scripts/content-diff.ts scripts/content-export.test.ts package.json
git commit -m "feat: add production catalog export and diff"
```

### Task 4: Release-state migration and production catalog reconciliation SQL

**Files:**
- Create via `supabase migration new create_catalog_release_state`: the migration path printed by that command; do not hand-name the migration file.
- Create via `supabase migration new add_catalog_release_reconciliation`: the migration path printed by that command for the production data migration fixture; do not apply it during implementation.
- Create: `src/content/catalog-sql.ts`
- Create: `src/content/catalog-release-plan.ts`
- Create: `src/content/catalog-release-plan.test.ts`
- Create: `supabase/tests/catalog_release_state.sql`
- Modify: `src/infrastructure/supabase/database.types.ts` only if the public type map is changed; the private release-state schema must not be exposed to the browser.

**Interfaces:**
- Consumes: `CatalogDiff`, `CatalogSnapshot`, `exerciseVersionChanged`, and the explicit catalog row model.
- Produces:
  - `buildCatalogReleasePlan(base: CatalogSnapshot, next: CatalogSnapshot): CatalogReleasePlan`.
  - `renderCatalogMigration(plan: CatalogReleasePlan): string`.
  - `escapeSqlString(value: string): string`.
  - A private singleton release-state table containing `revision`, `catalog_hash`, and `published_at`.

- [ ] **Step 1: Write failing release-plan and SQL tests**

Assert that a release plan keeps an existing exercise slug/ID, increments its version for `expectedContent`, inserts new rows, replaces only affected child records, and maps a removed exercise to `is_published = false`. Assert the generated SQL contains `begin;`, `commit;`, the release lock/state check, no `truncate`, no `delete from public.exercises`, and escaped apostrophes such as `Bob''s target`.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx vitest run src/content/catalog-release-plan.test.ts
```

Expected: FAIL because the release plan, SQL renderer, and release-state migration do not exist.

- [ ] **Step 3: Create and implement the private release-state migration**

Run the pinned CLI's migration creation command first. In the generated file, create a non-exposed private schema and singleton row with a check constraint enforcing one row, a positive revision, a 64-character hash, and a publication timestamp. Revoke access from `anon` and `authenticated`; do not add a Data API table type.

Initialize the row from the verified existing production catalog during the adoption release. The migration must not drop, truncate, or reset catalog rows.

- [ ] **Step 4: Implement the release plan and SQL renderer**

Build a deterministic plan with `added`, `changed`, `unpublished`, and `unchanged` operations. Render parameter values as safely escaped SQL literals because the generated migration is reviewed and committed. Wrap all writes in one transaction, lock the release-state row, assert the expected base revision/hash, upsert units and skills, preserve exercise IDs by slug, replace affected child relationships, unpublish missing exercises, and update the release-state row with the target revision/hash.

For changed exercises, increment `version` exactly once from the base JSON version. For new exercises, use version `1`. Never render hard-delete SQL for catalog exercises.

- [ ] **Step 5: Add database-level regression checks**

Write `supabase/tests/catalog_release_state.sql` assertions for the private table, revoked public access, singleton state, and catalog foreign-key preservation. Include a fixture migration test that proves an omitted exercise remains queryable by historical ID but is excluded by the published policy.

- [ ] **Step 6: Run focused tests and commit**

```bash
npx vitest run src/content/catalog-release-plan.test.ts scripts/user-learning-migrations.test.ts scripts/validate-seed.test.ts
git add src/content/catalog-sql.ts src/content/catalog-release-plan.ts src/content/catalog-release-plan.test.ts supabase/migrations supabase/tests/catalog_release_state.sql src/infrastructure/supabase/database.types.ts
git commit -m "feat: generate safe production catalog migrations"
```

### Task 5: Guarded production publisher and post-publish verification

**Files:**
- Create: `src/content/publish-preflight.ts`
- Create: `src/content/publish-preflight.test.ts`
- Create: `scripts/content-prepare-release.ts`
- Create: `scripts/content-publish-production.ts`
- Create: `scripts/content-publish.test.ts`
- Modify: `package.json` scripts with `content:prepare-release` and `content:publish:production`
- Modify: `docs/operations.md`

**Interfaces:**
- Consumes: the Task 3 diff, Task 4 release migration renderer, the pinned `runSupabase`, and the linked project metadata.
- Produces:
  - `preflightProductionPublish(input: PublishInput): PublishPreflightResult`.
  - `publishProduction(input: PublishInput): Promise<PublishResult>`.
  - Guarded commands that require typed project-ref confirmation and never accept a bypass flag.

- [ ] **Step 1: Write failing preflight and publisher tests**

Mock the CLI process and test that preflight rejects a mismatched project ref, stale base revision, unrelated pending migration, missing migration hash, and an unconfirmed large change. Test that a failed `db push` returns a safe user-facing error without echoing CLI credentials or raw database output.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx vitest run src/content/publish-preflight.test.ts scripts/content-publish.test.ts
```

Expected: FAIL because the preflight and publisher modules do not exist.

- [ ] **Step 3: Implement release preparation**

`content:prepare-release` validates the modified snapshot, computes the semantic diff, enforces the 25% threshold, writes exactly one timestamped catalog migration, and writes a release manifest containing the target hash, base revision, migration path, and counts. The manifest contains no credentials.

- [ ] **Step 4: Implement guarded production publishing**

Before invoking `supabase db push`, verify the release manifest, rerun validation, inspect the linked project, check pending migrations, print the summary, and require the operator to type the exact production project ref. Invoke `supabase db push --linked` only after confirmation. After success, query the private release state and compare revision/hash with the manifest. Return success only when they match.

- [ ] **Step 5: Document recovery and run focused tests**

Update `docs/operations.md` with the export → ChatGPT → validate → diff → prepare → dry-run → publish flow, the no-local-Supabase requirement, the unpublish-on-removal rule, and forward-fix recovery after a failed post-publish verification.

Run:

```bash
npx vitest run src/content/publish-preflight.test.ts scripts/content-publish.test.ts
```

Expected: all publisher tests PASS without contacting production.

- [ ] **Step 6: Commit the guarded publisher**

```bash
git add src/content/publish-preflight.ts src/content/publish-preflight.test.ts scripts/content-prepare-release.ts scripts/content-publish-production.ts scripts/content-publish.test.ts package.json docs/operations.md
git commit -m "feat: guard production catalog publishing"
```

### Task 6: Authoring documentation, full verification, and handoff

**Files:**
- Modify: `docs/exercise-authoring-guide.md`
- Modify: `docs/operations.md`
- Modify: `docs/deployment.md` only if the pinned CLI installation and linked-project setup are not already documented
- Create: `docs/content-release-checklist.md`
- Create: `scripts/content-workflow.test.ts`

**Interfaces:**
- Consumes: all content modules and commands from Tasks 1–5.
- Produces: a copy-paste authoring workflow, a release checklist, and an end-to-end mocked file workflow that never contacts Supabase.

- [ ] **Step 1: Write the failing workflow test**

Use a temporary directory containing a base snapshot and a ChatGPT-modified snapshot. Assert that validate → diff → prepare produces a manifest with the expected `added`, `changed`, and `unpublished` counts and a migration path, while the mocked CLI publisher is not called until explicit confirmation.

- [ ] **Step 2: Run it and confirm failure**

```bash
npx vitest run scripts/content-workflow.test.ts
```

Expected: FAIL because the complete command composition and release checklist are not yet wired together.

- [ ] **Step 3: Implement the workflow test and documentation**

Document the exact ChatGPT prompt, the complete JSON requirement, stable slug rules, how to interpret the diff, the production project confirmation, and the fact that removed exercises are unpublished rather than deleted. Include the expected success output and the commands from this plan.

- [ ] **Step 4: Run the complete required verification**

Run:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

Expected: all commands exit `0`. Do not claim production verification; this Task's CLI tests use mocks and no local or remote Supabase database is touched.

- [ ] **Step 5: Commit the documentation and verification**

```bash
git add docs/exercise-authoring-guide.md docs/operations.md docs/deployment.md docs/content-release-checklist.md scripts/content-workflow.test.ts
git commit -m "docs: add exercise catalog release workflow"
```

## Handoff

After completing this plan, report:

- files created and modified;
- the final catalog JSON shape and stable-slug rules;
- tests added and exact command results;
- confirmation that no local Supabase instance was started;
- the production project confirmation and migration safeguards;
- deferred work: admin UI, automatic ChatGPT API calls, hard deletion, slug rename, and unattended CI publishing;
- each Task commit hash.
