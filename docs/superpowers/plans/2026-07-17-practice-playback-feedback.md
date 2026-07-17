# Practice Playback Feedback Implementation Plan（已取代）

> 本計畫已被 `2026-07-17-practice-feedback-simplification.md` 取代。播放功能已移除，請以新計畫與簡化回饋設計為準。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 Level 4 播放、成功後編輯器與完成後 Vim 按鍵解說符合已核准的 UX 設計。

**Architecture:** 維持 `PracticePage` 作為練習狀態與播放重設的 orchestration owner。播放元件移到編輯器附近，只讀取題目的 `expectedContent`，不修改 CodeMirror 或建立 Attempt；完成回饋從標準化操作產生只包含實際使用 Vim 按鍵的解說資料。

**Tech Stack:** Vue 3, TypeScript, CodeMirror 6, Vitest, Vue Test Utils, Playwright.

## Global Constraints

- 不修改評分、題目判定、Attempt 資料庫 schema、IndexedDB 或 Supabase 同步契約。
- 播放預設按鍵間隔為 `600ms`，測試可透過 `stepDelayMs` 覆寫。
- 播放只顯示完成後內容，不顯示操作前內容或 diff 標記。
- 播放動畫不得建立成功或失敗 Attempt。
- Vim 按鍵解說只在完成回饋顯示，使用 `<details>` 且預設收合。
- Vim 按鍵解說只列出本次使用者 `NormalizedAction[]` 實際用到的按鍵；插入的任意程式碼文字不列為 Vim 按鍵。
- 不使用 `any`、TODO、跳過測試或停用型別／Lint 規則。
- 每個 Task 先寫失敗測試、確認 RED，再寫最小實作並確認 GREEN。
- 每個 Task 完成後執行 `npm run type-check`、`npm run lint`、`npm run test`、`npm run build`；影響練習主流程時執行 `npm run test:e2e`。

---

### Task 1: 產生實際使用按鍵的解說資料

**Files:**

- Create: `src/features/practice/services/vim-key-guide.ts`
- Test: `src/features/practice/services/vim-key-guide.test.ts`
- Modify: `src/features/practice/services/attempt-outcome-service.ts`
- Test: `src/features/practice/services/attempt-outcome-service.test.ts`

**Interfaces:**

- Consumes: `NormalizedAction[]` from `src/types/attempt.ts`.
- Produces:

```ts
export interface VimKeyExplanation {
  key: string;
  description: string;
}

export function explainUsedVimKeys(
  actions: readonly NormalizedAction[],
): VimKeyExplanation[];
```

`AttemptFeedback` adds `normalizedActions: NormalizedAction[]` for presentation only. The persisted `AttemptSyncInput` remains unchanged.

- [x] **Step 1: Write the failing service tests**

Add tests for:

```ts
it("returns unique Vim keys in first-use order", () => {
  expect(explainUsedVimKeys([
    { type: "vim_command", command: "ciw" },
    { type: "insert_text", text: "name", textLength: 4 },
    { type: "mode_change", mode: "normal" },
    { type: "undo" },
  ])).toEqual([
    { key: "c", description: "修改操作" },
    { key: "i", description: "進入 Insert Mode" },
    { key: "w", description: "移動到下一個單字開頭" },
    { key: "Esc", description: "回到 Normal Mode" },
    { key: "u", description: "復原上一個變更" },
  ]);
});

it("does not turn inserted program text into Vim key explanations", () => {
  expect(explainUsedVimKeys([
    { type: "insert_text", text: "customerName", textLength: 12 },
  ])).toEqual([]);
});

it("keeps unknown valid command keys as labels without failing", () => {
  expect(explainUsedVimKeys([
    { type: "vim_command", command: "z" },
  ])).toEqual([{ key: "z", description: "本題使用的 Vim 按鍵" }]);
});
```

Add an outcome test asserting `feedback.normalizedActions` is a copied array and the existing Attempt payload is unchanged.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm run test -- src/features/practice/services/vim-key-guide.test.ts src/features/practice/services/attempt-outcome-service.test.ts
```

Expected: FAIL because `vim-key-guide.ts` does not exist and `AttemptFeedback` does not yet expose `normalizedActions`.

- [x] **Step 3: Implement the minimal key explanation service**

Implement `explainUsedVimKeys` with a stable ordered `Map` of known Vim key descriptions. Tokenize `vim_command` strings into individual keys, treat `<Esc>` as `Esc`, convert `mode_change` to the mode key (`Esc` for Normal and the existing display label for other modes), convert `undo` to `u`, and convert search actions to `/`, `?`, and `Enter`. Ignore `insert_text` and `reset`. De-duplicate by `key` while preserving first occurrence. Return the fallback description for a key not present in the map.

Extend `AttemptFeedback` with a copied `normalizedActions` array and populate it from the existing normalized action copy in `createAttemptOutcome`. Do not add it to `AttemptSyncInput`.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm run test -- src/features/practice/services/vim-key-guide.test.ts src/features/practice/services/attempt-outcome-service.test.ts
```

Expected: PASS with all existing outcome assertions unchanged.

- [x] **Step 5: Commit the task**

```bash
git add src/features/practice/services/vim-key-guide.ts src/features/practice/services/vim-key-guide.test.ts src/features/practice/services/attempt-outcome-service.ts src/features/practice/services/attempt-outcome-service.test.ts
git commit -m "feat: explain used vim keys in feedback"
```

- [x] **Step 6: Run task verification**

Run:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

Expected: all commands exit 0.

---

### Task 2: 顯示完成後按鍵解說並保留成功後編輯器

**Files:**

- Create: `src/features/practice/components/VimKeyGuide.vue`
- Test: `src/features/practice/components/VimKeyGuide.test.ts`
- Modify: `src/components/feedback/ExerciseFeedback.vue`
- Test: `src/components/feedback/ExerciseFeedback.test.ts`
- Modify: `src/features/practice/pages/PracticePage.vue`

**Interfaces:**

- Consumes: `AttemptFeedback.normalizedActions`, `VimKeyExplanation[]`, and the existing `PracticePage` snapshot state.
- Produces: a collapsed `VimKeyGuide` section in completed feedback; the existing editor workspace remains rendered while feedback is present.

- [x] **Step 1: Write failing component tests**

Add `VimKeyGuide.test.ts` tests that mount with two repeated keys and one unused key, assert the `<details>` element is closed by default, and assert only the two used keys render after reading the guide content. Add `ExerciseFeedback.test.ts` assertions that the guide is present but closed and does not render a key that is absent from `normalizedActions`.

Add a practice-page regression assertion through the existing E2E fixture or a focused component harness: when `feedback` exists, `.practice-workspace`, `.cm-content`, and the completion feedback article all exist together.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm run test -- src/features/practice/components/VimKeyGuide.test.ts src/components/feedback/ExerciseFeedback.test.ts
```

Expected: FAIL because `VimKeyGuide` does not exist, `ExerciseFeedback` has no normalized action prop, and the practice workspace is currently hidden when feedback is shown.

- [x] **Step 3: Implement the key guide and feedback integration**

Create `VimKeyGuide.vue` with props:

```ts
defineProps<{
  actions: readonly NormalizedAction[];
}>();
```

Call `explainUsedVimKeys` in the component, render a closed `<details>` with summary `本題按鍵解說`, and render each `{ key, description }` as an accessible list item. If no Vim keys were used, render the summary and a short `本題沒有可解說的 Vim 按鍵。` message instead of an empty list.

Add `normalizedActions: readonly NormalizedAction[]` to `ExerciseFeedbackProps` and render `VimKeyGuide` after the solution comparison and before the next-question button. Update `PracticePage` to pass `feedback.normalizedActions`.

Change the workspace condition from `exercise && snapshot && !feedback` to `exercise && snapshot`. Keep the editor state and completed snapshot visible while feedback renders below it. Disable the restart control when `feedback !== null` and hide the skip action while feedback exists so the completed result cannot be mutated through practice controls. Keep the existing `feedback !== null` auto-completion guard and next-question flow.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm run test -- src/features/practice/components/VimKeyGuide.test.ts src/components/feedback/ExerciseFeedback.test.ts src/features/practice/services/attempt-outcome-service.test.ts
```

Expected: PASS, including all existing feedback ordering, accessibility, and metric explanation tests.

- [x] **Step 5: Commit the task**

```bash
git add src/features/practice/components/VimKeyGuide.vue src/features/practice/components/VimKeyGuide.test.ts src/components/feedback/ExerciseFeedback.vue src/components/feedback/ExerciseFeedback.test.ts src/features/practice/pages/PracticePage.vue
git commit -m "feat: keep editor visible in completed feedback"
```

- [x] **Step 6: Run task verification**

Run:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

Expected: all commands exit 0.

---

### Task 3: 將播放移到編輯器附近並放慢播放

**Files:**

- Modify: `src/features/practice/components/EditorPlayback.vue`
- Create: `src/features/practice/components/EditorPlayback.test.ts`
- Modify: `src/features/practice/components/ProgressiveHintPanel.vue`
- Modify: `src/features/practice/components/ProgressiveHintPanel.test.ts`
- Modify: `src/features/practice/pages/PracticePage.vue`
- Modify: `tests/e2e/scoring-feedback.spec.ts`

**Interfaces:**

- Consumes: Level 4 hint command, `PracticeExercise.expectedContent`, existing `highestLevelChanged`, and existing reset event flow.
- Produces: `EditorPlayback` with `command`, `completedContent`, optional `stepDelayMs`, and `playbackComplete`; playback is rendered by `PracticePage` within `.practice-editor-frame`.

- [x] **Step 1: Write failing playback tests**

Create `EditorPlayback.test.ts` with fake timers and a `scrollIntoView` spy. Assert:

```ts
it("scrolls the playback block into view before starting", async () => {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  const wrapper = mount(EditorPlayback, {
    props: { command: "ciw", completedContent: "const value = true;" },
  });

  await wrapper.get('[data-testid="start-playback"]').trigger("click");

  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: "smooth",
    block: "center",
  });
  expect(wrapper.get('[data-testid="playback-completed-content"]').text()).toContain(
    "const value = true;",
  );
});
```

Assert the default playback does not finish before `600ms * tokenCount`, and accepts a shorter `stepDelayMs` in tests. Update `ProgressiveHintPanel.test.ts` to assert Level 4 still unlocks but no longer mounts `EditorPlayback`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm run test -- src/features/practice/components/EditorPlayback.test.ts src/features/practice/components/ProgressiveHintPanel.test.ts
```

Expected: FAIL because `completedContent`, scrolling, the 600ms default, and the new parent-owned playback placement do not exist.

- [x] **Step 3: Implement the playback behavior**

Update `EditorPlayback.vue`:

- Rename the content prop to `completedContent` and render it in a readonly `<pre data-testid="playback-completed-content">` block.
- Use `stepDelayMs: 600` by default.
- Add a root element ref and call `scrollIntoView({ behavior: "smooth", block: "center" })` at the start of `startPlayback()` before changing `isPlaying`.
- Preserve token highlighing, `playbackComplete`, timer cleanup, and no-op behavior while already playing.

Remove the nested `EditorPlayback` import and render from `ProgressiveHintPanel.vue`; keep Level 4 content and sequential unlocking intact.

In `PracticePage.vue`, compute the Level 4 hint, render `EditorPlayback` inside `.practice-editor-frame` when `highestHintLevel === 4`, pass `completedContent="exercise.expectedContent"`, and handle `@playback-complete="resetExercise"`. This keeps the highlighted keys and completed preview next to the active editor. The existing reset function remains the only post-playback reset path.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm run test -- src/features/practice/components/EditorPlayback.test.ts src/features/practice/components/ProgressiveHintPanel.test.ts src/features/practice/services/attempt-outcome-service.test.ts src/components/feedback/ExerciseFeedback.test.ts
```

Expected: PASS with no Attempt behavior changes.

- [x] **Step 5: Update and run the end-to-end regression**

Update `tests/e2e/scoring-feedback.spec.ts` to verify:

1. Level 4 reveals the playback near `.practice-editor-frame`.
2. `完成後內容` is visible and contains the expected code.
3. Clicking `播放操作` shows a highlighted `kbd[aria-current="step"]` near the editor and does not create an Attempt.
4. After the slower playback completes, the reset message appears and the editor remains visible.
5. After completing the exercise, `.practice-workspace` and the completion feedback article are both visible.
6. The feedback guide is closed by default and, after opening, only includes keys used by the test operation.

Run:

```bash
npm run test:e2e -- tests/e2e/scoring-feedback.spec.ts
```

Expected: PASS in the configured Playwright browser projects.

- [x] **Step 6: Commit the task**

```bash
git add src/features/practice/components/EditorPlayback.vue src/features/practice/components/EditorPlayback.test.ts src/features/practice/components/ProgressiveHintPanel.vue src/features/practice/components/ProgressiveHintPanel.test.ts src/features/practice/pages/PracticePage.vue tests/e2e/scoring-feedback.spec.ts
git commit -m "feat: improve practice playback visibility"
```

- [x] **Step 7: Run complete verification**

Run:

```bash
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
```

Expected: all commands exit 0 with no skipped or newly flaky tests.

---

### Task 4: 同步實作計畫與交付檢查

**Files:**

- Modify: `docs/implementation-plan.md`

**Interfaces:**

- Consumes: verified behavior from Tasks 1–3.
- Produces: a checked-off Phase 12 UX task with the actual commit references and verification status recorded in the completion report.

- [x] **Step 1: Add the verified Phase 12 checkbox block**

Append a Phase 12 task describing the playback visibility, completed-editor retention, and used-key guide requirements. Mark its checkboxes only after Task 3's complete verification passes.

- [x] **Step 2: Re-run the full required commands after documentation update**

Run:

```bash
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
```

Expected: all commands exit 0.

- [x] **Step 3: Commit the plan synchronization**

```bash
git add docs/implementation-plan.md
git commit -m "docs: track practice playback feedback UX"
```

## Completion Checklist

- [x] Playback auto-scrolls smoothly and uses the 600ms default delay.
- [x] Playback shows only completed content and keeps the highlighted keys near the editor.
- [x] Playback completion resets the exercise without an Attempt.
- [x] Successful feedback leaves the editor visible with completed content.
- [x] Completed feedback has a collapsed key guide containing only used Vim keys.
- [x] Type-check, lint, unit tests, build, and E2E all pass.
- [x] Existing user worktree changes remain unstaged and unmodified.
