# Exercise Catalog JSON Production Sync Design

**Date:** 2026-07-17
**Status:** Approved for implementation planning

## 1. Goal

Provide a safe authoring workflow in which the maintainer exports the complete
VimForge exercise catalog as JSON, asks ChatGPT to modify or add exercises, and
publishes the validated result directly to the production Supabase project.

The workflow must not require a local Supabase instance. Local tooling performs
file validation, catalog comparison, and migration generation only.

## 2. User Workflow

The intended workflow is:

1. Export the current production catalog to a portable JSON snapshot and verify
   that it matches the repository's last published revision.
2. Give the JSON and the authoring prompt to ChatGPT.
3. Ask ChatGPT to add, modify, or remove exercises while preserving the schema.
4. Validate the returned JSON locally without connecting to a local database.
5. Review an exact semantic diff against the exported base snapshot.
6. Generate one production data migration.
7. Preview pending Supabase migrations.
8. Explicitly confirm the linked production project and publish.
9. Read the production catalog back and verify the resulting catalog hash.

Representative commands:

```bash
npm run content:export:production
npm run content:validate -- content/exports/catalog-modified.json
npm run content:diff -- content/exports/catalog-modified.json
npm run content:prepare-release -- content/exports/catalog-modified.json
supabase db push --dry-run
npm run content:publish:production
```

## 3. Source of Truth

The repository will contain a canonical, fully expanded catalog JSON file. The
production database is a deployed representation of that versioned file, not a
separate authoring surface. Each editing cycle nevertheless begins with a fresh
production export so the maintainer cannot accidentally edit and publish a stale
local copy.

The initial canonical file is generated from the existing catalog in
`supabase/seed.sql`. After adoption, `content:export:production` reads catalog
rows through an authenticated Supabase CLI database connection, compares the
production release revision with the last published repository revision, and
writes the portable JSON snapshot. The modified and approved snapshot becomes
the next canonical repository file. Generated SQL is never the primary
authoring format.

The portable export includes metadata:

```json
{
  "schemaVersion": 1,
  "catalogRevision": 1,
  "catalogHash": "sha256:...",
  "exportedAt": "2026-07-17T00:00:00.000Z",
  "units": []
}
```

`catalogHash` is calculated from canonical JSON with metadata fields that vary
per export excluded from the hash. Object keys are sorted and arrays remain in
their declared semantic order.

## 4. Authoring JSON Model

The authoring format contains explicit exercises with stable slugs. It does not
use `variants[].count` to manufacture multiple exercises that differ only by an
ordinal. This prevents reordering a template from silently changing exercise
identity and addresses the current catalog's low scenario diversity.

Each unit contains:

- stable unit slug and presentation metadata;
- supported learning modes;
- explicitly declared skills;
- a list of explicitly declared exercises.

Each exercise contains:

- stable exercise slug;
- title, instruction, language, type, and difficulty;
- initial and expected editor content;
- initial cursor and completion rule;
- target duration and publication state;
- weighted skill relationships;
- one or more solutions, including exactly one recommended solution;
- exactly four progressive hints, one for each level;
- the current exercise version from the base catalog.

Existing exercise slugs cannot be renamed through a normal import. New exercises
must use new unique slugs. A rename is treated as an explicit migration outside
this workflow because identity changes affect historical records.

## 5. Components

### Catalog exporter

`content:export:production` reads the production catalog through the linked,
authenticated Supabase CLI database connection, validates it, and writes a
timestamped portable snapshot under `content/exports/`. It also emits a reusable
ChatGPT prompt containing the schema rules and explicit instructions to return
complete JSON without Markdown fences. The implementation pins a compatible CLI
version and discovers its supported database-query flags from that version
rather than assuming a globally installed CLI.

The export contains catalog data only. It never includes users, attempts,
progress, review items, tokens, passwords, database URLs, or API keys.

### Catalog release state

The adoption migration creates a singleton release-state row in a private,
non-Data-API schema. It stores the current catalog revision, canonical catalog
hash, and publication timestamp. Public and authenticated application roles have
no access to this state.

The production exporter reads this row through the CLI database connection. A
generated release migration locks and checks it before changing catalog data,
then advances the revision and hash in the same transaction. This prevents two
catalog publications from silently overwriting each other. The adoption
migration initializes revision `1` from the verified existing production
catalog.

### Catalog validator

The validator extends the existing seed validation rules and checks:

- schema version and required fields;
- unique unit, skill, and exercise slugs;
- legal languages, modes, difficulties, and exercise types;
- valid cursor positions and completion rules;
- skill weights totaling exactly `1.0` with one primary skill;
- at least one solution and exactly one recommended solution;
- positive keystroke counts and target duration;
- exactly one hint for each level from 1 through 4;
- consistency between publication state and required content;
- catalog language distribution as a report, without silently rewriting data;
- suspiciously similar exercises and ordinal-only duplicates as review errors.

Validation is pure and deterministic. It does not modify files or databases.

### Catalog differ

The differ compares a ChatGPT-modified JSON file with its base catalog hash and
classifies every exercise as added, changed, removed, or unchanged. Changed
records display field-level differences. Removed records are described as
`will unpublish`, never `will delete`.

The differ stops when:

- the base catalog hash is stale or unknown;
- an existing slug was renamed;
- duplicate slugs appear;
- the input omits required units or relationships;
- the affected exercise count exceeds the configured large-change threshold
  of 25 percent without an explicit additional confirmation.

### Release migration generator

`content:prepare-release` accepts only a catalog that passed validation and diff
review. It creates one timestamped Supabase data migration using the Supabase CLI
migration creation command available in the pinned CLI version.

The migration:

- acquires a transaction-scoped catalog publication lock;
- checks the expected base catalog revision;
- inserts new units, skills, exercises, solutions, hints, and relationships;
- updates changed rows while preserving stable database IDs;
- increments an exercise version only when exercise behavior or teaching content
  changes;
- replaces changed child relationships within the same transaction;
- marks removed exercises as `is_published = false`;
- never truncates catalog tables and never deletes exercises;
- records the new catalog revision and target hash;
- commits only if every assertion succeeds.

An exercise version increments when any exercise-owned teaching or evaluation
field changes: title, instruction, language, exercise type, difficulty, initial
content, expected content, initial cursor, completion rule, supported modes,
target duration, skill relationships or weights, solutions, or hints. Changing
only `is_published`, unit presentation metadata, or catalog ordering does not
increment the exercise version. No change ever replaces the exercise ID.

### Production publisher

`content:publish:production` is a guarded wrapper around the pinned Supabase CLI.
It does not use a service-role key in browser code or store production secrets in
the repository.

Before publishing, it must:

1. rerun catalog validation;
2. confirm the generated migration matches the target JSON hash;
3. identify the linked Supabase project;
4. require the operator to type the production project ref;
5. confirm there is exactly one intended pending catalog migration and no
   unrelated pending migration;
6. show the added, changed, unpublished, and unchanged counts;
7. require a final interactive confirmation.

It must not support a force flag that bypasses validation, project confirmation,
or pending-migration checks.

After `supabase db push` succeeds, the publisher reads the catalog revision and
hash back from production. A mismatch is reported as a failed release and must
not be described as successful.

## 6. Replacement Semantics

The user experience is a full-catalog replacement, but the database operation is
a reconciliation keyed by stable slugs.

| JSON result | Production action |
| --- | --- |
| New slug | Insert a new row and relationships |
| Existing slug with changes | Update the same row and increment version when required |
| Existing slug unchanged | No write |
| Existing slug absent | Set `is_published = false` |

An absent exercise remains in `exercises`, so `exercise_attempts`,
`user_exercise_progress`, and `user_review_items` keep valid foreign keys and
historical meaning. Unpublished exercises cannot be selected for new practice
through the existing published-catalog policies.

Hard deletion is outside this feature. Re-publishing an unpublished slug is an
explicit update that preserves the same database identity and increments the
exercise version when its content changed.

## 7. Failure Handling

- Invalid JSON: stop before migration generation and print JSON paths for every
  error.
- Stale base revision: stop and require a fresh export before accepting edits.
- Production project mismatch: stop without running `db push`.
- Unexpected pending migrations: stop and require the operator to resolve them.
- SQL assertion or constraint failure: roll back the entire catalog migration.
- Post-publish hash mismatch: report failure, retain evidence, and prepare a
  forward-fix migration; never reset or destructively roll back production.
- Interrupted ChatGPT output: reject the incomplete snapshot rather than filling
  missing content from the old catalog implicitly.

## 8. Security

- ChatGPT receives catalog content only, never database credentials or user data.
- Production authentication is handled by the Supabase CLI outside frontend
  code.
- The publish command operates only on the explicitly linked project and requires
  typed confirmation.
- No service-role key, secret key, database password, or access token is written
  to JSON, logs, generated migrations, fixtures, or committed files.
- Existing RLS policies remain responsible for public read access to published
  catalog rows. The feature adds no public catalog write endpoint.
- Production is never reset, truncated, or seeded with `--include-seed` as part
  of this workflow.

## 9. Testing Strategy

Unit tests cover canonicalization, hashing, schema validation, duplicate
detection, cursor bounds, skill weights, hint levels, semantic diffing, version
decisions, removal-to-unpublish conversion, and SQL escaping.

Migration-generation tests assert that generated SQL:

- is transactional;
- preserves exercise IDs;
- never emits exercise deletion or catalog truncation;
- increments versions only for defined changes;
- unpublishes missing exercises;
- replaces child rows only for affected exercises;
- checks the base revision and records the target hash.

CLI integration tests use mocked process execution to verify dry-run behavior,
project-ref confirmation, pending-migration rejection, command failure handling,
and post-publish hash verification. Tests must never contact production.

The implementation Task must run the repository's required type-check, lint,
unit test, and build commands. Because this is authoring infrastructure rather
than a primary browser journey, Playwright is required only if implementation
adds a browser-based catalog preview.

## 10. Deferred Work

The first version does not include:

- a product-facing admin console;
- browser upload or editing;
- local Supabase application;
- automatic ChatGPT API calls;
- production hard deletion;
- exercise slug rename;
- unattended CI publication;
- rollback by resetting the production database.

Those capabilities require separate specifications and explicit authorization.

## 11. Documentation Impact

Implementation updates the exercise authoring guide with the canonical JSON
schema, ChatGPT prompt, validation commands, release checklist, version rules,
and recovery instructions. The operations guide documents the production
project confirmation and forward-fix procedure. Existing decisions continue to
exclude a product-facing catalog management backend.

## 12. External References

- Supabase seeding guidance: <https://supabase.com/docs/guides/local-development/seeding-your-database>
- Supabase CLI database push: <https://supabase.com/docs/reference/cli/supabase-db-push>
- Supabase local and production workflow: <https://supabase.com/docs/guides/local-development/cli-workflows>
