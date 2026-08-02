# Content release checklist

Use this checklist when changing `content/catalog.json`. The release is
reviewed as a complete snapshot and is safe to stop before the publish step.

## Terminology

The release pipeline moves through four distinct snapshots plus one unrelated
local artifact. Confusing these is the root cause of past release bugs —
know which one you're looking at:

1. **Current production canonical baseline** — `content/catalog.json`. Always
   equal to the currently live production catalog (today: revision 3,
   `content/catalog-v3-production.json`; guarded by
   `content/canonical-baseline.test.ts`). Every release tool reads this file
   by default as its diff base. Do not confuse this with `content/catalog-v3.json`
   (the Golden content-generation artifact) or `content/catalog-v3-authoring.json`
   (the pre-release authoring snapshot rebased onto the prior baseline) — only
   `content/catalog-v3-production.json` is the immutable, independently
   verified record of what production actually contains at this revision.
2. **Pre-release authoring snapshot** — the file you hand-edit or send to
   ChatGPT (e.g. `content/catalog-modified.json`). By convention it keeps the
   *same* `catalogRevision` as the baseline it was exported from; the tooling
   advances the revision for you, it does not read a revision bump from this
   file.
3. **Materialized post-release snapshot** — `content/release-target.json`,
   written by `content:prepare-release`. Computed by
   `materializeCatalogReleaseSnapshot(base, authoringTarget)`
   (`src/content/catalog-release-materializer.ts`): the exact data production
   will contain after the migration runs — `catalogRevision` advanced by one,
   changed-exercise versions incremented, removed exercises retained as
   unpublished rows (never deleted) rather than dropped, and every nested
   array (unit skills, exercise skills, solutions, hints) normalized to the
   same shape `PRODUCTION_EXPORT_QUERY` reconstructs
   (`src/content/catalog-production-shape.ts`). This is the only correct
   source of the release's canonical hash. It is **not** a diff input — never
   pass it as the authoring target for a later release.
4. **Release manifest / migration evidence** — `content/release-manifest.json`
   (which records `materializedSnapshotPath`, pointing at step 3) and the
   generated file under `supabase/migrations/`, produced by
   `content:prepare-release`. `manifest.targetHash` must be the materialized
   post-release snapshot's hash (step 3), never the pre-release authoring
   snapshot's own hash (step 2) — those differ because `catalogRevision` and
   exercise versions are part of the canonical hash, and the release always
   advances both.
5. **`supabase/seed.sql`** — a separate, smaller local development bootstrap
   dataset. It is **not** read by `content:publish:production` and is **not**
   reconciled to the canonical catalog by the normal release flow. Its
   ongoing drift from the canonical baseline is known, deliberate, and
   deferred (see `scripts/validate-seed.test.ts`).

After a publish succeeds and **both** post-publish verifications pass (the
release-state check and the full production-row check — see "Guarded
production publish" below), advance step 1: copy step 3's file
(`content/release-target.json`) over `content/catalog.json` and commit it
alongside the migration and manifest. Skipping this step is exactly what
causes the next release to diff against a stale baseline. This step never
needs to re-export from production first — the file to copy already exists,
locally, before you publish.

## Before editing

- [ ] Confirm the intended production project ref with the deployment owner.
- [ ] Export the complete production snapshot; do not edit a hand-written SQL
      fragment:

  ```bash
  npm run content:export:production -- <production-project-ref>
  ```

- [ ] Confirm the export revision and catalog hash match the repository base.
- [ ] Give ChatGPT the complete JSON snapshot and request a complete JSON root
      object in return. Do not accept a snippet, Markdown fence, comments, or
      prose.

## Authoring rules

- [ ] Preserve every unchanged field and array order.
- [ ] Treat existing exercise slugs as immutable IDs. Never rename, renumber,
      or reuse a slug; new slugs are unique lowercase kebab-case.
- [ ] Keep each exercise's skills, solutions, and all four ordered hint levels
      valid. Skill weights must total 1 with exactly one primary skill; there is
      exactly one recommended solution.
- [ ] Keep the catalog within MVP scope. Do not add rankings, XP, badges,
      subscriptions, an admin UI, or AI-generated exercises.
- [ ] Save the response as a separate modified snapshot; retain the base file.

## Validate and review

Run these commands from the repository root:

```bash
npm run content:validate -- content/catalog.json
npm run content:validate -- content/catalog-modified.json
npm run content:diff -- --base content/catalog.json content/catalog-modified.json
```

- [ ] Both validators report success and leave their input files unchanged.
- [ ] Review any ordinal-only or suspicious-similarity warnings. For a release
      requiring zero diversity warnings, rerun with
      `--strict-content-diversity`; exact duplicate content is always an error.
- [ ] Review every `Added`, `Changed`, and `Unpublish` entry and the field-level
      details. A missing exercise is unpublished (`is_published = false`), not
      deleted, so historical attempts keep their foreign keys.
- [ ] Treat a diff above 25% as a change requiring explicit confirmation and a
      second review. Do not bypass the threshold.

## Prepare migration evidence

```bash
npm run content:prepare-release -- content/catalog-modified.json
```

- [ ] Review the single timestamped migration generated under
      `supabase/migrations/`.
- [ ] Review `content/release-manifest.json`: base revision, target revision,
      target hash, migration hash/path, `materializedSnapshotPath`, and
      added/changed/unpublished/unchanged counts match the diff. `targetHash`
      is the *materialized post-release* snapshot's hash (revision advanced,
      exercise versions computed) — it will not equal
      `content/catalog-modified.json`'s own `catalogHash`, and that is
      expected, not a bug.
- [ ] Review `content/release-target.json` (the file `materializedSnapshotPath`
      points at): this is exactly what production will contain after the
      migration. Confirm `hashCatalog()` of this file equals the manifest's
      `targetHash`.
- [ ] Confirm the migration contains no credentials and only upserts catalog
      data plus non-destructive unpublishes.
- [ ] Commit the modified snapshot, migration, manifest, materialized
      snapshot, and documentation as one reviewed change. Do not hand-edit
      generated SQL or the manifest.

## Guarded production publish

The following command is the only release action that can invoke the pinned
Supabase CLI:

```bash
npm run content:publish:production -- content/release-manifest.json
```

- [ ] Confirm the CLI's linked project is the intended production project.
- [ ] Confirm the dry-run reports exactly the migration named by the manifest
      and no unrelated pending migrations.
- [ ] Review the printed release summary.
- [ ] Type the exact production project ref when prompted.
- [ ] Type `PUBLISH` at the separate final confirmation prompt.
- [ ] Confirm the post-publish private release state has the manifest's target
      revision and catalog hash. **This alone is not sufficient** — it only
      proves the migration wrote its own declared revision/hash, not that the
      actual catalog rows canonicalize to that hash. This gap is exactly what
      caused the historical v1→v2 incident and its forward hash-reconciliation
      migration.
- [ ] Confirm the publisher's second, independent check also passed: it
      re-queries the actual production catalog rows (reusing
      `inspectProductionCatalog` / `PRODUCTION_EXPORT_QUERY`) and requires the
      canonically reconstructed snapshot's revision and hash to match the
      manifest too. `publishProduction()` only returns `success: true` after
      *both* checks agree; if release state matches but the row-reconstructed
      hash differs, it fails loudly, states the migration was already
      applied, and instructs a forward-fix — it never rolls back or resets.
- [ ] Only once both checks above passed: copy `content/release-target.json`
      (the manifest's `materializedSnapshotPath`) over `content/catalog.json`
      and commit it in the same change as the migration and manifest, so the
      next release diffs against the real production state instead of a
      stale baseline. Do not advance the baseline before a verified publish.

If any preflight, project-ref, pending-migration, or post-publish check fails,
stop promotion. Preserve the snapshot, migration, and manifest as evidence and
prepare a reviewed forward-fix migration after confirming the actual production
state. Never reset, truncate, force-push, or hard-delete catalog rows.

## Verification and scope

The local workflow test uses temporary snapshots and a mocked CLI publisher. It
never starts a local Supabase instance, connects to Supabase, or proves a
production deployment. Run the required local checks before declaring the task
complete:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

Deferred work includes an admin authoring UI, automatic ChatGPT API calls, hard
deletion, slug renames, and unattended CI publishing.
