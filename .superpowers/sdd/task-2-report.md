# Task 2 report: offline catalog conversion and validation

## Scope and implementation

Implemented the Task 2 conversion and offline validation workflow without
starting or connecting to Supabase:

- Added `content/catalog.json`, a pretty-printed explicit snapshot of the
  existing `$catalog$` block (10 units, 100 exercises, 60/20/20 language
  distribution, revision 1, canonical hash).
- Added `scripts/content-validate.ts` with deterministic seed conversion,
  ordinal expansion, stable `<unit-slug>-NN` slugs, shared-contract validation,
  hash verification, and the `validateCatalogFile` API/CLI wrapper.
- Added focused conversion and non-mutating invalid-file tests in
  `scripts/content-validate.test.ts`.
- Updated `scripts/validate-seed.ts` to run expanded records through the Task 1
  catalog contract while retaining its existing seed-specific diagnostics and
  10-unit/100-exercise assertions.
- Added a canonical snapshot baseline assertion to
  `scripts/validate-seed.test.ts`.
- Added the `content:validate` package script and updated the authoring guide
  with the explicit JSON shape, ChatGPT prompt constraints, production-export
  starting point, and offline validation command.
- Expanded `tsconfig.node.json` includes so the required production build can
  compile the shared Task 1 contract imported by the scripts.

## TDD evidence

The required focused command was first run after adding only the tests:

```text
npx vitest run scripts/content-validate.test.ts scripts/validate-seed.test.ts
FAIL: scripts/content-validate.test.ts could not resolve ./content-validate
```

After the minimum implementation, the focused suite passed:

```text
npx vitest run scripts/content-validate.test.ts scripts/validate-seed.test.ts
Test Files  2 passed (2)
Tests  12 passed (12)
```

## Verification

```text
npm run content:validate -- content/catalog.json
Validated 10 units and 100 exercises.

npm run type-check
passed

npm run lint
passed

npm run test
Test Files  45 passed (45)
Tests  298 passed (298)

npm run build
vite build passed
```

## Self-review and concerns

- Conversion preserves declared unit/variant order, substitutes ordinals in
  exercise-owned strings and normalized actions, and recalculates inserted text
  lengths after substitution.
- `validateCatalogFile` is read-only, reports JSON paths, verifies the stored
  canonical hash, and never uses a network/database client.
- The initial seed intentionally contains ordinal variants; the authoring guide
  now prohibits using ordinal-only duplicates for future ChatGPT edits. A later
  workflow task can add semantic duplicate review/diff policy without changing
  this verified baseline.
- No production export, diff, migration, or publish behavior was started; those
  remain deferred to later Tasks.
