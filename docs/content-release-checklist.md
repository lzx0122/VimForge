# Content release checklist

Use this checklist when changing `content/catalog.json`. The release is
reviewed as a complete snapshot and is safe to stop before the publish step.

## Terminology

The release pipeline moves through four distinct snapshots plus one unrelated
local artifact. Confusing these is the root cause of past release bugs —
know which one you're looking at:

1. **Current production canonical baseline** — `content/catalog.json`. Always
   equal to the currently live production catalog (today: revision 2,
   `content/catalog-v2.json`; guarded by `content/canonical-baseline.test.ts`).
   Every release tool reads this file by default as its diff base.
2. **Pre-release authoring snapshot** — the file you hand-edit or send to
   ChatGPT (e.g. `content/catalog-modified.json`). By convention it keeps the
   *same* `catalogRevision` as the baseline it was exported from; the tooling
   advances the revision for you, it does not read a revision bump from this
   file.
3. **Materialized post-release snapshot** — not a file you write. Computed by
   `materializeCatalogReleaseSnapshot(base, authoringTarget)`
   (`src/content/catalog-release-materializer.ts`): the exact data production
   will contain after the migration runs — `catalogRevision` advanced by one,
   changed-exercise versions incremented, and removed exercises retained as
   unpublished rows (never deleted) rather than dropped. This is the only
   correct source of the release's canonical hash.
4. **Release manifest / migration evidence** — `content/release-manifest.json`
   and the generated file under `supabase/migrations/`, produced by
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

After a publish succeeds and the post-publish export verification passes
(the final checklist item below), advance step 1 — overwrite
`content/catalog.json` with the finalized snapshot and commit it alongside the
migration and manifest. Skipping this step is exactly what causes the next
release to diff against a stale baseline.

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
      target hash, migration hash/path, and added/changed/unpublished/unchanged
      counts match the diff. `targetHash` is the *materialized post-release*
      snapshot's hash (revision advanced, exercise versions computed) — it will
      not equal `content/catalog-modified.json`'s own `catalogHash`, and that
      is expected, not a bug.
- [ ] Confirm the migration contains no credentials and only upserts catalog
      data plus non-destructive unpublishes.
- [ ] Commit the modified snapshot, migration, manifest, and documentation as
      one reviewed change. Do not hand-edit generated SQL or the manifest.

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
      revision and catalog hash.
- [ ] Overwrite `content/catalog.json` with the finalized (materialized)
      snapshot and commit it in the same change as the migration and
      manifest, so the next release diffs against the real production state
      instead of a stale baseline.

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
