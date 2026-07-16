# Task 1 Report

## Implementation summary

Implemented a pure TypeScript exercise-catalog contract. The module parses the
explicit snapshot shape, validates stable slugs and supported literal values,
checks cursor bounds against initial content, validates skill weights and
primary relationships, requires one recommended solution and hint levels 1–4,
and reports JSON-path errors. Canonical JSON sorts object keys while retaining
semantic array order; the SHA-256 hash excludes `catalogHash` and `exportedAt`.
Exercise version decisions compare only behavior and teaching-owned fields,
ignoring publication and display-order metadata.

## Files changed

- Created `src/content/catalog-types.ts`.
- Created `src/content/catalog-contract.ts`.
- Created `src/content/catalog-canonicalizer.ts`.
- Created `src/content/catalog-contract.test.ts`.
- Created this report.
- No shared type file was modified; `NormalizedAction` was already exported.

## Focused test command/output

```text
npx vitest run src/content/catalog-contract.test.ts
7 tests passed
```

## Full verification

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run test` — passed (44 files, 293 tests).
- `npm run build` — passed (Vite emitted only the existing chunk-size warning).
- Playwright was not run because this task adds no browser journey.

## Self-review

- No Supabase, database, network, or production write is used.
- No `any`, skipped tests, TODO placeholders, or disabled lint rules were added.
- Metadata-only changes keep the same catalog hash and exercise version.
- Duplicate slugs, cursor bounds, invalid weights, missing hint levels, and
  base/next slug renames are covered by focused tests.

## Concerns

The validator accepts `published`/`slug` relation aliases when validating
legacy-shaped input, but `parseCatalogSnapshot` normalizes output to the
canonical camelCase fields. Catalog export, diff, migration, and production
publisher commands remain deferred to later tasks.

## Review fix report

### Files changed

- Modified `src/content/catalog-contract.ts` to reject only removed/added
  exercise pairs whose canonical metadata matches after excluding the slug;
  independent removals and additions with equal counts are now allowed.
- Modified `src/content/catalog-contract.test.ts` with a one-removal/one-addition
  regression case and canonicalizer assertions for recursive object-key sorting
  and preserved array order.
- Appended this review-fix report.

### Verification commands/results

- `npx vitest run src/content/catalog-contract.test.ts` — passed (9 tests).
- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run test` — passed (44 files, 295 tests).
- `npm run build` — passed (Vite emitted the existing large-chunk warning).
- `git diff --check` — passed.

### Self-review

- The true-rename fixture still reports the rename validation error.
- An equal-count removal/addition with changed exercise metadata no longer
  reports a rename.
- Canonicalizer coverage confirms nested object keys are sorted and array
  elements retain their declared order.
- No Supabase, CLI, dependency, or unrelated production changes were made.

### Concerns

Rename detection intentionally uses exact canonical exercise metadata (all
exercise fields except `slug`) to distinguish a rename from an independent
addition/removal. A slug change accompanied by broad content edits cannot be
proven to be a rename from snapshots alone and remains outside this contract's
normal-import detection.
