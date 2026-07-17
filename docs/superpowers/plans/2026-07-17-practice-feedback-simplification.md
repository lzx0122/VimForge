# Practice Feedback Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove playback, support sparse progressive hints, and make the collapsed Vim key guide explain only the exercise author's recommended solution keys.

**Architecture:** Keep actual normalized actions on the Attempt for scoring, matching, comparison, and sync. Add a separate copied `recommendedActions` feedback field sourced from the recommended catalog solution and pass only that field to the key-guide component. Let the hint panel choose the next available numeric level and remove all playback ownership from the practice page.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vue Test Utils, Playwright, Markdown product specifications.

## Global Constraints

- Implement only the requested practice feedback behavior; do not add new exercise features.
- Keep core behavior in framework-independent TypeScript services where applicable.
- Do not use `any`, skipped tests, fake implementations, or commented-out failures.
- Preserve actual Attempt action recording and synchronization semantics.
- Run `npm run type-check`, `npm run lint`, `npm run test`, `npm run build`, and the affected `npm run test:e2e` journey before completion.

---

### Task 1: Feed the key guide from the recommended solution

**Files:**
- Modify: `src/features/practice/services/attempt-outcome-service.test.ts`
- Modify: `src/features/practice/services/attempt-outcome-service.ts`
- Modify: `src/features/practice/services/vim-key-guide.test.ts`
- Modify: `src/features/practice/services/vim-key-guide.ts`
- Modify: `src/features/practice/components/VimKeyGuide.vue`
- Modify: `src/components/feedback/ExerciseFeedback.test.ts`
- Modify: `src/components/feedback/ExerciseFeedback.vue`
- Modify: `tests/e2e/scoring-feedback.spec.ts`

**Interfaces:**
- `createAttemptOutcome` produces `feedback.recommendedActions: NormalizedAction[]`, copied from the recommended solution, while `attempt.normalizedActions` remains the user's copied actions.
- `explainExpectedVimKeys(actions: readonly NormalizedAction[]): VimKeyExplanation[]` explains only the supplied expected/recommended actions.
- `ExerciseFeedback` accepts `recommendedActions` and passes it to `VimKeyGuide`.

- [ ] **Step 1: Write failing service and component tests**

  Change the outcome test to expect `feedback.recommendedActions` to equal the catalog solution actions and to be a different array reference from both the solution array and the user's actions. Rename key-guide tests to expected keys and make the feedback fixture include a recommended solution that does not include the user's extra movement keys.

- [ ] **Step 2: Run focused tests to verify the expected failure**

  Run: `npm run test -- src/features/practice/services/attempt-outcome-service.test.ts src/features/practice/services/vim-key-guide.test.ts src/components/feedback/ExerciseFeedback.test.ts`

  Expected: FAIL because feedback still exposes `normalizedActions` and the guide still calls the used-action helper.

- [ ] **Step 3: Implement the separate recommended-actions data flow**

  Copy `recommended?.normalizedActions` into `feedback.recommendedActions`; rename the guide helper to `explainExpectedVimKeys`; keep ignoring `insert_text`, `reset`, and other non-key payloads; update Vue prop names and the practice-page binding.

- [ ] **Step 4: Run focused tests to verify the behavior**

  Run the same focused Vitest command. Expected: PASS, including no explanation for inserted program text and no explanation for user-only keys.

- [ ] **Step 5: Update the E2E assertion**

  Make the scoring feedback journey perform a valid completion with extra movement actions, then assert the collapsed guide contains only keys from the recommended solution.

- [ ] **Step 6: Commit**

  Commit message: `feat: explain recommended vim keys only`

### Task 2: Remove playback and support sparse hints

**Files:**
- Delete: `src/features/practice/components/EditorPlayback.vue`
- Delete: `src/features/practice/components/EditorPlayback.test.ts`
- Modify: `src/features/practice/components/ProgressiveHintPanel.test.ts`
- Modify: `src/features/practice/components/ProgressiveHintPanel.vue`
- Modify: `src/features/practice/pages/PracticePage.vue`
- Modify: `tests/e2e/scoring-feedback.spec.ts`

**Interfaces:**
- `ProgressiveHintPanel` emits each newly reached available `HintLevel` in ascending numeric order, skipping absent levels.
- The practice page renders no playback component, playback button, playback timer, or playback reset callback.

- [ ] **Step 1: Write the failing sparse-hint test**

  Replace the missing-level test with hints `[1, 3, 4]`; after each click assert the corresponding level is shown and the next button labels `顯示提示 3`, then `顯示提示 4`, then disappears. Assert the progress text uses the number of available hints rather than assuming four required levels.

- [ ] **Step 2: Run the focused hint test to verify failure**

  Run: `npm run test -- src/features/practice/components/ProgressiveHintPanel.test.ts`

  Expected: FAIL because the current implementation searches for exactly `highestLevel + 1` and displays `/ 4`.

- [ ] **Step 3: Implement sparse hint selection and remove playback**

  Select `orderedHints.find(hint => hint.level > highestLevel)`; display `已解鎖 {unlockedHints.length} / {orderedHints.length}`; remove the playback import, computed data, template block, and deleted component files from the practice page.

- [ ] **Step 4: Run focused tests**

  Run: `npm run test -- src/features/practice/components/ProgressiveHintPanel.test.ts`

  Expected: PASS, with no `start-playback` test target or playback rendering.

- [ ] **Step 5: Update the E2E hint journey**

  Use a mock exercise with non-contiguous hints, reveal available hints in order, assert no playback button or preview exists, and assert no Attempt is created.

- [ ] **Step 6: Run the affected E2E journey**

  Run: `npm run test:e2e -- tests/e2e/scoring-feedback.spec.ts`

  Expected: PASS in the configured browsers.

- [ ] **Step 7: Commit**

  Commit message: `feat: remove practice playback and relax hint levels`

### Task 3: Synchronize specifications and complete verification

**Files:**
- Modify: `docs/product-spec.md`
- Modify: `docs/acceptance-criteria.md`
- Modify: `docs/implementation-plan.md`
- Modify: `docs/superpowers/specs/2026-07-17-practice-playback-feedback-design.md`
- Modify: `docs/superpowers/specs/2026-07-17-practice-feedback-simplification-design.md`
- Modify: `docs/superpowers/plans/2026-07-17-practice-feedback-simplification.md`

- [ ] **Step 1: Update the product specification**

  Replace the fixed four-level playback behavior with optional available levels, no playback, and expected-solution-only key explanations.

- [ ] **Step 2: Update acceptance criteria and implementation checklist**

  Change AC-012 to “next available level” behavior, replace AC-013 with no-playback behavior, and amend Phase 12.1 checklist items to describe the final simplified behavior.

- [ ] **Step 3: Mark the previous playback design as superseded**

  Add a clear superseded notice to the old playback design so it cannot be mistaken for current behavior; retain the new design as the active decision record.

- [ ] **Step 4: Run the full verification suite**

  Run, in order: `npm run type-check`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e`.

  Expected: every command exits successfully; build may retain the repository's existing chunk-size warning.

- [ ] **Step 5: Update the implementation checklist and commit**

  Mark only the verified requirements complete in `docs/implementation-plan.md` and commit with message `feat: simplify practice feedback flow`.
