# Practice Editor Experience Design

Status: Approved by the user on 2026-07-16.

## Context

The practice editor already creates a fresh CodeMirror state with the exercise content and cursor, but it does not focus the editable surface. Users must click the editor before the first Vim command works. The editor also relies on CodeMirror's default syntax colors, which do not visually fit the application's dark surface.

The user approved a focused UI amendment that adds automatic focus, a custom dark syntax theme, and an editor footer inspired by the supplied reference image. The footer contains the current Vim mode, elapsed attempt time, and a restart control. This amendment does not change scoring, mastery, synchronization, exercise evaluation, or database behavior.

## Goals

- Focus an editable exercise as soon as its CodeMirror view is ready.
- Preserve the cursor supplied to the editor while focusing it.
- Apply a consistent, high-contrast dark theme to every supported language.
- Move the visible Vim mode into an arrow-shaped footer segment.
- Display elapsed attempt time as `mm:ss`.
- Provide a restart control that uses the existing reset semantics.
- Keep the interaction accessible and covered by unit, component, and E2E tests.

## Non-goals

- No theme selector or user-configurable color palette.
- No timer-based score or new scoring inputs.
- No timer pause, countdown, leaderboard, XP, badge, or other gamification.
- No new persistence model, database column, or synchronization payload.
- No change to hint playback, solution matching, mastery, or review scheduling.
- No third-party CodeMirror theme dependency.

## Interaction Design

### Automatic focus

`VimEditor` receives an optional `autoFocus` prop. When it is true and the editor is not readonly, the component focuses `EditorView.contentDOM` once, after the view and Vim bridge have been created. Focusing must not dispatch a selection change or move the cursor.

The practice page enables `autoFocus`. A fresh question and a restarted question therefore focus at `exercise.initialCursor`. A resumed unfinished attempt focuses at its persisted `currentCursor`, because that cursor is already passed to the newly created editor state.

Focus occurs only when a keyed editor instance mounts. It must not run again after the user deliberately focuses a hint, answer button, navigation element, or other control. A resume dialog remains the active focus target until the user chooses resume or reset; the editor is created and focused only afterward.

Readonly editors never autofocus.

### Restart

The footer exposes a button labelled `重新開始本題`. Activating it calls the existing practice reset flow:

- increment `resetCount` once;
- restore the exercise's initial content;
- restore `exercise.initialCursor`;
- return to Normal mode through a fresh EditorState and Vim bridge;
- clear unmet-condition messages;
- save the updated local draft;
- autofocus the new editable view.

Restart does not replace the `clientAttemptId`, reset `attemptStartedAt`, erase the attempt, or record an automatic failure. The button is disabled while an outcome is being saved.

### Elapsed time

The visible timer starts from the existing `attemptStartedAt`. It is derived from the wall-clock difference rather than incrementing an in-memory counter, so background-tab throttling cannot accumulate drift.

The display refreshes every 1,000 milliseconds and formats elapsed time as `mm:ss`. Each refresh recalculates from the wall clock, so the interval frequency does not define the measured duration. The timer does not reset when restart is used, matching the duration and reset inputs already used by scoring. The refresh interval stops when feedback replaces the exercise or the practice page unmounts.

## Component Design

### `VimEditor.vue`

Responsibilities remain limited to CodeMirror integration:

- add `autoFocus?: boolean` to `VimEditorProps`;
- load the language and custom theme extensions;
- focus once after successful editable-view initialization;
- continue emitting content, cursor, and Vim mode changes;
- keep the existing focus notice available after a deliberate blur;
- destroy the view and Vim listeners on unmount.

The top mode badge is removed from the editor shell because the practice footer becomes the authoritative visible mode indicator. The focus notice must not reserve empty vertical space while the editor is focused.

### `vim-editor-theme.ts`

This module owns presentation-only CodeMirror extensions:

- `EditorView.theme` for editor surfaces, active line, gutters, selection, and cursor;
- `HighlightStyle` plus `syntaxHighlighting` for language tokens;
- exported immutable color tokens used by focused tests.

It contains no Vue or practice-domain dependencies.

### `PracticeEditorStatusBar.vue`

This practice-feature component accepts:

- `mode: VimMode`;
- `elapsedSeconds: number`;
- `restartDisabled: boolean`.

It emits `requestRestart` once per activation. It formats time for display, renders an accessible mode label, and exposes the restart action as a native button. It contains no timer, reset, scoring, or persistence logic.

### `PracticePage.vue`

The page owns orchestration:

- pass `autoFocus` to `VimEditor`;
- pass the current mode and elapsed time to the footer;
- derive elapsed time from `attemptStartedAt`;
- start and stop the display refresh lifecycle;
- route `requestRestart` to the existing `resetExercise()` action;
- disable restart while `isSavingOutcome` is true.

## Visual Design

The editor uses the reference image as a direction rather than reproducing unrelated controls or branding.

| Element | Color |
| --- | --- |
| Editor background | `#171b23` |
| Default text | `#d8dee9` |
| Comments | `#6f8582` |
| Keywords, types, operators | `#78dcca` |
| Functions and properties | `#7aa2f7` |
| Strings and numeric literals | `#a6e35b` |
| Brackets and punctuation | `#c678dd` |
| Inactive line numbers | `#7c8088` |
| Active line number | `#edf0f5` |
| Block cursor | `#45d6b0` |
| Selection | translucent `#45d6b0` |
| Active line | subtle light overlay on the editor background |

The footer visually joins the editor panel. Normal mode uses a blue arrow segment with dark text. Insert, Visual, Replace, and Command modes use distinct cyan, purple, coral, and amber variants. The timer and restart control use cool neutral text with stronger hover and focus states.

On narrow screens, the footer may tighten spacing, but the mode, timer, and restart control remain visible and operable without horizontal scrolling.

## Accessibility

- The mode text remains visible and is not conveyed by color alone.
- The timer has an accessible label describing elapsed practice time.
- Restart is a native button with the label `重新開始本題`.
- Focus-visible styling remains clearly distinguishable on the restart control and CodeMirror surface.
- Automatic focus is limited to the initial editable view mount and does not continuously steal focus.
- Color choices preserve strong foreground/background contrast; comments remain muted but readable.

## Error and Lifecycle Handling

- If language loading or CodeMirror creation fails, existing practice-page error behavior remains authoritative.
- Autofocus runs only after the view exists and is skipped when the component was disposed during async language loading.
- Timer cleanup is idempotent and runs before starting a timer for another question.
- Restart is ignored while outcome persistence is active through the disabled button state.
- No error path changes attempt data, scoring inputs, or cloud synchronization.

## Testing Strategy

Implementation follows TDD. Each behavior must be observed failing before production code is added.

### Unit and component tests

- `VimEditor` focuses an editable view after initialization.
- Autofocus preserves the supplied cursor.
- A readonly view does not autofocus.
- The focus notice reappears after a deliberate blur.
- The custom theme applies the expected foreground colors to representative TypeScript tokens.
- The footer renders all Vim mode labels and variants.
- The footer formats elapsed seconds as `mm:ss`.
- The footer emits one restart request and respects its disabled state.
- Practice restart recreates the editor at initial content, initial cursor, and Normal mode while retaining the attempt start time.
- Timer lifecycle cleanup prevents updates after feedback or unmount.

### E2E tests

- A newly loaded practice question accepts its first Vim key without a manual editor focus call.
- The initial cursor matches the exercise start position.
- The footer mode changes after entering and leaving Insert mode.
- Elapsed time is visible and advances.
- Restart restores initial content and cursor, returns to Normal mode, keeps elapsed time non-decreasing, and does not create an attempt.
- Existing scoring, resume, hint, offline-sync, and cross-browser suites remain green.

## Verification

After implementation, run the focused tests first, followed by:

```bash
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
```

The feature is complete only when every command passes and the production-like browser verification matches the approved reference direction.

## Scope Amendment

The existing MVP documents did not include a visible timer or restart footer. The user explicitly approved this narrow UI amendment on 2026-07-16. The timer only presents the attempt duration already measured by the application, and restart maps to the existing reset behavior and `resetCount`. This amendment does not authorize any other MVP expansion.
