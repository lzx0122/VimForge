# Vim Practice Platform — Codex Project Instructions

## Mission

Build the browser-based Vim practice platform described in this repository. The deliverable is a production-ready Vue 3 SPA deployable to Vercel, with local-first IndexedDB persistence and Supabase-backed authentication, content, synchronization, RLS, and database functions.

## Source of Truth

Before implementation, read these files in order:

1. `docs/decisions.md`
2. `docs/product-spec.md`
3. `docs/architecture.md`
4. `docs/database-schema.md`
5. `docs/testing-strategy.md`
6. `docs/acceptance-criteria.md`
7. `docs/implementation-plan.md`

When documents conflict, stop and report the exact conflict. Do not silently reinterpret or rewrite the specification.

## Fixed Technology

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- CodeMirror 6
- `@replit/codemirror-vim`
- Supabase Auth and PostgreSQL
- IndexedDB
- Vitest and Vue Test Utils
- Playwright
- Vercel

Do not introduce ASP.NET Core, Express, Next.js, Nuxt, Firebase, or another custom backend.

## Scope Rules

- Implement only MVP requirements defined in the specification.
- Do not add rankings, friends, leagues, XP, levels, badges, currency, subscriptions, AI-generated exercises, or an admin console.
- Core business rules must be framework-independent TypeScript domain modules.
- Vue components must not contain scoring, mastery, exercise evaluation, review scheduling, or selection algorithms.
- Never put service-role keys, secret keys, or Google client secrets in frontend code, test fixtures, logs, or committed files.
- Do not use `any`, disable TypeScript or ESLint rules, remove assertions, or delete tests to make verification pass.
- Do not upgrade dependencies without a concrete requirement.

## Task Execution Protocol

- Execute only the Task explicitly named in the current user instruction.
- Read the complete Task section and all referenced specification sections before editing.
- Before editing, report:
  1. the Task goal;
  2. files to create or modify;
  3. tests to add;
  4. work intentionally deferred to later Tasks.
- Use test-driven development:
  1. add a focused failing test;
  2. run it and confirm the expected failure;
  3. implement the minimum correct behavior;
  4. run the focused test;
  5. run the full verification suite.
- Keep each file focused on one responsibility.
- Do not leave TODO placeholders, fake implementations, skipped tests, or commented-out failures.
- Update the matching checkbox in `docs/implementation-plan.md` only after the requirement is actually verified.
- Make the Task-specific commit from the implementation plan only after all required checks pass.
- Do not begin the next Task automatically unless the current instruction explicitly requests continuous multi-Task execution.

## Required Verification

At the end of every Task, run:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

When the Task affects a primary user journey, also run:

```bash
npm run test:e2e
```

Report the exact command results. A Task is not complete while any required command fails.

## External-Service Checkpoint

Tasks in Phase 0 through Phase 5 should remain locally testable without real cloud credentials.

Before Phase 6 or Phase 7 requires a real environment, report exactly which of these are missing and continue with locally verifiable code where the specification permits:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Supabase project and CLI linkage
- Google OAuth provider configuration
- Vercel project and environment variables

Never invent credentials. Never expose secrets in browser environment variables.

## Completion Report

After each Task, report:

1. files created and modified;
2. key design decisions;
3. tests added;
4. verification commands and results;
5. remaining later-Task work;
6. specification conflicts or risks;
7. resulting Git commit hash, when a commit was created.
