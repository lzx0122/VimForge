# Task 4 report: release-state migration and catalog reconciliation SQL

## Files

- Added `src/content/catalog-release-plan.ts` with deterministic unit, skill,
  relationship, and exercise operations. Existing exercise slugs remain the
  identity key; changed content increments the base version once, additions
  start at version 1, and removed slugs become unpublish operations.
- Added `src/content/catalog-sql.ts` with PostgreSQL literal escaping and a
  single-transaction renderer. It locks and verifies the private release state,
  upserts catalog rows by stable slug, replaces child rows only for added or
  changed exercises, unpublishes removed exercises, and never hard-deletes an
  exercise row.
- Added `src/content/catalog-release-plan.test.ts` covering release planning,
  versioning, child replacement, unpublishing, SQL guards, and apostrophe
  escaping.
- Added `supabase/migrations/20260717023000_create_catalog_release_state.sql`
  for the private singleton release state, positive revision/hash checks,
  browser-role revocation, and adoption metadata.
- Added `supabase/migrations/20260717023001_add_catalog_release_reconciliation.sql`
  as an unapplied forward-only fixture that unpublishes an omitted exercise
  while retaining its historical row.
- Added `supabase/tests/catalog_release_state.sql` with pgTAP assertions for
  private access, singleton state, constraints, and publication filtering.

## Verification

- `npx vitest run src/content/catalog-release-plan.test.ts` — PASS (3 tests).
- `npm run type-check` — PASS.
- `npm run test` — PASS (48 files, 309 tests).
- `npm run build` — PASS.
- Focused ESLint for Task 4 files — PASS.
- `npm run lint` — BLOCKED by the pre-existing unused `readInteger` in
  `scripts/content-export-production.ts:152`; Task 4 files have no lint errors.

## CLI checkpoint and concerns

The required pinned commands were invoked before creating migration files:

```text
npm run supabase:cli -- migration new create_catalog_release_state
npm run supabase:cli -- migration new add_catalog_release_reconciliation
```

The repository has no locally installed Supabase CLI (`npm ls supabase` is
empty), and the `npx --no-install supabase@2.33.9` invocations produced no
printed migration path or generated file. The two migration files therefore
use timestamped fallback paths and this limitation must be reviewed before
publishing. No migration was applied and no local or production database was
contacted.
