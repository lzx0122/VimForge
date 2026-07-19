# Task 3 report

## Files

Created `src/content/catalog-diff.ts`, its focused tests, the injectable
`src/content/supabase-cli-runner.ts`, production export and diff scripts, and
the export tests. Added `content:export:production` and `content:diff` scripts
to `package.json`; added the new Node-side source files to `tsconfig.node.json`.

## Design

- Diffs are keyed by stable exercise slug. Missing exercises become
  `action: "unpublish"`; no hard-delete action is produced.
- Exercise-owned fields produce deterministic field-level changes. Revision and
  canonical-hash checks run before the semantic diff and prevent stale edits.
- The Supabase process wrapper is injectable, returns stdout only on success,
  and converts process failures/timeouts to safe messages without echoing
  stderr, arguments, or environment values.
- Production export invokes `supabase db query --linked --output json` through
  the injected runner, requires a linked project and private release state,
  validates and hashes the complete nested catalog, then writes one export
  snapshot. It never starts local Supabase or mutates production.
- `content:diff` validates both files, prints counts and field-level changes,
  and requires `--allow-large-change` above the 25% threshold.

## Tests and verification

- `npx vitest run src/content/catalog-diff.test.ts scripts/content-export.test.ts` — 5 passed.
- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run test` — 303 passed.
- `npm run build` — passed.
- `npm run content:diff -- content/catalog.json` — reported 0 added, 0 changed,
  0 unpublish, and 100 unchanged.

## Deferred and concerns

Release-state schema/migrations, reconciliation SQL, guarded publishing, and
post-publish checks remain Task 4/5 work. Production export was not run because
no linked authenticated Supabase CLI/project is configured in this local
environment; tests use injected process execution only. The export query
expects the private release-state relation and canonical nested catalog shape
introduced by the later release-state task.

## Review follow-up

- Production unit arrays are ordered by numeric `display_order` in SQL and
  normalized numerically before hashing, preventing lexicographic ordering from
  changing the canonical hash.
- Export now requires a present, strictly validated `releaseState` object and
  reads revision/hash only from that object; payload and snapshot metadata are
  never used as release-state fallbacks.
- The default CLI runner is pinned to Supabase CLI `2.33.9` through
  `npx --no-install`, with a matching `supabase:cli` package script so no
  network download is attempted implicitly.
- Production export requires `expectedProjectRef` (or
  `SUPABASE_PROJECT_REF`) before invoking the CLI, passes it as an explicit
  project flag, and rejects mismatched query output.

Focused review tests: `npx vitest run src/content/catalog-diff.test.ts scripts/content-export.test.ts` — 8 passed.
Full verification: `npm run type-check`, `npm run lint`, `npm run test` (306 passed), and `npm run build` — all passed.
