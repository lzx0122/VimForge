# Production Release Reconciliation Design

## Context

The feedback auto-scroll feature is implemented across `PracticePage.vue`, `feedback-scroll-service.ts`, unit tests, and Playwright coverage. Local runtime verification succeeds in Chromium, but the production-required Playwright suite exposes an intermittent WebKit failure during automatic completion: the result is rendered and initially scrolled into view, then WebKit scrolls back to the still-focused CodeMirror editor.

The repository also contains a catalog release evidence mismatch. Supabase migration `20260717111721_catalog_release.sql` is already applied to the linked production project, but the local working tree modifies that applied migration's final catalog hash. The local revision 2 snapshot uses the corrected hash while the original release manifest and applied migration represent the old hash. Applied migration history must remain immutable.

The release goal is to fix both issues, reconcile production with a forward-only database change, verify the full application, and deploy the Vercel project `vimforge` only after a final explicit production confirmation.

## Decisions

1. Preserve catalog revision 2 and its corrected hash as the intended production state.
2. Never edit, rerun, or repair the already-applied migration history.
3. Reconcile the catalog hash with a new guarded forward migration only after proving production catalog data matches the local revision 2 snapshot.
4. Preserve editor focus after automatic completion; do not blur the editor or focus the feedback card.
5. Keep browser API guards and reduced-motion behavior in the scroll service, while keeping Vue and CodeMirror scheduling coordination in `PracticePage`.
6. Install the Vercel CLI globally, but do not deploy until all checks pass and the user explicitly confirms the production writes.

## WebKit Scroll-Race Fix

### Root cause

Instrumentation shows the following WebKit ordering during automatic completion:

1. `scrollIntoView()` moves the result heading to approximately 70 px from the viewport top.
2. The CodeMirror editor remains focused, as required.
3. In the next animation frame, WebKit performs a caret-visibility scroll and moves the page back to the editor.

The skip flow does not race because clicking the skip button removes focus from the editor. A runtime experiment that schedules the result scroll one animation frame later succeeds in all repeated WebKit runs while preserving editor focus.

### Design

`recordOutcome()` remains the only trigger for result scrolling. After the outcome is persisted and feedback state is assigned, it will:

1. await Vue `nextTick()` so the feedback anchor exists;
2. await one browser animation frame so pending CodeMirror/WebKit caret scrolling completes;
3. call `scrollFeedbackIntoView(feedbackAnchor.value)`.

The animation-frame wait belongs to page coordination because it resolves timing between Vue rendering, the focused editor, and browser layout. `feedback-scroll-service.ts` remains synchronous and limited to:

- null and missing-API guards;
- reduced-motion detection;
- `scrollIntoView` options.

No focus or blur operation will be added.

## Catalog Hash Reconciliation

### Authoritative comparison

Before creating a migration, export the linked production catalog with the repository-pinned Supabase tooling and canonicalize it using the same contract as the local snapshot. Continue only if all of the following are true:

- production release state revision is `2`;
- production release state hash is the original applied hash;
- production catalog rows canonicalize to the corrected revision 2 hash;
- the production export and local revision 2 snapshot contain identical semantic catalog data.

If any condition fails, stop. Do not update release state. Prepare a separate revision 3 release from a fresh production export instead.

### Immutable historical evidence

Restore these already-applied release artifacts to their committed values:

- `supabase/migrations/20260717111721_catalog_release.sql`;
- the original release manifest describing that migration.

The historical migration and manifest must continue to describe what production actually applied.

### Forward migration

Create a new migration using `supabase migration new`. The migration will lock and update the singleton release-state row only when:

- `revision = 2`; and
- `catalog_hash` equals the original applied hash.

It will update only the catalog hash to the corrected hash while preserving the original revision and publication timestamp. The migration-history timestamp records when reconciliation occurred without rewriting when revision 2 was originally published. If the expected row is not updated, the migration raises an exception and the transaction rolls back. It must not rewrite catalog rows, seed data, migration history, or user-learning data.

Before applying it, `supabase db push --linked --dry-run` must report exactly this single pending migration.

## Vercel Preflight

Install the Vercel CLI globally and verify:

- authenticated account;
- linked project ID and project name `vimforge`;
- production target and domains;
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` exist for production;
- no browser-exposed service-role, secret, or Google client-secret variables exist;
- drains, an error-tracking integration, or equivalent monitoring is configured, otherwise present a monitoring-gap warning for explicit acknowledgment.

The working tree and release commit are listed before deployment. No production deployment occurs during preflight.

## Verification

### Automated checks

Run all of the following after the WebKit fix and reconciliation migration are prepared:

- focused feedback-scroll and practice tests;
- repeated WebKit automatic-completion E2E runs;
- the complete Chromium, Firefox, and WebKit Playwright suite;
- full Vitest suite;
- type-check;
- lint;
- production build;
- catalog validation and semantic comparison;
- Supabase linked migration list and dry-run.

### Runtime checks

Drive the running application through:

- automatic completion with default motion;
- skip with reduced motion;
- missing `scrollIntoView` browser API;
- retained editor content and focus after automatic completion;
- next-question/result navigation.

After production deployment, smoke-test:

- `/`;
- a course deep link;
- `/practice/setup?mode=memory_review`;
- `/auth/callback`;
- completed and skipped practice outcomes.

Then scan Vercel runtime logs for early errors and HTTP 500 responses.

## Production Write Gate

Immediately before any production write, present one summary containing:

- linked Supabase project reference;
- production release-state revision and hash;
- the one pending migration and its guarded state transition;
- linked Vercel project and production domains;
- production environment-variable status;
- observability status;
- verification results;
- working-tree and commit state.

The user must explicitly approve both the Supabase production push and Vercel production deployment. Apply the migration first, verify the resulting release state, and only then execute the Vercel production deployment.

## Failure Handling

- Production catalog data mismatch: stop and plan revision 3.
- More than one pending migration: stop and investigate.
- Migration guard failure: rollback automatically and stop.
- Post-migration revision/hash mismatch: stop before Vercel deployment.
- Failed test, type-check, lint, build, or E2E run: stop deployment.
- Missing Vercel production variables: stop and configure them before deployment.
- Vercel build failure: inspect build logs; do not blindly retry.
- Runtime errors after deployment: report them immediately and investigate before declaring the release complete.

## Out of Scope

- Catalog content changes beyond reconciling the corrected hash.
- Migration-history repair, database reset, seed publication, or destructive catalog operations.
- Editor focus redesign.
- Unrelated application refactoring.
- Unattended or automatic production promotion.
