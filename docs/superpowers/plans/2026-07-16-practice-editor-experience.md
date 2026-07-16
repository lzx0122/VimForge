# Practice Editor Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every editable practice question immediately ready for Vim input, apply the approved dark syntax palette, and add a joined footer that displays Vim mode, wall-clock elapsed time, and a restart action with the existing reset semantics.

**Architecture:** Keep CodeMirror-only concerns in `VimEditor` and a presentation-only theme module. Put the stateless footer and elapsed-time lifecycle under the practice feature, while `PracticePage` remains the orchestrator for attempt state, persistence, and reset behavior. Reuse the existing keyed editor remount and `resetExercise()` flow so scoring, mastery, synchronization, and database contracts remain unchanged.

**Tech Stack:** Vue 3, TypeScript, CodeMirror 6, `@replit/codemirror-vim`, `@lezer/highlight`, Vitest, Vue Test Utils, Playwright, Vite.

## Global Constraints

- Execute one Task at a time and create one independent Git commit per Task.
- For every behavior, add the focused test first and run it to observe the expected failure before editing production code.
- Do not add a third-party CodeMirror theme, alternate editor, database field, score input, or unrelated game mechanic.
- Do not use `any`, weaken lint/type rules, delete assertions, or skip tests.
- Preserve the existing `clientAttemptId` and `attemptStartedAt` when restarting.
- Run `npm run type-check`, `npm run lint`, `npm run test`, and `npm run build` before every Task commit. Run `npm run test:e2e` for the final user-journey Task.

---

## Task 1: Add editable-only autofocus and the VimForge CodeMirror theme

**Files:**

- Create: `src/components/editor/vim-editor-theme.ts`
- Create: `src/components/editor/vim-editor-theme.test.ts`
- Modify: `src/components/editor/editor-types.ts`
- Modify: `src/components/editor/VimEditor.vue`
- Modify: `src/components/editor/VimEditor.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Intentionally deferred:** The top mode badge remains in place until Task 3 adds the replacement footer. Timer lifecycle, restart UI, practice-page orchestration, documentation amendments, and E2E coverage remain for later Tasks.

- [ ] **Step 1: Add focused failing tests for autofocus**

Extend `src/components/editor/VimEditor.test.ts` so the mount helper can accept prop overrides, then add tests equivalent to:

```ts
it("autofocuses an editable view without moving its initial cursor", async () => {
  const wrapper = await mountEditor(document.body, { autoFocus: true });
  const view = getEditorView(wrapper);

  expect(document.activeElement).toBe(view.contentDOM);
  expect(view.state.selection.main.head).toBe(
    view.state.doc.line(2).from + defaultProps.initialCursor.column,
  );

  wrapper.unmount();
});

it("does not autofocus a readonly view", async () => {
  const outside = document.createElement("button");
  document.body.append(outside);
  outside.focus();
  const wrapper = await mountEditor(document.body, {
    autoFocus: true,
    readOnly: true,
  });

  expect(document.activeElement).toBe(outside);

  wrapper.unmount();
  outside.remove();
});
```

Run:

```bash
npm run test -- src/components/editor/VimEditor.test.ts
```

Expected: FAIL because `autoFocus` is not part of `VimEditorProps` and the editor does not focus itself.

- [ ] **Step 2: Add focused failing theme tests**

Create `src/components/editor/vim-editor-theme.test.ts`. Mount a real TypeScript `VimEditor`, inspect representative generated token spans, and assert the exported palette is reflected in computed styles for comment, keyword/type/operator, function/property, string/number, and punctuation families. Also assert the editor surface, active line number, and fat Vim cursor use the approved tokens.

The immutable palette under test is:

```ts
export const VIM_EDITOR_COLORS = {
  background: "#171b23",
  foreground: "#d8dee9",
  comment: "#6f8582",
  keyword: "#78dcca",
  function: "#7aa2f7",
  literal: "#a6e35b",
  punctuation: "#c678dd",
  lineNumber: "#7c8088",
  activeLineNumber: "#edf0f5",
  cursor: "#45d6b0",
} as const;
```

Run:

```bash
npm run test -- src/components/editor/vim-editor-theme.test.ts
```

Expected: FAIL because the theme module and custom token styles do not exist.

- [ ] **Step 3: Add the direct highlight dependency and implement the theme**

Install the already-resolved highlight package as a direct runtime dependency without upgrading other packages:

```bash
npm install --save-exact @lezer/highlight@1.2.3
```

Implement `src/components/editor/vim-editor-theme.ts` with `EditorView.theme`, `HighlightStyle.define`, and `syntaxHighlighting`. Export one `readonly Extension[]` containing the surface and syntax extensions. Cover these CodeMirror surfaces:

```ts
const surfaceTheme = EditorView.theme(
  {
    "&": { color: VIM_EDITOR_COLORS.foreground, backgroundColor: VIM_EDITOR_COLORS.background },
    ".cm-content": { caretColor: VIM_EDITOR_COLORS.cursor },
    ".cm-gutters": { color: VIM_EDITOR_COLORS.lineNumber, backgroundColor: VIM_EDITOR_COLORS.background },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.035)" },
    ".cm-activeLineGutter": { color: VIM_EDITOR_COLORS.activeLineNumber },
    ".cm-cursor, .cm-dropCursor, .cm-fat-cursor": { borderLeftColor: VIM_EDITOR_COLORS.cursor },
    "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "rgba(69, 214, 176, 0.24)" },
  },
  { dark: true },
);
```

Map `@lezer/highlight` tags without language-specific parsing logic:

```ts
const syntaxTheme = HighlightStyle.define([
  { tag: tags.comment, color: VIM_EDITOR_COLORS.comment },
  { tag: [tags.keyword, tags.typeName, tags.operator, tags.operatorKeyword], color: VIM_EDITOR_COLORS.keyword },
  { tag: [tags.function(tags.variableName), tags.propertyName], color: VIM_EDITOR_COLORS.function },
  { tag: [tags.string, tags.number, tags.bool, tags.null], color: VIM_EDITOR_COLORS.literal },
  { tag: [tags.bracket, tags.punctuation, tags.separator], color: VIM_EDITOR_COLORS.punctuation },
]);
```

- [ ] **Step 4: Implement one-shot editable autofocus in `VimEditor`**

Add `autoFocus?: boolean` to `VimEditorProps`. Add `vimEditorTheme` to the non-Vim extensions after the language extension. After `EditorView`, the Vim bridge, and its mode listener have been created, focus only when explicitly enabled and editable:

```ts
if (props.autoFocus && !(props.readOnly ?? false)) {
  editorView.focus();
}
```

Do not dispatch a selection transaction. Keep the async disposal guard so a component unmounted during language loading cannot receive focus.

- [ ] **Step 5: Run focused tests and Task 1 verification**

Run:

```bash
npm run test -- src/components/editor/VimEditor.test.ts src/components/editor/vim-editor-theme.test.ts
npm run type-check
npm run lint
npm run test
npm run build
```

Expected: all commands pass. The existing Vite chunk-size warning is non-blocking only if the build exits successfully.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json src/components/editor/editor-types.ts src/components/editor/VimEditor.vue src/components/editor/VimEditor.test.ts src/components/editor/vim-editor-theme.ts src/components/editor/vim-editor-theme.test.ts
git commit -m "feat: focus and theme the Vim editor"
```

---

## Task 2: Add the practice editor footer and drift-free elapsed-time lifecycle

**Files:**

- Create: `src/features/practice/components/PracticeEditorStatusBar.vue`
- Create: `src/features/practice/components/PracticeEditorStatusBar.test.ts`
- Create: `src/features/practice/composables/use-attempt-elapsed-time.ts`
- Create: `src/features/practice/composables/use-attempt-elapsed-time.test.ts`

**Intentionally deferred:** `PracticePage` will not render the footer or start its timer until Task 3. The existing reset flow, top editor badge, documentation, and browser journey remain unchanged in this Task.

- [ ] **Step 1: Add failing footer component tests**

Create `PracticeEditorStatusBar.test.ts` with a typed mount helper. Assert:

- every `VimMode` renders its visible label and mode-specific `data-mode` value;
- `0` seconds renders `00:00` and `65` seconds renders `01:05`;
- the timer has the accessible label `已練習時間`;
- clicking `重新開始本題` emits one `requestRestart` event;
- the disabled prop disables the native button and prevents emission.

Run:

```bash
npm run test -- src/features/practice/components/PracticeEditorStatusBar.test.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 2: Implement the stateless footer**

Create `PracticeEditorStatusBar.vue` with this public contract:

```ts
interface Props {
  mode: VimMode;
  elapsedSeconds: number;
  restartDisabled: boolean;
}

defineProps<Props>();
const emit = defineEmits<{ requestRestart: [] }>();
```

Export a pure `formatElapsedTime(seconds: number): string` from the script module or a small adjacent module. Clamp invalid/negative input to zero, floor fractional seconds, and render minutes with at least two digits. Compose the existing `VimModeBadge` so text is still visible, but style it as an arrow segment with `clip-path`. Use distinct approved mode colors and a native restart button with visible focus treatment. Keep all presentation local to the component.

- [ ] **Step 3: Add failing elapsed-time lifecycle tests**

Create `use-attempt-elapsed-time.test.ts` with `vi.useFakeTimers()`, `vi.setSystemTime()`, `effectScope()`, and Vue refs. Assert:

- elapsed seconds are calculated from an ISO `startedAt`, not from interval tick count;
- advancing wall time updates the value on the next 1,000 ms refresh;
- setting `active` to false stops refreshes and clears the interval;
- stopping the Vue effect scope clears the interval idempotently;
- changing `startedAt` while active recalculates from the new timestamp.

Run:

```bash
npm run test -- src/features/practice/composables/use-attempt-elapsed-time.test.ts
```

Expected: FAIL because the composable does not exist.

- [ ] **Step 4: Implement the elapsed-time composable**

Create this typed API:

```ts
export function useAttemptElapsedTime(
  startedAt: Readonly<Ref<string>>,
  active: Readonly<Ref<boolean>>,
): Readonly<Ref<number>>
```

Use a pure calculation based on `Date.now() - Date.parse(startedAt.value)`, clamped to a non-negative integer. Watch both refs immediately. When active with a valid timestamp, refresh now and then with `window.setInterval(refresh, 1_000)`. Clear the previous interval before starting another and in `onScopeDispose`. When inactive, retain the final calculated value and stop scheduling updates. Do not mutate practice state.

- [ ] **Step 5: Run focused tests and Task 2 verification**

Run:

```bash
npm run test -- src/features/practice/components/PracticeEditorStatusBar.test.ts src/features/practice/composables/use-attempt-elapsed-time.test.ts
npm run type-check
npm run lint
npm run test
npm run build
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/features/practice/components/PracticeEditorStatusBar.vue src/features/practice/components/PracticeEditorStatusBar.test.ts src/features/practice/composables/use-attempt-elapsed-time.ts src/features/practice/composables/use-attempt-elapsed-time.test.ts
git commit -m "feat: add practice editor status bar"
```

---

## Task 3: Integrate the focused editor journey, restart behavior, and E2E acceptance

**Files:**

- Modify: `src/features/practice/pages/PracticePage.vue`
- Modify: `src/components/editor/VimEditor.vue`
- Modify: `src/components/editor/VimEditor.test.ts`
- Modify: `tests/e2e/scoring-feedback.spec.ts`
- Modify: `docs/product-spec.md`
- Modify: `docs/architecture.md`
- Modify: `docs/acceptance-criteria.md`
- Modify: `docs/superpowers/plans/2026-07-16-practice-editor-experience.md`

**Intentionally deferred:** Nothing from the approved editor-experience amendment. Deployment remains outside this implementation request and requires a separate explicit instruction.

- [ ] **Step 1: Add failing practice E2E acceptance tests**

Update `tests/e2e/scoring-feedback.spec.ts` so the primary scoring test sends the first `i` key without manually calling `editor.focus()`. Add a dedicated test that asserts:

```ts
await expect(page.locator(".cm-content")).toBeFocused();
await expect(page.getByRole("status", { name: "Vim 模式" })).toContainText("NORMAL");
await expect(page.getByLabel("已練習時間")).toHaveText(/^\d{2,}:\d{2}$/u);

await page.keyboard.press("i");
await expect(page.getByRole("status", { name: "Vim 模式" })).toContainText("INSERT");
await page.keyboard.type("x");

const beforeRestart = await page.getByLabel("已練習時間").textContent();
await page.getByRole("button", { name: "重新開始本題" }).click();
await expect(page.locator(".cm-content")).toHaveText("const name = true;");
await expect(page.locator(".cm-content")).toBeFocused();
await expect(page.getByRole("status", { name: "Vim 模式" })).toContainText("NORMAL");
expect(await page.getByLabel("已練習時間").textContent()).not.toBeNull();
expect(await readAttemptCount(page)).toBe(0);
```

Also inspect the real CodeMirror selection to assert the post-restart head offset equals the exercise cursor position (`6`). Parse both timer strings and assert the later value is greater than or equal to the earlier value.

Run:

```bash
npm run test:e2e -- tests/e2e/scoring-feedback.spec.ts
```

Expected: FAIL because the practice page does not enable autofocus or render the footer.

- [ ] **Step 2: Add failing component coverage for removing the duplicate top badge**

Update `VimEditor.test.ts` to assert the editor shell no longer renders `.vim-mode-badge`, while the focus notice still appears after a deliberate blur without reserving an empty status row when focused.

Run:

```bash
npm run test -- src/components/editor/VimEditor.test.ts
```

Expected: FAIL because `VimEditor` still renders its top badge and status container.

- [ ] **Step 3: Integrate autofocus, elapsed time, and restart in `PracticePage`**

Import the footer and composable. Derive lifecycle state without duplicating attempt data:

```ts
const isAttemptActive = computed(
  () => exercise.value !== null && snapshot.value !== null && feedback.value === null,
);
const elapsedSeconds = useAttemptElapsedTime(attemptStartedAt, isAttemptActive);
```

Wrap the editor and footer in one `.practice-editor-frame`, pass `auto-focus` to `VimEditor`, and wire:

```vue
<PracticeEditorStatusBar
  :mode="snapshot.mode"
  :elapsed-seconds="elapsedSeconds"
  :restart-disabled="isSavingOutcome"
  @request-restart="resetExercise"
/>
```

Keep `resetExercise()` as the single reset action. It already increments `resetCount`, restores initial content/cursor/Normal mode, clears unmet messages, remounts the keyed editor, and queues the local draft while retaining `attemptStartedAt` and `clientAttemptId`. Add an early return if `isSavingOutcome` is true so programmatic calls match the disabled-button safety rule.

- [ ] **Step 4: Remove the duplicate editor-shell badge and join the visual surfaces**

Remove the `VimModeBadge` import and top mode badge from `VimEditor.vue`. Render the focus notice only when unfocused so there is no empty row while typing. Style the practice frame so the CodeMirror panel and footer share the approved background, border radius, and boundary. Keep mode, timer, and restart visible without horizontal scrolling at the existing mobile breakpoint.

- [ ] **Step 5: Record the approved narrow scope amendment**

Update the relevant existing sections, without rewriting unrelated requirements:

- `docs/product-spec.md`: editable practice questions autofocus once at the supplied cursor; footer shows mode, elapsed time, and restart.
- `docs/architecture.md`: CodeMirror theme/autofocus remain editor responsibilities; timer and restart orchestration remain under the practice feature.
- `docs/acceptance-criteria.md`: add observable focus, mode, timer, and restart criteria, including no automatic attempt creation.

- [ ] **Step 6: Run focused tests, the full suite, build, and E2E**

Run:

```bash
npm run test -- src/components/editor/VimEditor.test.ts src/features/practice/components/PracticeEditorStatusBar.test.ts src/features/practice/composables/use-attempt-elapsed-time.test.ts
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
```

Expected: all commands pass in every configured browser. Existing non-failing build warnings may be reported but may not replace a successful exit code.

- [ ] **Step 7: Update this plan and commit Task 3**

Mark every verified checkbox in this plan complete only after the corresponding evidence exists, then commit the complete integration:

```bash
git add src/features/practice/pages/PracticePage.vue src/components/editor/VimEditor.vue src/components/editor/VimEditor.test.ts tests/e2e/scoring-feedback.spec.ts docs/product-spec.md docs/architecture.md docs/acceptance-criteria.md docs/superpowers/plans/2026-07-16-practice-editor-experience.md
git commit -m "feat: integrate focused practice editor controls"
```

---

## Final Acceptance

- [ ] Confirm the working tree contains no unintended files or secrets with `git status --short` and `git diff --check`.
- [ ] Run a fresh final `npm run type-check`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e` after the last commit.
- [ ] Verify the deployed production site only if the user separately authorizes deployment; local implementation completion does not imply deployment permission.
