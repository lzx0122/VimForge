# Task 6 report

## Status

Complete. The content workflow is locally testable from complete JSON snapshots
through validation, semantic diff, migration preparation, and guarded publish
confirmation. No local or production Supabase instance was started or contacted.

## Files

- Created `scripts/content-workflow.test.ts`.
- Created `docs/content-release-checklist.md`.
- Updated `docs/exercise-authoring-guide.md` with the complete ChatGPT prompt,
  snapshot shape, stable-slug rules, diff interpretation, migration safeguards,
  confirmation prompts, and expected output.
- Updated `docs/operations.md` with the operator checklist and mocked-workflow
  boundary.
- Updated `docs/deployment.md` with the pinned Supabase CLI `2.33.9` and linked
  project verification steps.

## Catalog and safeguards

The canonical root is `schemaVersion`, `catalogRevision`, `catalogHash`,
`exportedAt`, and complete `units`; each unit contains explicit exercises.
Exercise slugs are immutable lowercase kebab-case IDs. New slugs must be unique;
renames and ordinal-only reuse are rejected. Removed exercises become
`is_published = false` and are never hard-deleted, preserving historical
attempt foreign keys. Publishing requires the expected linked production ref,
one matching pending migration, exact typed project-ref confirmation, a separate
`PUBLISH` confirmation, and post-publish revision/hash verification.

## Verification

All required commands passed:

```text
npx vitest run scripts/content-workflow.test.ts  PASS (1 test)
npm run type-check                              PASS
npm run lint                                    PASS
npm run test                                    PASS (52 files, 323 tests)
npm run build                                   PASS
```

The workflow test uses temporary base/modified snapshots and a mocked CLI. It
asserts 1 added, 1 changed, 1 unpublished, and 98 unchanged exercises, and
asserts the publisher is not called until `PUBLISH` is explicitly supplied.

## Deferred work and concerns

Deferred: admin authoring UI, automatic ChatGPT API calls, hard deletion, slug
renames, and unattended CI publishing. Production project linkage, Supabase
credentials, Google OAuth, and Vercel configuration remain external deployment
inputs; this task does not claim those environments are verified.
