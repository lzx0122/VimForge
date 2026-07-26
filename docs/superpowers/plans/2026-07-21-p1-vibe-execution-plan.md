# VimForge P1 — Vibe Coding Execution Plan

> This file is self-contained. Give this single file to the coding agent.
>
> Repository baseline: `lzx0122/VimForge@5218b53809b74241bc5d245b1b69580078c414c1`
>
> Date: 2026-07-21

## Prompt for the coding agent

```text
Read this entire plan before modifying code.

Execution rules:
1. Work on exactly one Task at a time.
2. For each Task, write the listed failing test first and run the focused command.
3. Implement only the behavior required by that Task.
4. Run the full verification commands listed in that Task.
5. Create exactly one commit for the Task.
6. Stop after the commit and report:
   - files changed;
   - tests run and their results;
   - commit SHA;
   - any deviation from this plan.
7. Do not start the next Task until explicitly told to continue.
8. Do not weaken TypeScript, ESLint, database constraints, RLS, or tests.
9. Do not use `any`, skipped tests, fixed sleeps, or placeholder implementations.
10. If the repository no longer matches baseline assumptions, stop and report the exact mismatch instead of guessing.
```

## Goal

Deliver three independently reviewable vertical slices:

1. **Scoring reliability**
   - Restore `keystrokeCount`.
   - Implement explicit-check-based `mistakeCount`.
   - Preserve mistake deduplication across reload.
   - Make Restart count as a reset on the same Attempt.
   - Keep completed-feedback Retry as a new Attempt.

2. **Editor settings reliability**
   - Initialize Settings once at application bootstrap.
   - Apply font size and line numbers to the mounted CodeMirror editor.
   - Show the latest 8 physical keypresses.
   - Remove the unused sound preference from the frontend.
   - Apply preferred question count to Practice Setup.

3. **Cloud learning-state hydration**
   - Upload pending local Attempts first.
   - Download Settings, completed Attempts, Skill Mastery, and Review Items.
   - Save downloaded state to IndexedDB.
   - Prevent stale cloud data from replacing newer local projections.
   - Refresh already-open Home, Progress, and Review pages.
   - Never download or upload Active Session or Attempt Draft.

## Fixed product decisions

These decisions are final for P1.

### Mistake definition

A mistake is counted only when the learner presses **「檢查目前結果」** and the current editor snapshot is incomplete.

- The same content, cursor, and mode fingerprint can count only once.
- Changing the snapshot allows a later failed check to count once.
- Undo is counted only by `undoCount`.
- Restart is counted only by `resetCount`.
- Skip does not add a mistake.
- A correct result still auto-completes without requiring the check button.

### Resume mode

P1 does not restore Insert, Visual, Replace, or Command mode.

An unfinished Attempt always resumes in **Normal Mode**. When the persisted `lastMistakeFingerprint` represents the persisted current snapshot, normalize that fingerprint to Normal Mode too. This prevents a reload from counting the same failed state again only because VimEditor mounts in Normal Mode.

### Restart versus Retry

**Restart current exercise:**

- keeps the same `clientAttemptId`;
- keeps the same `startedAt`;
- keeps elapsed time, keystrokes, mistakes, undo history, and hint history;
- increments `resetCount`;
- appends `{ type: "reset" }`;
- restores initial content/cursor and Normal Mode;
- clears recent-key presentation;
- persists before replacing the visible editor state.

**Retry after feedback:**

- creates a new `clientAttemptId`;
- creates a new `startedAt`;
- clears all scoring telemetry.

The Resume dialog action **「重設這一題」** discards the unfinished Draft and starts a new Attempt. It is not scored as an in-Attempt Restart.

### Recent keypresses

- Source: actual `keydown` events received by VimEditor.
- Maximum: 8 tokens.
- Examples: `d`, `<Esc>`, `<Enter>`, `<Backspace>`, `Ctrl-r`, `Shift-g`.
- Modifier-only keys are ignored.
- Not stored in Attempt Draft.
- Cleared by Resume, Restart, Retry, and next exercise.

### Local-first boundary

Stored only on the current device:

- Active Session;
- Attempt Draft;
- editor content;
- cursor;
- current Vim mode;
- recent keypress list.

Cloud-restored account state:

- Settings;
- completed or skipped Attempts;
- Skill Mastery;
- Review Items.

### Account isolation

P1 supports one cloud account per browser database.

The existing IndexedDB `metadata` store records the bound user id. A different authenticated user causes a visible account-conflict error and stops both upload and hydration. P1 must not add an `ownerUserId` field without changing key paths.

### Sound setting

Remove sound from:

- Settings UI;
- Pinia state;
- LocalSettings;
- local repository mapping;
- Supabase settings repository mapping.

Keep the existing Supabase `sound_enabled` column for deployment compatibility. Do not drop it in P1.

## Global verification rules

Run before every Task commit:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

For a Task that changes Supabase SQL, also run:

```bash
npm run supabase:cli -- db reset
npm run supabase:cli -- db lint
npm run supabase:cli -- test db
npm run test -- scripts/user-learning-migrations.test.ts
```

At each PR boundary, run:

```bash
npm run test:e2e
```

Do not create a commit when any required command fails.

---

# PR 1 — `feat/p1-1-scoring-reliability`

## Task 1 — Make AttemptDraft telemetry compile and survive resume

### Files

Modify:

```text
src/types/attempt.ts
src/infrastructure/indexed-db/session-repository.ts
src/infrastructure/indexed-db/session-repository.test.ts
src/features/practice/pages/PracticePage.vue
src/stores/practice-store.test.ts
src/types/types.test.ts
src/infrastructure/indexed-db/indexed-db.test.ts
src/infrastructure/indexed-db/attempt-outcome-commit.test.ts
tests/e2e/resume-session.spec.ts
```

Also update every additional `AttemptDraft` object literal returned by:

```bash
rg -n "AttemptDraft|mistakeCount:" src tests
```

### Required data contract

`AttemptDraft` must contain:

```ts
keystrokeCount: number;
mistakeCount: number;
lastMistakeFingerprint: string | null;
```

### Tests to add first

In `session-repository.test.ts` add exact cases:

1. A current Draft with `keystrokeCount: 17`, `mistakeCount: 2`, and a non-null fingerprint returns those same values from `getResumeState`.
2. A raw legacy Draft with missing `keystrokeCount` and missing `lastMistakeFingerprint` returns:
   - `keystrokeCount: 0`;
   - existing valid `mistakeCount`, otherwise `0`;
   - `lastMistakeFingerprint: null`.
3. A raw Draft with negative or non-integer counters normalizes those counters to `0`.
4. The repository does not derive keystrokes from `actions`.

In `types.test.ts` assert:

```ts
expectTypeOf<AttemptDraft["keystrokeCount"]>().toEqualTypeOf<number>();
expectTypeOf<AttemptDraft["lastMistakeFingerprint"]>()
  .toEqualTypeOf<string | null>();
```

Update `resume-session.spec.ts` fixture to include:

```ts
keystrokeCount: 7,
lastMistakeFingerprint: '["const restoredName = true;",0,18,"normal"]',
```

### Focused RED command

```bash
npm run test -- \
  src/infrastructure/indexed-db/session-repository.test.ts \
  src/types/types.test.ts \
  src/stores/practice-store.test.ts
```

Expected: failure because the fields and normalizer do not exist.

### Implementation

Add this repository-boundary helper:

```ts
function normalizeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : 0;
}

export function normalizePersistedAttemptDraft(
  draft: AttemptDraft,
): AttemptDraft {
  const persisted = draft as AttemptDraft & {
    keystrokeCount?: unknown;
    mistakeCount?: unknown;
    lastMistakeFingerprint?: unknown;
  };

  return {
    ...draft,
    initialCursor: { ...draft.initialCursor },
    currentCursor: { ...draft.currentCursor },
    actions: draft.actions.map((action) => ({ ...action })),
    keystrokeCount: normalizeNonNegativeInteger(
      persisted.keystrokeCount,
    ),
    mistakeCount: normalizeNonNegativeInteger(
      persisted.mistakeCount,
    ),
    lastMistakeFingerprint:
      typeof persisted.lastMistakeFingerprint === "string"
        ? persisted.lastMistakeFingerprint
        : null,
  };
}
```

Use it in `SessionRepository.getResumeState`.

In `PracticePage.vue` add refs:

```ts
const mistakeCount = ref(0);
const lastMistakeFingerprint = ref<string | null>(null);
```

Both Draft builders must write the three fields. Fresh Draft values are `0`, `0`, and `null`.

When restoring an unfinished Draft:

- restore `keystrokeCount`;
- restore `mistakeCount`;
- restore `lastMistakeFingerprint`;
- set snapshot mode to `"normal"`.

Add a pure helper in `session-repository.ts` or `fresh-attempt-service.ts`:

```ts
export function normalizeResumedDraftMode(
  draft: AttemptDraft,
): AttemptDraft
```

Required behavior:

1. Build the fingerprint for the persisted current snapshot and persisted mode.
2. If it equals `lastMistakeFingerprint`, replace the fingerprint with the same content/cursor and `"normal"`.
3. Set `currentMode: "normal"`.
4. Leave a fingerprint that does not represent the current snapshot unchanged.

Apply this helper after legacy normalization.

### Verification

```bash
npm run test -- \
  src/infrastructure/indexed-db/session-repository.test.ts \
  src/types/types.test.ts \
  src/stores/practice-store.test.ts \
  src/infrastructure/indexed-db/indexed-db.test.ts \
  src/infrastructure/indexed-db/attempt-outcome-commit.test.ts
npm run type-check
npm run lint
npm run test
npm run build
```

### Commit

```bash
git add src tests
git commit -m "fix: persist attempt scoring telemetry"
```

Stop after the commit.

---

## Task 2 — Define explicit failed-check mistake semantics

### Files

Create:

```text
src/features/practice/services/attempt-mistake-service.ts
src/features/practice/services/attempt-mistake-service.test.ts
```

### Public API

```ts
export interface CheckedEditorSnapshot {
  content: string;
  cursor: {
    line: number;
    column: number;
  };
  mode: VimMode;
}

export interface FailedCheckResult {
  mistakeCount: number;
  lastMistakeFingerprint: string;
  incremented: boolean;
}

export function createEditorSnapshotFingerprint(
  snapshot: CheckedEditorSnapshot,
): string;

export function recordFailedCheck(input: {
  snapshot: CheckedEditorSnapshot;
  mistakeCount: number;
  lastMistakeFingerprint: string | null;
}): FailedCheckResult;
```

### Tests to add first

Assert exact fingerprint:

```ts
'["wrong",0,3,"normal"]'
```

Assert:

1. First failed check increments `0` to `1`.
2. Same snapshot does not increment again.
3. Changed content increments.
4. Changed cursor increments.
5. Changed mode increments.
6. Negative input mistake count is treated as `0`.
7. Input snapshot is not mutated.

### RED command

```bash
npm run test -- \
  src/features/practice/services/attempt-mistake-service.test.ts
```

### Implementation rules

Fingerprint must be:

```ts
JSON.stringify([
  snapshot.content,
  snapshot.cursor.line,
  snapshot.cursor.column,
  snapshot.mode,
])
```

Do not hash it and do not include time.

### Verification and commit

```bash
npm run test -- \
  src/features/practice/services/attempt-mistake-service.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/practice/services
git commit -m "feat: count explicit failed checks"
```

Stop after the commit.

---

## Task 3 — Separate same-Attempt Restart from new-Attempt Retry

### Files

Modify:

```text
src/features/practice/services/fresh-attempt-service.ts
src/features/practice/services/fresh-attempt-service.test.ts
```

### Required API

`FreshAttemptState` must include:

```ts
mistakeCount: number;
lastMistakeFingerprint: string | null;
```

Add:

```ts
export function restartCurrentAttempt(input: {
  exercise: Pick<PracticeExercise, "initialContent" | "initialCursor">;
  current: FreshAttemptState;
}): FreshAttemptState;
```

### Tests to add first

Fresh Attempt test:

- new id and start time provided by caller remain;
- `keystrokeCount`, `mistakeCount`, `resetCount` are `0`;
- `lastMistakeFingerprint` is `null`;
- actions are empty.

Restart test:

- `clientAttemptId` unchanged;
- `startedAt` unchanged;
- `keystrokeCount` unchanged;
- `mistakeCount` unchanged;
- `highestHintLevel` unchanged;
- `resetCount` increments by exactly one;
- actions preserve existing entries and append `{ type: "reset" }`;
- content/cursor return to exercise initial state;
- mode becomes `"normal"`;
- unmet messages are cleared;
- input object and action array are not mutated.

### RED command

```bash
npm run test -- \
  src/features/practice/services/fresh-attempt-service.test.ts
```

### Verification and commit

```bash
npm run test -- \
  src/features/practice/services/fresh-attempt-service.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/practice/services/fresh-attempt-service.ts \
  src/features/practice/services/fresh-attempt-service.test.ts
git commit -m "fix: preserve telemetry when restarting"
```

Stop after the commit.

---

## Task 4 — Replace the Draft queue with a durable microtask scheduler

### Files

Create:

```text
src/features/practice/services/attempt-draft-save-scheduler.ts
src/features/practice/services/attempt-draft-save-scheduler.test.ts
```

### Required API

```ts
export interface AttemptDraftSaveScheduler {
  schedule(): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export function createAttemptDraftSaveScheduler(options: {
  save: () => Promise<void>;
  onError: (error: unknown) => void;
}): AttemptDraftSaveScheduler;
```

### Required semantics

- `schedule()` marks state dirty.
- Multiple calls in the same JavaScript turn create one queued microtask.
- Saves are serial.
- The save callback reads the newest page state when it executes.
- When another `schedule()` occurs during an in-flight save, a second save runs afterward.
- A failed save calls `onError`.
- A failed save keeps the scheduler dirty so a later `flush()` retries.
- `flush()` returns only when no queued microtask, dirty state, or in-flight save remains.
- `dispose()` flushes first, then rejects future `schedule()` calls by ignoring them.
- There is no 75ms timeout.

### Tests to add first

Use deferred promises and assert:

1. Three synchronous `schedule()` calls cause one save after one microtask.
2. `flush()` saves immediately without waiting for another timer.
3. A call during an in-flight save causes a second save.
4. Save order is serial.
5. First failure calls `onError`; a later `flush()` retries and succeeds.
6. `dispose()` persists dirty state before resolving.
7. `schedule()` after resolved `dispose()` does nothing.

### RED command

```bash
npm run test -- \
  src/features/practice/services/attempt-draft-save-scheduler.test.ts
```

### Verification and commit

```bash
npm run test -- \
  src/features/practice/services/attempt-draft-save-scheduler.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/practice/services/attempt-draft-save-scheduler.ts \
  src/features/practice/services/attempt-draft-save-scheduler.test.ts
git commit -m "refactor: make draft saves durable"
```

Stop after the commit.

---

## Task 5 — Emit one formatted physical keypress from VimEditor

### Files

Create:

```text
src/components/editor/keyboard-display.ts
src/components/editor/keyboard-display.test.ts
```

Modify:

```text
src/components/editor/editor-types.ts
src/components/editor/VimEditor.vue
src/components/editor/VimEditor.test.ts
```

### Public contract

Add:

```ts
keyPressed: [display: string];
```

to `VimEditorEmits`.

### Formatter rules

Ignore exact keys:

```text
Shift
Control
Alt
Meta
```

Special display:

```text
Escape      -> <Esc>
Enter       -> <Enter>
Backspace   -> <Backspace>
Delete      -> <Delete>
Tab         -> <Tab>
ArrowUp     -> <Up>
ArrowDown   -> <Down>
ArrowLeft   -> <Left>
ArrowRight  -> <Right>
```

Examples:

```text
key=d                         -> d
key=G, shiftKey=true          -> Shift-g
key=r, ctrlKey=true           -> Ctrl-r
key=x, ctrlKey=true, altKey=true -> Ctrl-Alt-x
```

Modifier order is always:

```text
Ctrl
Alt
Meta
Shift
key
```

### Tests to add first

1. Test every mapping above.
2. Modifier-only events return `null`.
3. Read-only VimEditor does not emit `keyPressed`.
4. Editable VimEditor emits exactly one `keyPressed` for one dispatched keydown.
5. Existing `actionRecorded` behavior still works.
6. `VimEditorEmits["keyPressed"]` has type `[display: string]`.

### RED command

```bash
npm run test -- \
  src/components/editor/keyboard-display.test.ts \
  src/components/editor/VimEditor.test.ts
```

### Implementation

Use `EditorView.domEventObservers({ keydown })`.

Emit the display token before forwarding the same event to the existing action recorder. Do not call `preventDefault` solely for display.

### Verification and commit

```bash
npm run test -- \
  src/components/editor/keyboard-display.test.ts \
  src/components/editor/VimEditor.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/components/editor
git commit -m "feat: emit real editor keypresses"
```

Stop after the commit.

---

## Task 6 — Integrate scoring telemetry into PracticePage

### Files

Modify:

```text
src/features/practice/pages/PracticePage.vue
```

Create:

```text
src/features/practice/pages/PracticePage.test.ts
```

### Test harness

The component test must use:

- memory router containing `/practice/:sessionId` and result route;
- a real Pinia instance;
- mocked `openVimForgeDatabase`;
- mocked `SessionRepository`;
- mocked published exercise repository;
- a VimEditor stub that can emit:
  - `keyPressed`;
  - `contentChanged`;
  - `cursorChanged`;
  - `modeChanged`;
  - `actionRecorded`.

Do not mock the mistake service, restart service, or scheduler.

### Tests to add first

1. Resume restores `keystrokeCount`, `mistakeCount`, and fingerprint.
2. Resume uses Normal Mode.
3. One `keyPressed` increments keystrokes once.
4. Page no longer counts an outer workspace keydown.
5. First failed check increments mistake.
6. Repeated failed check of identical snapshot does not increment.
7. A changed failed snapshot increments.
8. Auto-completed correct result still submits without pressing check.
9. Restart:
   - calls scheduler flush first;
   - saves restart Draft;
   - only after successful save changes editor state;
   - keeps Attempt id and start time;
   - increments reset.
10. Restart save failure keeps the visible pre-restart editor state.
11. Retry after feedback creates a new Attempt.
12. Next exercise flushes before advancing.
13. `onBeforeRouteLeave` flushes.
14. `visibilitychange` with hidden document schedules a best-effort flush.
15. Component teardown calls scheduler `dispose()` and closes the database only after dispose settles.

### RED command

```bash
npm run test -- \
  src/features/practice/pages/PracticePage.test.ts
```

### Implementation

Replace `draftSaveQueue` and `queueDraftSave` with the scheduler.

The scheduler callback must call `buildAttemptDraft()` at execution time, not capture an old Draft when `schedule()` is called.

Add:

```ts
function recordKeypress(): void
async function checkCurrentResult(): Promise<void>
async function restartExercise(): Promise<void>
```

Button:

```vue
<button
  v-if="feedback === null"
  data-testid="check-result"
  type="button"
  :disabled="isSavingOutcome"
  @click="checkCurrentResult"
>
  檢查目前結果
</button>
```

VimEditor event:

```vue
@key-pressed="recordKeypress"
```

Remove:

```vue
@keydown.capture="recordKeydown"
```

Restart persist-before-apply sequence:

```text
flush existing Draft
build restarted state
build restarted Draft
save restarted Draft to IndexedDB
save restarted Draft to Practice Store
apply restarted state to refs/editor
```

When save fails, call existing error reporting and do not apply the restarted state.

Before outcome, next exercise, abandon, and route leave, call `await scheduler.flush()`.

Add a `visibilitychange` listener on mount. When `document.visibilityState === "hidden"`, call `void scheduler.flush()`.

On unmount:

```text
remove listener
call scheduler.dispose()
close database in dispose.finally
```

Do not close the database before pending persistence finishes.

### Verification and commit

```bash
npm run test -- \
  src/features/practice/pages/PracticePage.test.ts \
  src/features/practice/services/attempt-mistake-service.test.ts \
  src/features/practice/services/attempt-draft-save-scheduler.test.ts \
  src/features/practice/services/fresh-attempt-service.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/practice/pages/PracticePage.vue \
  src/features/practice/pages/PracticePage.test.ts
git commit -m "feat: make practice scoring survive reload"
```

Stop after the commit.

---

## Task 7 — Prove PR 1 with real IndexedDB browser journeys

### Files

Modify:

```text
tests/e2e/resume-session.spec.ts
tests/e2e/scoring-feedback.spec.ts
```

Create:

```text
tests/e2e/p1-scoring-reliability.spec.ts
```

### Required browser tests

#### Resume telemetry

1. Seed an active session with:
   - `keystrokeCount: 7`;
   - `mistakeCount: 1`;
   - fingerprint for the current wrong Normal-Mode snapshot.
2. Visit `/practice/<session-id>`.
3. Click the existing button named **「恢復未完成內容」**.
4. Press one accepted key.
5. Read IndexedDB after the microtask.
6. Assert `keystrokeCount: 8`.
7. Click **「檢查目前結果」** without changing the already-counted snapshot.
8. Assert `mistakeCount` remains `1`.
9. Change the snapshot and check again.
10. Assert `mistakeCount: 2`.

#### Immediate reload

1. Start an Attempt.
2. Press one key.
3. Immediately call `page.reload()` without a fixed timeout.
4. Resume.
5. Assert the persisted Draft includes that keypress.

#### Restart versus Retry

1. Record at least one key.
2. Click the accessible restart control in `PracticeEditorStatusBar`.
3. Assert same Attempt id, same start time, and `resetCount + 1`.
4. Complete the exercise.
5. Assert saved Attempt accuracy reflects reset penalty.
6. Click feedback action **「再試一次」**.
7. Assert new Attempt id and all counters reset.

### Verification

```bash
npm run test:e2e -- \
  tests/e2e/resume-session.spec.ts \
  tests/e2e/scoring-feedback.spec.ts \
  tests/e2e/p1-scoring-reliability.spec.ts
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Commit and PR

```bash
git add tests/e2e
git commit -m "test: cover P1 scoring reliability"
git push -u origin feat/p1-1-scoring-reliability
```

Open PR title:

```text
feat: make practice scoring reliable across reload
```

Stop until PR review is resolved.

---

# PR 2 — `feat/p1-2-editor-settings`

## Task 8 — Centralize application initialization

### Files

Create:

```text
src/app/providers/AppBootstrap.vue
src/app/providers/AppBootstrap.test.ts
```

Modify:

```text
src/app/layouts/AppLayout.vue
src/components/common/OfflineSyncBanner.vue
src/features/auth/components/GoogleSignInButton.vue
```

### Required behavior

On mount:

```text
initialize Settings Store
initialize Sync Store
initialize Auth Store when not already initialized
call syncStore.setAuthenticated(currentUserId or null)
start one watcher for auth user id
```

`setAuthenticated` must receive `string | null`, not a boolean. The Sync Store signature change is finalized in Task 23; until then Task 8 may use an adapter call that preserves compile safety. Do not implement hydration in Task 8.

Remove Auth initialization from `GoogleSignInButton`.

Remove Auth/Sync initialization and auth watcher from `OfflineSyncBanner`.

### Tests to add first

1. Settings, Sync, and Auth initialize once.
2. Initial coordination happens after Auth initialization.
3. Auth user-id changes invoke coordination once.
4. Watcher stops on unmount.
5. Slot renders even if initialization reports an error.

### RED command

```bash
npm run test -- src/app/providers/AppBootstrap.test.ts
```

### Verification and commit

```bash
npm run test -- \
  src/app/providers/AppBootstrap.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/app/providers \
  src/app/layouts/AppLayout.vue \
  src/components/common/OfflineSyncBanner.vue \
  src/features/auth/components/GoogleSignInButton.vue
git commit -m "refactor: centralize app initialization"
```

Stop after the commit.

---

## Task 9 — Apply line numbers and font size reactively

### Files

Modify:

```text
src/components/editor/editor-types.ts
src/components/editor/VimEditor.vue
src/components/editor/VimEditor.test.ts
src/features/practice/pages/PracticePage.vue
```

### Contract

Add required prop:

```ts
editorFontSize: number;
```

Keep:

```ts
showLineNumbers: boolean;
```

Remove `showKeypresses` from VimEditor props. Recent keys belong to PracticePage.

### Tests to add first

1. Mount with line numbers on.
2. Set prop off; line-number gutter disappears.
3. Set prop on; gutter returns.
4. EditorView identity does not change.
5. Change font from 16 to 22; root editor font becomes `22px`.
6. Invalid font values normalize to the same 12–28 bounds as Settings Store.
7. All CodeMirror prop watchers stop on unmount.

### Implementation

Add `Compartment` instances for:

- read-only;
- line numbers;
- font size.

Use `EditorView.theme` for font size and inherit the value in gutters.

PracticePage passes:

```vue
:editor-font-size="settingsStore.editorFontSize"
:show-line-numbers="settingsStore.showLineNumbers"
```

### Verification and commit

```bash
npm run test -- src/components/editor/VimEditor.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/components/editor \
  src/features/practice/pages/PracticePage.vue
git commit -m "feat: apply editor settings reactively"
```

Stop after the commit.

---

## Task 10 — Show the latest eight real keypresses

### Files

Create:

```text
src/features/practice/components/RecentKeypresses.vue
src/features/practice/components/RecentKeypresses.test.ts
```

Modify:

```text
src/features/practice/pages/PracticePage.vue
src/features/practice/pages/PracticePage.test.ts
```

### Component contract

```ts
defineProps<{
  keys: readonly string[];
}>();
```

When keys are empty, render no region.

When non-empty, render a region with:

```text
aria-label="最近按鍵"
```

Each token has:

```text
data-testid="recent-key"
```

### Page behavior tests

1. Ten emitted keys produce the last eight in correct order.
2. `showKeypresses: false` hides the component but still increments total keystrokes.
3. Restart clears recent keys.
4. Retry clears recent keys.
5. Next exercise clears recent keys.
6. Resume starts with no recent keys while preserving total keystroke count.
7. Recent keys are absent from the saved Draft object.

### Implementation

In `PracticePage`:

```ts
const recentKeypresses = ref<string[]>([]);
```

Update `recordKeypress(display)`:

```text
increment total
append display
slice to last 8
schedule Draft save
```

Render `RecentKeypresses` outside VimEditor and guard it with Settings Store.

### Verification and commit

```bash
npm run test -- \
  src/features/practice/components/RecentKeypresses.test.ts \
  src/features/practice/pages/PracticePage.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/practice
git commit -m "feat: show recent practice keypresses"
```

Stop after the commit.

---

## Task 11 — Remove sound preference from the frontend

### Files

Modify:

```text
src/infrastructure/indexed-db/settings-repository.ts
src/stores/settings-store.ts
src/stores/settings-store.test.ts
src/features/settings/pages/SettingsPage.vue
src/features/settings/pages/SettingsPage.test.ts
src/infrastructure/supabase/supabase-settings-repository.ts
src/infrastructure/supabase/database.types.ts
```

### Tests to update first

1. Remove `soundEnabled` from every `LocalSettings` fixture.
2. Settings Page has no `sound-enabled` test id.
3. Settings Page text does not contain **「開啟音效」**.
4. Local normalized settings object has no own `soundEnabled` property even when a legacy stored object contains one.
5. Cloud save payload has no `soundEnabled`.
6. Supabase upsert does not write `sound_enabled`.

### Implementation

Construct normalized settings explicitly:

```ts
return {
  editorFontSize: normalizedFont,
  showLineNumbers: Boolean(settings.showLineNumbers),
  showKeypresses: Boolean(settings.showKeypresses),
  preferredQuestionCount: normalizedCount,
  lastLearningMode: normalizedMode,
  updatedAt: normalizedUpdatedAt,
};
```

Do not spread the legacy settings object.

Keep `sound_enabled` in generated-like database row types because the database column still exists. It may remain optional in Insert/Update.

### Verification and commit

```bash
npm run test -- \
  src/stores/settings-store.test.ts \
  src/features/settings/pages/SettingsPage.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/infrastructure/indexed-db/settings-repository.ts \
  src/stores/settings-store.ts \
  src/stores/settings-store.test.ts \
  src/features/settings/pages/SettingsPage.vue \
  src/features/settings/pages/SettingsPage.test.ts \
  src/infrastructure/supabase/supabase-settings-repository.ts \
  src/infrastructure/supabase/database.types.ts
git commit -m "refactor: remove unused sound preference"
```

Stop after the commit.

---

## Task 12 — Apply preferred question count safely

### Files

Modify:

```text
src/features/practice/pages/PracticeSetupPage.vue
src/features/practice/pages/PracticeSetupPage.test.ts
```

### Precedence

```text
valid URL count
preferredQuestionCount
10 fallback
```

Valid values are `5`, `10`, and `20`.

### Tests to add first

1. No URL count and preference 20 selects 20.
2. URL count 5 and preference 20 selects 5.
3. Invalid URL count and preference 20 selects 20.
4. User changes selection to 5 before late Settings initialization; later preference 20 does not overwrite it.
5. Valid URL count remains authoritative after Settings changes.
6. Beginner/course mode still hides the selector and does not create a requested count.

### Implementation

Add pure functions:

```ts
export function parseQuestionCount(
  value: unknown,
): QuestionCount | null;

export function resolveInitialQuestionCount(
  routeValue: unknown,
  preferred: QuestionCount,
): QuestionCount;
```

Track:

```ts
const routeQuestionCount = parseQuestionCount(route.query.count);
const userChangedQuestionCount = ref(false);
```

The Settings watcher may update only when:

```text
routeQuestionCount is null
and userChangedQuestionCount is false
```

### Verification and commit

```bash
npm run test -- \
  src/features/practice/pages/PracticeSetupPage.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/practice/pages/PracticeSetupPage.vue \
  src/features/practice/pages/PracticeSetupPage.test.ts
git commit -m "feat: apply preferred practice question count"
```

Stop after the commit.

---

## Task 13 — Prove local editor settings in Playwright

### Files

Create:

```text
tests/e2e/p1-editor-settings.spec.ts
```

### Browser journeys

1. Visit `/settings`.
2. Set font size to 22.
3. Disable line numbers.
4. Enable recent keypresses.
5. Choose 20 questions.
6. Visit `/practice/setup?mode=efficiency`.
7. Assert 20 selected.
8. Start a known practice session.
9. Assert no `.cm-lineNumbers`.
10. Assert `.cm-editor` has `font-size: 22px`.
11. Press `d`, `d`, `p`.
12. Assert region **「最近按鍵」** contains three tokens in order.
13. Return to Settings and disable recent keypresses.
14. Return to active practice and assert the region is hidden.
15. Visit `/practice/setup?mode=efficiency&count=5`.
16. Assert URL count 5 overrides stored preference 20.

Do not use fixed waits.

### Verification and PR

```bash
npm run test:e2e -- tests/e2e/p1-editor-settings.spec.ts
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
git add tests/e2e/p1-editor-settings.spec.ts
git commit -m "test: cover P1 editor settings"
git push -u origin feat/p1-2-editor-settings
```

Open PR title:

```text
feat: connect practice editor settings
```

Stop until PR review is resolved.

---

# PR 3 — `feat/p1-3-cloud-hydration`

## Task 14 — Define cloud learning-state DTOs and cursors

### Files

Create:

```text
src/types/cloud-learning-state.ts
src/types/cloud-learning-state.test.ts
```

Modify:

```text
src/types/index.ts
```

### Exact DTOs

```ts
export interface CloudSettingsSnapshot {
  editorFontSize: number;
  showLineNumbers: boolean;
  showKeypresses: boolean;
  preferredQuestionCount: QuestionCount;
  lastLearningMode: LearningMode | null;
  updatedAt: string;
}

export interface CloudAttemptSnapshot extends AttemptSyncInput {
  createdAt: string;
}

export interface CloudSkillMasterySnapshot {
  skillId: string;
  masteryScore: number;
  masteryLevel: MasteryLevel;
  successfulAttempts: number;
  uniqueExerciseIds: string[];
  consecutiveSuccesses: number;
  firstUnhintedSuccessAt: string | null;
  latestUnhintedSuccessAt: string | null;
  lastAttemptAt: string;
  updatedAt: string;
}

export interface CloudExerciseReviewSnapshot {
  exerciseId: string;
  masteryLevel: MasteryLevel;
  currentIntervalDays: number;
  dueAt: string;
  lastPerformanceQuality: PerformanceQuality;
  lastAttemptAt: string;
  updatedAt: string;
}

export interface AttemptHydrationCursor {
  createdAt: string;
  clientAttemptId: string;
}

export interface MasteryHydrationCursor {
  updatedAt: string;
  skillId: string;
}

export interface ReviewHydrationCursor {
  updatedAt: string;
  exerciseId: string;
}

export interface CloudPage<TItem, TCursor> {
  items: TItem[];
  nextCursor: TCursor | null;
  hasMore: boolean;
}

export interface CloudHydrationMetadata {
  key: "cloud-hydration";
  userId: string;
  attemptsCursor: AttemptHydrationCursor | null;
  masteryCursor: MasteryHydrationCursor | null;
  reviewsCursor: ReviewHydrationCursor | null;
  completedAt: string | null;
  schemaVersion: 1;
}
```

### Type tests

Use `expectTypeOf` to assert every cursor key and that cloud projection DTOs do not contain `revision`.

### Verification and commit

```bash
npm run test -- src/types/cloud-learning-state.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/types/cloud-learning-state.ts \
  src/types/cloud-learning-state.test.ts \
  src/types/index.ts
git commit -m "feat: define cloud hydration contracts"
```

Stop after the commit.

---

## Task 15 — Add a lossless Supabase hydration schema

### Files

Create:

```text
supabase/migrations/20260721000100_add_p1_hydration_contract.sql
supabase/tests/p1_learning_hydration.sql
```

Modify:

```text
src/infrastructure/supabase/database.types.ts
src/infrastructure/supabase/attempt-sync.test.ts
supabase/tests/rls_user_learning.sql
scripts/user-learning-migrations.test.ts
```

### Migration requirements

Add columns.

`exercise_attempts`:

```text
performance_quality smallint
practice_context text
```

`user_skill_mastery`:

```text
unique_exercise_ids uuid[] not null default '{}'
first_unhinted_success_at timestamptz
latest_unhinted_success_at timestamptz
```

`user_review_items`:

```text
mastery_level smallint
last_performance_quality smallint
last_attempt_at timestamptz
```

### Backfill rules

#### Attempts

- `performance_quality` derives from the same average-score thresholds used by the local scoring calculator.
- `practice_context` defaults to `different_exercise` for historical rows.
- After backfill, both columns are NOT NULL.
- Add checks for quality `0..5` and the four allowed contexts.

#### Mastery

For each `(user_id, skill_id)`:

- `unique_exercise_ids` is the sorted distinct set of completed attempt exercise ids joined through `exercise_skills`.
- first/latest unhinted timestamps derive from completed attempts with `hint_level_used = 0`.
- Empty history uses an empty UUID array and null timestamps.

#### Reviews

For each `(user_id, exercise_id)`:

- `mastery_level` comes from the review row's `skill_id` matching `user_skill_mastery`; fallback `0`.
- `last_performance_quality` comes from the latest Attempt for the exercise; fallback `0`.
- `last_attempt_at` comes from latest `completed_at`, then `started_at`, then review `updated_at`.
- After backfill, these three fields are NOT NULL.

### RPC update

Replace `record_exercise_attempt(payload jsonb)` without changing its public signature, security mode, idempotency key, or existing scoring/mastery formulas.

It must additionally:

- persist performance quality and practice context in Attempt;
- maintain unique exercise UUID array;
- maintain first/latest unhinted-success timestamps;
- persist review mastery level, last performance quality, and last attempt time.

### Required indexes

```sql
create index if not exists attempts_user_hydration_cursor_idx
  on public.exercise_attempts (
    user_id,
    created_at,
    client_attempt_id
  );

create index if not exists mastery_user_hydration_cursor_idx
  on public.user_skill_mastery (
    user_id,
    updated_at,
    skill_id
  );

create index if not exists reviews_user_hydration_cursor_idx
  on public.user_review_items (
    user_id,
    updated_at,
    exercise_id
  );
```

### SQL tests

`p1_learning_hydration.sql` must:

1. Insert an authenticated user and published exercise setup.
2. Call `record_exercise_attempt`.
3. Assert Attempt stores performance quality/context.
4. Assert Mastery stores unique exercise ids and unhinted timestamps.
5. Assert Review stores mastery, last quality, and last attempt.
6. Assert user A cannot read user B rows.
7. Assert cursor indexes exist.
8. Roll back.

Update existing RLS direct inserts to include newly required Attempt columns.

Update `scripts/user-learning-migrations.test.ts` to read and assert the new migration instead of checking only the original schema file.

### Verification and commit

```bash
npm run supabase:cli -- db reset
npm run supabase:cli -- db lint
npm run supabase:cli -- test db
npm run test -- \
  scripts/user-learning-migrations.test.ts \
  src/infrastructure/supabase/attempt-sync.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add supabase \
  scripts/user-learning-migrations.test.ts \
  src/infrastructure/supabase/database.types.ts \
  src/infrastructure/supabase/attempt-sync.test.ts
git commit -m "feat: add cloud hydration database contract"
```

Stop after the commit.

---

## Task 16 — Map cloud rows with legacy-compatible strict validation

### Files

Create:

```text
src/infrastructure/supabase/cloud-learning-state-mapper.ts
src/infrastructure/supabase/cloud-learning-state-mapper.test.ts
```

### Exported functions

```ts
mapCloudSettings(row): CloudSettingsSnapshot
mapCloudAttempt(row): CloudAttemptSnapshot
mapCloudSkillMastery(row): CloudSkillMasterySnapshot
mapCloudExerciseReview(row): CloudExerciseReviewSnapshot
```

### Legacy-compatible normalization

For valid historical data:

```text
normalized_actions null -> []
speed_score null -> 0
last_practiced_at null -> updated_at
unique_exercise_ids null -> []
first/latest unhinted timestamps may remain null
```

### Invalid data that must throw

- malformed UUID/text key;
- invalid timestamp;
- score outside `0..100`;
- quality outside `0..5`;
- hint outside `0..4`;
- unsupported learning mode;
- unsupported practice context;
- normalized actions that are neither null nor an array;
- invalid NormalizedAction object;
- mastery level outside `0..5`;
- negative counters or interval.

### Tests

Each mapper requires:

- one exact valid mapping test;
- one legal legacy-null test where applicable;
- at least two invalid-data tests;
- assertion that input rows are not mutated.

### Verification and commit

```bash
npm run test -- \
  src/infrastructure/supabase/cloud-learning-state-mapper.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/infrastructure/supabase/cloud-learning-state-mapper.ts \
  src/infrastructure/supabase/cloud-learning-state-mapper.test.ts
git commit -m "feat: validate cloud learning state"
```

Stop after the commit.

---

## Task 17 — Implement dataset-specific Supabase pagination

### Files

Create:

```text
src/features/cloud-hydration/repositories/cloud-learning-state-repository.ts
src/infrastructure/supabase/supabase-cloud-learning-state-repository.ts
src/infrastructure/supabase/supabase-cloud-learning-state-repository.test.ts
```

### Repository interface

```ts
export interface CloudLearningStateRepository {
  getSettings(): Promise<CloudSettingsSnapshot | null>;

  listAttemptsPage(
    cursor: AttemptHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<
    CloudAttemptSnapshot,
    AttemptHydrationCursor
  >>;

  listMasteryPage(
    cursor: MasteryHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<
    CloudSkillMasterySnapshot,
    MasteryHydrationCursor
  >>;

  listReviewsPage(
    cursor: ReviewHydrationCursor | null,
    limit?: number,
  ): Promise<CloudPage<
    CloudExerciseReviewSnapshot,
    ReviewHydrationCursor
  >>;
}
```

Default limit is `200`, maximum accepted limit is `500`.

### Query contracts

Settings:

- select only active frontend fields and `updated_at`;
- exclude `sound_enabled`;
- use `maybeSingle`;
- rely on RLS, not a caller-supplied user id.

Attempts ordering:

```text
created_at ascending
client_attempt_id ascending
```

Mastery ordering:

```text
updated_at ascending
skill_id ascending
```

Reviews ordering:

```text
updated_at ascending
exercise_id ascending
```

Each query fetches `limit + 1`. Return only `limit` items. `hasMore` is true only when the extra row exists. `nextCursor` is derived from the last returned item.

### Tests

Use a chainable fake Supabase client and assert:

1. exact selected columns;
2. exact ascending order calls;
3. compound cursor filter;
4. `limit + 1`;
5. empty first page gives `nextCursor: null`;
6. full page gives last-item cursor;
7. malformed row mapper error propagates;
8. Supabase error becomes a cause-preserving Error.

### Verification and commit

```bash
npm run test -- \
  src/infrastructure/supabase/supabase-cloud-learning-state-repository.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/cloud-hydration \
  src/infrastructure/supabase/supabase-cloud-learning-state-repository.ts \
  src/infrastructure/supabase/supabase-cloud-learning-state-repository.test.ts
git commit -m "feat: page cloud learning state"
```

Stop after the commit.

---

## Task 18 — Bind IndexedDB to one account

### Files

Create:

```text
src/infrastructure/indexed-db/local-data-owner-repository.ts
src/infrastructure/indexed-db/local-data-owner-repository.test.ts
```

### Record

```ts
interface LocalDataOwnerRecord {
  key: "local-data-owner";
  userId: string;
}
```

### Error

```ts
export class LocalDataOwnerConflictError extends Error {
  public readonly existingUserId: string;
  public readonly requestedUserId: string;
}
```

### Tests

1. Empty metadata binds user A.
2. Binding user A again is idempotent.
3. Binding user B throws typed conflict.
4. Conflict leaves user A record unchanged.
5. Empty or whitespace user id is rejected.
6. Uses existing metadata store; database version remains 2.

### Verification and commit

```bash
npm run test -- \
  src/infrastructure/indexed-db/local-data-owner-repository.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/infrastructure/indexed-db/local-data-owner-repository.ts \
  src/infrastructure/indexed-db/local-data-owner-repository.test.ts
git commit -m "feat: bind local data to one account"
```

Stop after the commit.

---

## Task 19 — Persist typed hydration cursors

### Files

Create:

```text
src/infrastructure/indexed-db/cloud-hydration-metadata-repository.ts
src/infrastructure/indexed-db/cloud-hydration-metadata-repository.test.ts
```

### API

```ts
get(userId: string): Promise<CloudHydrationMetadata>;

markCompleted(
  userId: string,
  completedAt: string,
): Promise<void>;
```

Page cursor updates are performed by the committer in Task 20.

### Tests

1. Missing record returns schema-version-1 empty cursors.
2. Existing valid metadata round-trips.
3. Different user id throws.
4. Invalid schema version throws.
5. Invalid cursor shape throws.
6. `markCompleted` preserves all cursors.
7. Invalid completion timestamp throws.

### Verification and commit

```bash
npm run test -- \
  src/infrastructure/indexed-db/cloud-hydration-metadata-repository.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/infrastructure/indexed-db/cloud-hydration-metadata-repository.ts \
  src/infrastructure/indexed-db/cloud-hydration-metadata-repository.test.ts
git commit -m "feat: persist cloud hydration cursors"
```

Stop after the commit.

---

## Task 20 — Commit downloaded pages atomically with revision guards

### Files

Create:

```text
src/infrastructure/indexed-db/cloud-hydration-committer.ts
src/infrastructure/indexed-db/cloud-hydration-committer.test.ts
```

Modify:

```text
src/infrastructure/indexed-db/indexed-db.test.ts
```

### API

```ts
export interface ProjectionRevisionSnapshot {
  masteryBySkillId: ReadonlyMap<string, number>;
  reviewsByExerciseId: ReadonlyMap<string, number>;
}

export class IndexedDbCloudHydrationCommitter {
  public constructor(database: IDBDatabase);

  public captureProjectionRevisions():
    Promise<ProjectionRevisionSnapshot>;

  public commitAttemptsPage(input: {
    userId: string;
    items: readonly CloudAttemptSnapshot[];
    nextCursor: AttemptHydrationCursor | null;
  }): Promise<{
    inserted: number;
    preservedPending: number;
  }>;

  public commitMasteryPage(input: {
    userId: string;
    items: readonly CloudSkillMasterySnapshot[];
    nextCursor: MasteryHydrationCursor | null;
    expectedRevisions: ReadonlyMap<string, number>;
  }): Promise<{
    applied: number;
    skippedNewer: number;
  }>;

  public commitReviewsPage(input: {
    userId: string;
    items: readonly CloudExerciseReviewSnapshot[];
    nextCursor: ReviewHydrationCursor | null;
    expectedRevisions: ReadonlyMap<string, number>;
  }): Promise<{
    applied: number;
    skippedNewer: number;
  }>;
}
```

### Attempt merge

- Missing local Attempt: insert with `syncStatus: "synced"`.
- Local pending Attempt with same id: preserve local record.
- Local synced Attempt: keep one record.
- Remote omission never deletes local data.
- Cloud-only `createdAt` is used for cursor but not stored when `StoredAttempt` has no field for it.

### Revision rule

For each remote projection:

```text
current revision equals expected revision
-> apply cloud values and set revision to current + 1

current revision greater than expected revision
-> skip remote row as stale

current revision less than expected revision
-> abort transaction with an invariant error
```

A missing local row has current revision `0`.

### Atomic transaction rule

Attempt page:

```text
attempts store + metadata store
```

Mastery page:

```text
skillMastery store + metadata store
```

Review page:

```text
exerciseReviews store + metadata store
```

Data writes and corresponding next cursor must commit together.

### Tests

1. Missing Attempt inserted.
2. Pending Attempt preserved.
3. Synced Attempt not duplicated.
4. Page replay is idempotent.
5. Mastery equal revision applies and increments.
6. Mastery newer local revision skips.
7. Mastery lower-than-expected revision aborts.
8. Equivalent three Review tests.
9. Injected put failure rolls back page and cursor.
10. Skipped stale row still advances cursor.
11. Database version and existing stores remain unchanged.

### Verification and commit

```bash
npm run test -- \
  src/infrastructure/indexed-db/cloud-hydration-committer.test.ts \
  src/infrastructure/indexed-db/indexed-db.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/infrastructure/indexed-db/cloud-hydration-committer.ts \
  src/infrastructure/indexed-db/cloud-hydration-committer.test.ts \
  src/infrastructure/indexed-db/indexed-db.test.ts
git commit -m "feat: commit cloud pages safely"
```

Stop after the commit.

---

## Task 21 — Merge Settings with compare-and-swap protection

### Files

Create:

```text
src/features/settings/services/settings-merge-service.ts
src/features/settings/services/settings-merge-service.test.ts
```

Modify:

```text
src/infrastructure/supabase/supabase-settings-repository.ts
src/infrastructure/supabase/supabase-settings-repository.test.ts
src/stores/settings-store.ts
src/stores/settings-store.test.ts
```

### Cloud port

Add:

```ts
get(userId: string): Promise<LocalSettings | null>;
```

### Merge rules

- Neither exists: keep defaults, no write.
- Local only: upload local.
- Cloud only: save cloud locally.
- Both: newer valid `updatedAt` wins.
- Equal timestamp: local wins.
- Invalid timestamp loses to valid timestamp.
- Both invalid: local wins.

### Compare-and-swap rule

When cloud initially wins:

1. Save `initialLocalUpdatedAt`.
2. Before local save, read local again.
3. If local `updatedAt` changed, recompute merge with the latest local.
4. Apply the recomputed decision.
5. Do not overwrite a setting changed while the cloud request was in flight.

Perform at most one re-read/recompute cycle. If local changes again during the final local save, the local repository remains authoritative and the next hydration retries.

### Tests

1. Every basic merge rule.
2. Cloud wins with unchanged local.
3. User changes local while cloud read is pending; latest local wins and uploads.
4. Cloud query excludes `sound_enabled`.
5. Cloud save excludes `sound_enabled`.
6. Cloud failure leaves local data and Store intact.
7. Local failure does not patch Store with unsaved cloud data.

### Verification and commit

```bash
npm run test -- \
  src/features/settings/services/settings-merge-service.test.ts \
  src/infrastructure/supabase/supabase-settings-repository.test.ts \
  src/stores/settings-store.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/settings \
  src/infrastructure/supabase/supabase-settings-repository.ts \
  src/infrastructure/supabase/supabase-settings-repository.test.ts \
  src/stores/settings-store.ts \
  src/stores/settings-store.test.ts
git commit -m "feat: merge cloud settings safely"
```

Stop after the commit.

---

## Task 22 — Implement download-only CloudHydrationService

### Files

Create:

```text
src/features/cloud-hydration/services/cloud-hydration-service.ts
src/features/cloud-hydration/services/cloud-hydration-service.test.ts
```

### Important ownership rule

This service does **not** upload pending Attempts.

Sync Store owns upload-first coordination in Task 23.

### Dependencies

```ts
interface CloudHydrationDependencies {
  ownerRepository: LocalDataOwnerRepository;
  cloudRepository: CloudLearningStateRepository;
  committer: IndexedDbCloudHydrationCommitter;
  metadataRepository: CloudHydrationMetadataRepository;
  hydrateSettings: (userId: string) => Promise<void>;
  now: () => Date;
}
```

### API

```ts
downloadState(userId: string): Promise<CloudHydrationResult>;
```

### Algorithm

```text
bind local database to user
hydrate Settings
read hydration metadata
capture mastery/review revision snapshot
download all Attempt pages from saved cursor
commit every Attempt page
download all Mastery pages from saved cursor
commit with captured mastery revisions
download all Review pages from saved cursor
commit with captured review revisions
mark hydration completed
return totals
```

A page with `hasMore: true` and `nextCursor: null` is an invariant error.

### Tests

1. Exact order shown above.
2. Existing cursors passed to first queries.
3. Multiple pages loop correctly.
4. Revision snapshot captured once after settings and before projections.
5. Account conflict stops all cloud reads.
6. Attempt-page failure prevents mastery/review and completion mark.
7. Mastery failure prevents review and completion mark.
8. Review failure prevents completion mark.
9. Success marks completion once.
10. Service never calls GuestSyncService.

### Verification and commit

```bash
npm run test -- \
  src/features/cloud-hydration/services/cloud-hydration-service.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/cloud-hydration/services
git commit -m "feat: download authenticated learning state"
```

Stop after the commit.

---

## Task 23 — Make Sync Store own upload-first coordination

### Files

Modify:

```text
src/stores/sync-store.ts
src/stores/sync-store.test.ts
src/components/common/OfflineSyncBanner.vue
src/app/providers/AppBootstrap.vue
src/app/providers/AppBootstrap.test.ts
```

### State additions

```ts
hydrating: boolean;
hydratedUserId: string | null;
hydrationErrorMessage: string | null;
accountConflictMessage: string | null;
localLearningStateRevision: number;
```

### Public API

```ts
setAuthenticated(
  userId: string | null,
  dependencies?: SyncCoordinationDependencies,
): Promise<void>;

syncAndHydrate(
  userId?: string,
  dependencies?: SyncCoordinationDependencies,
): Promise<void>;
```

### Ownership

`syncAndHydrate` performs:

```text
GuestSyncService.syncPending
check result.pending and result.failed
when both are zero, CloudHydrationService.downloadState
on success increment localLearningStateRevision
```

Use one module-level or store-owned active promise so concurrent calls for the same user share one operation.

### Network retry

Do not use `GuestSyncService.retryWhenOnline` as the final coordinator.

The Sync Store listens for online changes and calls the complete:

```text
syncAndHydrate(currentUserId)
```

### Sign-out

On `setAuthenticated(null)`:

- stop online retry listener;
- clear authenticated/hydration presentation state;
- do not delete IndexedDB;
- do not clear owner binding.

### Banner messages

Display exactly one highest-priority state:

1. Account conflict:
   `此瀏覽器已有其他帳號的本機學習資料，已停止同步。`
2. Hydrating:
   `正在恢復帳號學習進度…`
3. Hydration error:
   `雲端進度暫時無法恢復，本機資料仍可使用。`
4. Offline:
   `目前離線，紀錄已保存在這台裝置。`
5. Pending:
   `尚有 N 筆紀錄等待同步。`

Retry button calls `syncAndHydrate`.

### Tests

1. Authenticated call uploads before hydration.
2. Pending remaining prevents hydration.
3. Failed upload prevents hydration.
4. Success increments revision exactly once.
5. Two concurrent calls share one operation.
6. Online retry runs the complete operation.
7. Account conflict sets conflict state and performs no subsequent calls.
8. Sign-out stops listener and preserves local counts.
9. Bootstrap passes current user id, not a boolean.
10. Banner renders every priority state.

### Verification and commit

```bash
npm run test -- \
  src/stores/sync-store.test.ts \
  src/app/providers/AppBootstrap.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/stores/sync-store.ts \
  src/stores/sync-store.test.ts \
  src/components/common/OfflineSyncBanner.vue \
  src/app/providers/AppBootstrap.vue \
  src/app/providers/AppBootstrap.test.ts
git commit -m "feat: coordinate upload-first hydration"
```

Stop after the commit.

---

## Task 24 — Refresh already-open learning pages after hydration

### Files

Modify:

```text
src/features/home/pages/HomePage.vue
src/features/home/pages/HomePage.test.ts
src/features/progress/pages/ProgressPage.vue
src/features/progress/pages/ProgressPage.test.ts
src/features/review/pages/ReviewPage.vue
src/features/review/pages/ReviewPage.test.ts
```

### Required behavior

Each page:

1. uses `useSyncStore`;
2. keeps existing initial `onMounted` load;
3. watches `localLearningStateRevision`;
4. reloads from its real repository/service when revision increases;
5. avoids applying an older overlapping request after a newer load starts.

Use a monotonically increasing request token:

```ts
let loadRequestId = 0;

async function loadData(): Promise<void> {
  const requestId = ++loadRequestId;
  const result = await serviceCall();

  if (requestId !== loadRequestId) {
    return;
  }

  applyResult(result);
}
```

### Tests

For each page:

1. mount with revision 0 and initial empty/local result;
2. change mocked repository result;
3. increment Store revision to 1;
4. assert service called again;
5. assert new data appears;
6. resolve an older request after a newer one and assert it is ignored;
7. unmount stops watcher.

### Verification and commit

```bash
npm run test -- \
  src/features/home/pages/HomePage.test.ts \
  src/features/progress/pages/ProgressPage.test.ts \
  src/features/review/pages/ReviewPage.test.ts
npm run type-check
npm run lint
npm run test
npm run build
git add src/features/home/pages \
  src/features/progress/pages \
  src/features/review/pages
git commit -m "feat: refresh pages after cloud hydration"
```

Stop after the commit.

---

## Task 25 — Prove atomicity, race safety, and new-device hydration

### Files

Modify:

```text
src/infrastructure/indexed-db/cloud-hydration-committer.test.ts
src/features/cloud-hydration/services/cloud-hydration-service.test.ts
```

Create:

```text
tests/e2e/p1-cloud-hydration.spec.ts
```

Modify only when shared helper extraction is required:

```text
tests/e2e/auth-sync.spec.ts
```

### IndexedDB integration tests

Add:

1. Injected Attempt put failure rolls back cursor.
2. Injected Mastery put failure rolls back cursor.
3. Injected Review put failure rolls back cursor.
4. Remote Mastery response starts at expected revision 3; local completion advances to 4; commit skips remote and keeps revision 4.
5. Equivalent Review race.
6. Replaying the same pages does not duplicate Attempts or increment unchanged projection revisions.

### Playwright network mock contract

Mock authenticated Supabase responses for:

```text
user_settings
exercise_attempts
user_skill_mastery
user_review_items
record_exercise_attempt RPC
```

### Browser journey A — New device

1. Clear IndexedDB.
2. Authenticate as user A.
3. Return:
   - Settings font 20, line numbers false, keypresses true, preferred count 20;
   - two Attempts;
   - one Skill Mastery;
   - one due Review.
4. Wait for hydration banner to disappear.
5. Visit `/progress`.
6. Assert cloud mastery and two recent Attempts render.
7. Visit `/review`.
8. Assert due count is one.
9. Visit `/practice/setup?mode=efficiency`.
10. Assert 20 selected.
11. Visit `/settings`.
12. Assert status text is `設定已同步至登入帳號。`.
13. Read IndexedDB and assert exact mapped records and `syncStatus: "synced"`.

### Browser journey B — Upload before download

1. Seed one pending local Attempt.
2. Authenticate.
3. Record intercepted request order.
4. Assert first request is `record_exercise_attempt`.
5. Assert settings and learning-state SELECT requests occur only after RPC completes.

### Browser journey C — Already-open Progress refreshes

1. Open `/progress` before releasing cloud responses.
2. Assert initial empty state.
3. Release hydration responses.
4. Assert Progress updates without navigation or reload.

### Browser journey D — Account conflict

1. Seed metadata owner user A.
2. Authenticate as user B.
3. Assert conflict message.
4. Assert zero upload RPC calls.
5. Assert zero hydration SELECT calls.
6. Assert existing local Progress remains.

### Browser journey E — Stale projection response

1. Delay Mastery response.
2. Complete a local exercise while response is pending.
3. Release older response.
4. Assert newer local mastery remains.
5. Assert no duplicate Attempt RPC.

### Verification and commit

```bash
npm run test -- \
  src/infrastructure/indexed-db/cloud-hydration-committer.test.ts \
  src/features/cloud-hydration/services/cloud-hydration-service.test.ts
npm run test:e2e -- \
  tests/e2e/p1-cloud-hydration.spec.ts \
  tests/e2e/auth-sync.spec.ts
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
git add src/infrastructure/indexed-db/cloud-hydration-committer.test.ts \
  src/features/cloud-hydration/services/cloud-hydration-service.test.ts \
  tests/e2e/p1-cloud-hydration.spec.ts \
  tests/e2e/auth-sync.spec.ts
git commit -m "test: cover cloud hydration reliability"
```

Stop after the commit.

---

## Task 26 — Reconcile documentation and release verification

### Files

Modify:

```text
docs/architecture.md
docs/database-schema.md
docs/testing-strategy.md
docs/acceptance-criteria.md
docs/acceptance-verification.md
```

Add this plan to the repository:

```text
docs/superpowers/plans/2026-07-21-p1-vibe-execution-plan.md
```

### Documentation requirements

Document:

- persisted Attempt telemetry;
- failed-check mistake semantics;
- Resume Normal-Mode rule;
- Restart versus Retry;
- microtask Draft scheduler and flush boundaries;
- Settings-to-CodeMirror data flow;
- recent-key ownership and non-persistence;
- deprecated `sound_enabled`;
- account binding;
- upload-first coordination;
- download-only hydration service;
- dataset-specific cursors;
- atomic cursor/page commits;
- revision guards;
- page invalidation revision;
- non-goal of Active Session/Draft cloud sync.

Add acceptance criteria and exact automated evidence paths for all P1 user-facing page behavior. Follow the repository rule that runtime page integration claims require Playwright evidence.

### Complete verification

```bash
npm ci
npm run supabase:cli -- db reset
npm run supabase:cli -- db lint
npm run supabase:cli -- test db
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected:

- all commands exit zero;
- no untracked generated files;
- no whitespace errors;
- each Task has one focused commit.

### Commit and PR

```bash
git add docs
git commit -m "docs: define P1 reliability architecture"
git push -u origin feat/p1-3-cloud-hydration
```

Open PR title:

```text
feat: restore authenticated learning state locally
```

PR description must explicitly state:

```text
- Supabase migration adds lossless hydration fields and cursor indexes.
- sound_enabled remains as a deprecated compatibility column.
- one browser database can bind to one cloud account in P1.
- Active Session and Attempt Draft remain device-only.
- pending Attempts upload before hydration.
- already-open learning pages refresh after hydration.
```

Stop after the PR is ready for review.

---

# Final acceptance checklist

## Scoring

- [ ] Resume preserves total keystrokes.
- [ ] Resume preserves mistakes.
- [ ] Resume preserves deduplication fingerprint.
- [ ] Resume always starts in Normal Mode without causing a duplicate mistake.
- [ ] Same failed snapshot counts once.
- [ ] Changed failed snapshot can count once.
- [ ] Restart keeps the Attempt and increments reset.
- [ ] Restart persists before changing visible editor state.
- [ ] Retry creates a new Attempt.
- [ ] Immediate reload does not lose the latest keypress.

## Settings

- [ ] Settings initialize at application bootstrap.
- [ ] Mounted editor reacts to font-size changes.
- [ ] Mounted editor reacts to line-number changes.
- [ ] Recent keys show the latest eight physical key events.
- [ ] Recent keys are not persisted.
- [ ] Sound preference is absent from frontend contracts.
- [ ] Preferred count applies to Practice Setup.
- [ ] URL count and manual input are never overwritten by late Settings initialization.

## Cloud hydration

- [ ] Pending local Attempts upload first.
- [ ] Hydration service performs download only.
- [ ] Settings merge cannot overwrite a newer local edit.
- [ ] Attempts hydrate idempotently.
- [ ] Pending local Attempt is never replaced by a cloud copy.
- [ ] Mastery and Review use revision guards.
- [ ] Page data and cursor commit atomically.
- [ ] Legal historical nulls map safely.
- [ ] Invalid cloud data fails before IndexedDB write.
- [ ] Account conflict stops upload and download.
- [ ] Already-open Home, Progress, and Review pages refresh.
- [ ] Active Session and Attempt Draft never sync to Supabase.
- [ ] Full local, SQL, type, unit, build, and Playwright verification passes.
