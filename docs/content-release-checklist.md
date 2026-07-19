# Content release checklist

Use this checklist when changing `content/catalog.json`. The release is
reviewed as a complete snapshot and is safe to stop before the publish step.

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
      counts match the diff.
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
