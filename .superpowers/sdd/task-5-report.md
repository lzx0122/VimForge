# Task 5 report

Status: complete locally; no production project or local Supabase instance was contacted.

Implemented guarded release preparation and publishing. Preflight validates catalog snapshots and hashes, checks the expected linked project, enforces the 25% large-change confirmation, rejects unrelated pending migrations, and verifies the manifest migration hash/counts. Publishing uses the pinned CLI runner, requires typed project-ref confirmation, invokes `db push --linked` only after preflight, sanitizes CLI failures, and verifies private release revision/hash after push. Release preparation writes one timestamped SQL migration and a credential-free manifest. Operations documentation covers the export → ChatGPT → validate → diff → prepare → dry-run → publish flow, no-local-Supabase rule, unpublish semantics, and forward-fix recovery.

Verification:

- `npx vitest run src/content/publish-preflight.test.ts scripts/content-publish.test.ts` — 7 tests passed.
- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run test` — 319 tests passed.
- `npm run build` — passed (Vite emitted only the existing chunk-size warning).

Environment concern: no `SUPABASE_PROJECT_REF`, Supabase CLI linkage, or production credentials were present or needed; CLI behavior is covered with mocks only.

## Review follow-up

The release manifest now records the repository-relative `targetPath` for the
modified snapshot. The production publisher uses that path when no target
argument is supplied, so a prepared release can be published with the bare
`content:publish:production` command. Publishing prints added, changed,
unpublished, and unchanged counts and requires a second exact `PUBLISH`
confirmation after the project-ref confirmation and immediately before
`supabase db push`.

Additional verification:

- `npx vitest run scripts/content-prepare-release.test.ts scripts/content-publish.test.ts` — 5 tests passed.
- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm run test` — 322 tests passed.
- `npm run build` — passed (Vite emitted only the existing chunk-size warning).
