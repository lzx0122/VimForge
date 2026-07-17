# Final catalog workflow fix report

## Status

Complete. The final review findings were addressed locally without starting or
connecting to a Supabase or production environment.

## Changes

- Removed the production export query's dependency on
  `current_setting('app.settings.project_ref')`. The mandatory validated
  `expectedProjectRef` is attached to the parsed payload after the linked
  project is checked.
- Pinned the Supabase CLI to `2.79.0` and added a mocked `db query --help`
  capability check requiring `--linked` and `--output` before export queries.
- Added base-unit completeness checks, malformed relationship validation, and
  changed-content slug-rename detection while preserving explicit exercise
  unpublish and supported unit moves.
- Added exact duplicate-content validation errors plus ordinal-only and
  suspicious-similarity warnings. `--strict-content-diversity` upgrades
  warnings to CLI failures without invalidating the existing 100-exercise
  baseline by default.
- Updated deployment guidance so production catalog publication uses reviewed
  migrations and never production seed loading.

## Verification

```text
npx vitest run src/content/catalog-contract.test.ts src/content/catalog-diff.test.ts scripts/content-export.test.ts scripts/content-validate.test.ts  PASS (29 tests)
npm run type-check  PASS
npm run lint        PASS
npm run test        PASS (52 files, 332 tests)
npm run build       PASS
```

No production/local Supabase credentials or linkage were required.
