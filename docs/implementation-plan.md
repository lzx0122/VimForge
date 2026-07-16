# Vim Practice Platform Implementation Plan

> **For agentic workers:** Execute one Task at a time. Use test-driven development and create a review checkpoint after every Task.

**Goal:** 建立可部署至 Vercel、使用 Supabase 與 IndexedDB 的瀏覽器版 Vim 反覆練習平台。

**Architecture:** Vue 3 SPA 負責 CodeMirror Vim 練習與即時判定；Domain Modules 負責評分、熟練與選題；IndexedDB 提供訪客與離線保存；Supabase 提供 Auth、題庫、使用者資料、RLS 與 Transaction Functions。

**Tech Stack:** Vue 3, TypeScript, Vite, Vue Router, Pinia, CodeMirror 6, `@replit/codemirror-vim`, Supabase, IndexedDB, Vitest, Vue Test Utils, Playwright, Vercel.

## Global Constraints

- 所有單元自由進入。
- 三種模式固定為 `beginner`、`memory_review`、`efficiency`。
- 題量固定為 `5 | 10 | 20`。
- 不新增自訂後端。
- 不新增遊戲化、排行榜、付費與外掛。
- 核心 Domain 不依賴 Vue、CodeMirror、Supabase。
- 每個 Task 均先測試後實作。
- 每個 Task 結束均執行 type-check、lint、test、build。

---

## Phase 0：專案基礎

### Task 0.1：初始化 Vue 專案與品質工具

**Files:**

- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `eslint.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `vercel.json`
- Create: `.env.example`
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/style.css`
- Create: `tests/e2e/smoke.spec.ts`

**Produces:**

- 可啟動的 Vue 3 + TypeScript SPA。
- `npm run type-check`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

- [x] 建立 Vue 3 + TypeScript + Vite 專案。
- [x] 安裝 Vue Router、Pinia、CodeMirror 6、`@replit/codemirror-vim`、Supabase JS、Vitest、Vue Test Utils、Playwright、ESLint。
- [x] 設定 scripts，與 `testing-strategy.md` 一致。
- [x] 建立 `vercel.json` SPA rewrite。
- [x] 建立 Smoke Test，驗證首頁顯示 `Vim Practice`。
- [x] 執行所有驗證。
- [x] Commit：`chore: initialize vim practice app`

### Task 0.2：建立共用型別與資料驗證

**Files:**

- Create: `src/types/learning.ts`
- Create: `src/types/exercise.ts`
- Create: `src/types/attempt.ts`
- Create: `src/types/session.ts`
- Create: `src/types/index.ts`
- Test: `src/types/types.test.ts`

**Interfaces:**

- Produces: `LearningMode`, `QuestionCount`, `VimMode`, `ExerciseSource`, `CursorPosition`, `ExerciseDefinition`, `AttemptDraft`.

- [x] 寫型別編譯測試與 runtime validation 測試。
- [x] 建立固定 Union Types。
- [x] 建立 Completion Rule discriminated unions。
- [x] 禁止 `any`。
- [x] 執行驗證。
- [x] Commit：`feat: define shared learning types`

### Task 0.3：建立 App Shell 與 Router

**Files:**

- Create: `src/app/router/index.ts`
- Create: `src/app/layouts/AppLayout.vue`
- Create: `src/components/common/AppHeader.vue`
- Create: `src/components/common/AppNavigation.vue`
- Create: `src/features/home/pages/HomePage.vue`
- Create: `src/features/course/pages/CoursesPage.vue`
- Create: `src/features/course/pages/CourseUnitPage.vue`
- Create: `src/features/practice/pages/PracticeSetupPage.vue`
- Create: `src/features/practice/pages/PracticePage.vue`
- Create: `src/features/practice/pages/PracticeResultPage.vue`
- Create: `src/features/review/pages/ReviewPage.vue`
- Create: `src/features/progress/pages/ProgressPage.vue`
- Create: `src/features/settings/pages/SettingsPage.vue`
- Create: `src/features/auth/pages/AuthCallbackPage.vue`
- Create: `src/features/errors/pages/NotFoundPage.vue`
- Test: `src/app/router/router.test.ts`

- [x] 寫 Router Test，驗證所有規格路由存在。
- [x] 建立 Layout 與 Placeholder Pages。
- [x] 404 Route 必須在最後。
- [x] 執行 Playwright 深層路由 Smoke Test。
- [x] Commit：`feat: add application shell and routes`

---

## Phase 1：模式、題量與課程 UI

### Task 1.1：首頁三種學習模式

**Files:**

- Create: `src/features/home/components/LearningModeCard.vue`
- Create: `src/features/home/components/LearningModeGrid.vue`
- Modify: `src/features/home/pages/HomePage.vue`
- Test: `src/features/home/components/LearningModeGrid.test.ts`

**Produces:**

```ts
export interface LearningModeSelection {
  mode: LearningMode;
}
```

- [x] 測試顯示三張卡片。
- [x] 測試鍵盤可選取。
- [x] 選擇後導向 `/practice/setup?mode=<mode>`。
- [x] 不要求登入。
- [x] Commit：`feat: add learning mode selection`

### Task 1.2：題量與練習來源選擇

**Files:**

- Create: `src/features/practice/components/QuestionCountSelector.vue`
- Create: `src/features/practice/components/PracticeSourceSelector.vue`
- Create: `src/features/practice/components/TopicSelector.vue`
- Modify: `src/features/practice/pages/PracticeSetupPage.vue`
- Test: `src/features/practice/pages/PracticeSetupPage.test.ts`

- [x] 顯示 5、10、20，預設 10。
- [x] `memory_review` 顯示「今日複習／指定主題」。
- [x] `efficiency` 顯示題量與可選主題。
- [x] `beginner` 顯示課程單元入口，不強制題量。
- [x] Commit：`feat: add practice setup options`

### Task 1.3：自由課程地圖

**Files:**

- Create: `src/features/course/components/CourseUnitCard.vue`
- Create: `src/features/course/data/static-units.ts`
- Modify: `src/features/course/pages/CoursesPage.vue`
- Test: `src/features/course/pages/CoursesPage.test.ts`

- [x] 建立十個單元靜態資料。
- [x] 所有單元都有可操作按鈕。
- [x] 不出現鎖定狀態。
- [x] 顯示先備技能文字，但不阻止進入。
- [x] Commit：`feat: add freely accessible course map`

---

## Phase 2：CodeMirror Vim 練習器

### Task 2.1：建立 VimEditor Adapter

**Files:**

- Create: `src/components/editor/VimEditor.vue`
- Create: `src/components/editor/editor-types.ts`
- Create: `src/components/editor/language-loader.ts`
- Test: `src/components/editor/VimEditor.test.ts`

**Produces:**

- `contentChanged`
- `cursorChanged`
- `modeChanged`
- `actionRecorded`
- `editorReady`

- [x] 先測試 Props 與 Emits 契約。
- [x] 動態建立 EditorView。
- [x] `vim()` Extension 排在其他 keymaps 前。
- [x] 初始化內容與游標。
- [x] unmount 時銷毀 EditorView。
- [x] Commit：`feat: add codemirror vim editor adapter`

### Task 2.2：Vim Mode 與焦點狀態

**Files:**

- Create: `src/components/editor/VimModeBadge.vue`
- Create: `src/components/editor/EditorFocusNotice.vue`
- Modify: `src/components/editor/VimEditor.vue`
- Test: `src/components/editor/VimModeBadge.test.ts`

- [x] 顯示 Normal、Insert、Visual。
- [x] 編輯器失去焦點時顯示「點擊編輯器以繼續」。
- [x] Mode 改變時 emit。
- [x] Commit：`feat: expose vim mode and focus state`

### Task 2.3：每題建立全新 Editor State

**Files:**

- Create: `src/components/editor/create-editor-state.ts`
- Modify: `src/components/editor/VimEditor.vue`
- Test: `src/components/editor/create-editor-state.test.ts`

- [x] 題目 ID 改變時銷毀舊 View 並建立新 View。
- [x] Undo 歷史不能跨題。
- [x] Search、Visual、Pending Operator 不能跨題。
- [x] Commit：`fix: isolate editor state between exercises`

---

## Phase 3：操作記錄與題目判定

### Task 3.1：CommandNormalizer

**Files:**

- Create: `src/domain/exercise/command-normalizer.ts`
- Test: `src/domain/exercise/command-normalizer.test.ts`

**Produces:**

```ts
export function normalizeCommandInput(
  events: CommandInputEvent[],
): NormalizedAction[];
```

- [x] 測試 `d i "` 合併為 `di"`。
- [x] 測試 `2 d w` 正規化為等價操作。
- [x] 測試 Insert 文字合併。
- [x] 測試 Escape 轉為 Mode Change。
- [x] 不保存瀏覽器無關按鍵。
- [x] Commit：`feat: normalize vim command actions`

### Task 3.2：ExerciseEvaluator

**Files:**

- Create: `src/domain/exercise/exercise-evaluator.ts`
- Test: `src/domain/exercise/exercise-evaluator.test.ts`

**Produces:**

```ts
export function evaluateExercise(
  exercise: ExerciseDefinition,
  snapshot: EditorSnapshot,
): ExerciseEvaluation;
```

- [x] exact content success/failure。
- [x] unchanged content success/failure。
- [x] CRLF 正規化為 LF。
- [x] cursor ignore/exact/range。
- [x] requiredMode。
- [x] unmetConditions 可供 UI 顯示。
- [x] Commit：`feat: evaluate exercise completion`

### Task 3.3：SolutionMatcher

**Files:**

- Create: `src/domain/exercise/solution-matcher.ts`
- Test: `src/domain/exercise/solution-matcher.test.ts`

- [x] recommended exact match。
- [x] accepted match。
- [x] valid but inefficient。
- [x] unknown valid。
- [x] 結果正確時未知序列不得判錯。
- [x] Commit：`feat: compare user and recommended solutions`

### Task 3.4：Progressive Hint

**Files:**

- Create: `src/features/practice/components/ProgressiveHintPanel.vue`
- Create: `src/features/practice/components/EditorPlayback.vue`
- Test: `src/features/practice/components/ProgressiveHintPanel.test.ts`

- [x] Level 1–4 依序顯示。
- [x] 記錄最高層級。
- [x] Level 4 播放後 emit `requestReset`。
- [x] 動畫不能 emit 完成。
- [x] Commit：`feat: add progressive exercise hints`

---

## Phase 4：速度、準確、熟練

### Task 4.1：ScoringCalculator

**Files:**

- Create: `src/domain/scoring/scoring-config.ts`
- Create: `src/domain/scoring/scoring-calculator.ts`
- Test: `src/domain/scoring/scoring-calculator.test.ts`

**Produces:**

```ts
export function calculateAttemptScore(
  input: AttemptScoreInput,
): ScoreResult;
```

- [x] 按鍵效率 60%。
- [x] 時間效率 40%。
- [x] 模式時間寬限。
- [x] 未完成速度 0。
- [x] 準確扣分表。
- [x] 最高 Hint only。
- [x] performanceQuality 0–5。
- [x] Commit：`feat: calculate speed and accuracy scores`

### Task 4.2：MasteryCalculator

**Files:**

- Create: `src/domain/mastery/mastery-config.ts`
- Create: `src/domain/mastery/mastery-calculator.ts`
- Test: `src/domain/mastery/mastery-calculator.test.ts`

- [x] 品質變化表。
- [x] 模式倍率。
- [x] 提示倍率。
- [x] 情境倍率。
- [x] 技能權重。
- [x] 0–100 clamp。
- [x] Level 3/4/5 最低條件。
- [x] 高等級單次失敗保護。
- [x] Commit：`feat: calculate long-term skill mastery`

### Task 4.3：ReviewScheduler

**Files:**

- Create: `src/domain/review/review-scheduler.ts`
- Test: `src/domain/review/review-scheduler.test.ts`

- [x] Level 基礎間隔。
- [x] 品質倍率。
- [x] 提示最長間隔。
- [x] 最大 30 天。
- [x] 失敗安排 10 分鐘後或本輪尾端。
- [x] Commit：`feat: schedule adaptive exercise reviews`

### Task 4.4：單題結果 UI

**Files:**

- Create: `src/components/feedback/MetricCard.vue`
- Create: `src/components/feedback/ExerciseFeedback.vue`
- Test: `src/components/feedback/ExerciseFeedback.test.ts`

- [x] 順序：完成、準確、速度、熟練、解法。
- [x] 新手模式弱化速度。
- [x] 效率模式顯示按鍵差距。
- [x] 無障礙文字標籤。
- [x] Commit：`feat: display exercise performance feedback`

---

## Phase 5：練習工作階段與 IndexedDB

### Task 5.1：Practice Store

**Files:**

- Create: `src/stores/practice-store.ts`
- Create: `src/features/practice/services/practice-session-service.ts`
- Test: `src/stores/practice-store.test.ts`

- [x] 建立題組。
- [x] 追蹤 currentIndex。
- [x] 保存 AttemptDraft。
- [x] complete/skip/reset。
- [x] 不保存 EditorView。
- [x] Commit：`feat: manage practice session state`

### Task 5.2：IndexedDB Database

**Files:**

- Create: `src/infrastructure/indexed-db/database.ts`
- Create: `src/infrastructure/indexed-db/attempt-repository.ts`
- Create: `src/infrastructure/indexed-db/session-repository.ts`
- Create: `src/infrastructure/indexed-db/settings-repository.ts`
- Test: `src/infrastructure/indexed-db/indexed-db.test.ts`

- [ ] 使用原生 IndexedDB。
- [ ] Object Stores：attempts、sessions、settings、metadata。
- [ ] Attempt 使用 clientAttemptId。
- [ ] 支援 syncStatus pending/synced。
- [ ] Transaction 測試。
- [ ] Commit：`feat: persist guest progress in indexeddb`

### Task 5.3：中途恢復

**Files:**

- Create: `src/features/practice/components/ResumeSessionDialog.vue`
- Modify: `src/features/practice/pages/PracticePage.vue`
- Test: `src/features/practice/components/ResumeSessionDialog.test.ts`
- E2E: `tests/e2e/resume-session.spec.ts`

- [ ] 重新整理後發現 active session。
- [ ] 可恢復或放棄。
- [ ] 未完成單題可恢復內容或重設。
- [ ] 不自動算失敗。
- [ ] Commit：`feat: resume interrupted practice sessions`

---

## Phase 6：Supabase 題庫與安全

### Task 6.1：Supabase Client

**Files:**

- Create: `src/infrastructure/supabase/client.ts`
- Create: `src/infrastructure/supabase/env.ts`
- Create: `src/infrastructure/supabase/database.types.ts`
- Modify: `.env.example`
- Test: `src/infrastructure/supabase/env.test.ts`

- [ ] 驗證 URL 與 Publishable Key。
- [ ] 缺少環境變數時顯示明確錯誤。
- [ ] 不接受 Service Role 變數。
- [ ] Commit：`feat: configure supabase browser client`

### Task 6.2：Catalog Migration

**Files:**

- Create: `supabase/migrations/20260716000100_create_catalog.sql`
- Create: `supabase/seed.sql`
- Create: `scripts/validate-seed.ts`
- Test: `scripts/validate-seed.test.ts`

- [ ] 建立 units、skills、exercises、solutions、hints。
- [ ] Constraints 與 indexes。
- [ ] RLS。
- [ ] 先 Seed 10 個 Units、最小 10 題作流程驗證。
- [ ] Seed Validator 通過後再擴到約 100 題。
- [ ] Commit：`feat: add supabase exercise catalog`

### Task 6.3：Catalog Repository

**Files:**

- Create: `src/features/course/repositories/course-repository.ts`
- Create: `src/features/practice/repositories/exercise-repository.ts`
- Create: `src/infrastructure/supabase/supabase-course-repository.ts`
- Create: `src/infrastructure/supabase/supabase-exercise-repository.ts`
- Test: `src/infrastructure/supabase/catalog-repositories.test.ts`

- [ ] Domain 依賴 Repository Interface。
- [ ] Supabase DTO 轉 Domain。
- [ ] 不一次載入 100 題完整內容。
- [ ] Commit：`feat: load published curriculum from supabase`

### Task 6.4：User Learning Migration 與 RLS

**Files:**

- Create: `supabase/migrations/20260716000200_create_user_learning.sql`
- Create: `supabase/migrations/20260716000300_add_user_learning_rls.sql`
- Create: `supabase/tests/rls_user_learning.sql`

- [ ] 建立 profiles、settings、sessions、attempts、progress、mastery、reviews、guest_imports。
- [ ] 所有 exposed tables 啟用 RLS。
- [ ] A 無法存取 B。
- [ ] Attempts 不提供一般 delete policy。
- [ ] Commit：`feat: add secure user learning schema`

---

## Phase 7：Google Auth 與同步

### Task 7.1：Google OAuth

**Files:**

- Create: `src/features/auth/services/auth-service.ts`
- Create: `src/stores/auth-store.ts`
- Create: `src/features/auth/components/GoogleSignInButton.vue`
- Modify: `src/features/auth/pages/AuthCallbackPage.vue`
- Test: `src/features/auth/services/auth-service.test.ts`

- [ ] 使用 Supabase `signInWithOAuth({ provider: "google" })`。
- [ ] Redirect URL 使用目前 origin + `/auth/callback`。
- [ ] 維持 Session。
- [ ] 登出清除雲端身分但不刪本機資料。
- [ ] Commit：`feat: add google authentication`

### Task 7.2：Record Attempt Function

**Files:**

- Create: `supabase/migrations/20260716000400_add_record_attempt_function.sql`
- Create: `src/features/practice/repositories/attempt-sync-repository.ts`
- Create: `src/infrastructure/supabase/supabase-attempt-sync-repository.ts`
- Test: `src/infrastructure/supabase/attempt-sync.test.ts`

- [ ] Function 由 auth.uid 決定 user。
- [ ] clientAttemptId 去重。
- [ ] Transaction 更新所有摘要。
- [ ] RPC 使用 `security invoker`，所有寫入仍受 RLS。
- [ ] 不接受前端 user_id；以 auth.uid() 決定擁有者。
- [ ] revoke from public、anon；只 grant authenticated。
- [ ] Commit：`feat: record attempts transactionally`

### Task 7.3：Guest Sync Queue

**Files:**

- Create: `src/features/guest-sync/services/guest-sync-service.ts`
- Create: `src/stores/sync-store.ts`
- Create: `src/components/common/OfflineSyncBanner.vue`
- Test: `src/features/guest-sync/services/guest-sync-service.test.ts`
- E2E: `tests/e2e/offline-sync.spec.ts`

- [ ] 完成題目先本機。
- [ ] 登入後批次同步。
- [ ] 成功標記 synced。
- [ ] 失敗保留 pending。
- [ ] 網路恢復重試。
- [ ] 下一題不受阻。
- [ ] Commit：`feat: sync guest attempts after login`

---

## Phase 8：選題與複習

### Task 8.1：PracticeSelector

**Files:**

- Create: `src/domain/review/practice-selector.ts`
- Test: `src/domain/review/practice-selector.test.ts`

- [ ] 5 題 3/1/1。
- [ ] 10 題 7/2/1。
- [ ] 20 題 14/4/2。
- [ ] 題目不足遞補。
- [ ] 同一 Exercise 不重複。
- [ ] 只出已接觸技能。
- [ ] Commit：`feat: select adaptive review exercises`

### Task 8.2：今日複習頁

**Files:**

- Create: `src/features/review/components/DailyReviewSummary.vue`
- Create: `src/features/review/components/WeakSkillList.vue`
- Modify: `src/features/review/pages/ReviewPage.vue`
- Test: `src/features/review/pages/ReviewPage.test.ts`

- [ ] 顯示到期數。
- [ ] 顯示主要加強技能。
- [ ] 可選 5/10/20。
- [ ] 無紀錄時推薦基礎題組。
- [ ] Commit：`feat: add daily adaptive review flow`

### Task 8.3：指定主題練習

**Files:**

- Modify: `src/features/practice/components/TopicSelector.vue`
- Create: `src/features/review/services/topic-practice-service.ts`
- Test: `src/features/review/services/topic-practice-service.test.ts`

- [ ] 一個或多個主題。
- [ ] 不清除到期題。
- [ ] 優先尚未熟練題。
- [ ] 同日重複提升倍率遞減。
- [ ] Commit：`feat: add topic-focused practice`

---

## Phase 9：進度與設定

### Task 9.1：進度頁

**Files:**

- Create: `src/features/progress/components/SkillMasteryList.vue`
- Create: `src/features/progress/components/UnitProgressGrid.vue`
- Create: `src/features/progress/components/RecentAttempts.vue`
- Modify: `src/features/progress/pages/ProgressPage.vue`
- Test: `src/features/progress/pages/ProgressPage.test.ts`

- [ ] 顯示技能 0–5。
- [ ] 顯示單元完成度。
- [ ] 顯示最近錯誤。
- [ ] 顯示待複習。
- [ ] 不顯示 XP、排名。
- [ ] Commit：`feat: add learning progress dashboard`

### Task 9.2：設定頁

**Files:**

- Create: `src/stores/settings-store.ts`
- Modify: `src/features/settings/pages/SettingsPage.vue`
- Test: `src/features/settings/pages/SettingsPage.test.ts`

- [ ] 字體大小 12–28。
- [ ] 行號。
- [ ] 按鍵顯示。
- [ ] 音效。
- [ ] 預設題量。
- [ ] 訪客保存 IndexedDB。
- [ ] 登入使用者同步 Supabase。
- [ ] Commit：`feat: add editor and practice settings`

---

## Phase 10：題庫完成、E2E 與部署

### Task 10.1：完成約 100 題 Seed

**Files:**

- Modify: `supabase/seed.sql`
- Modify: `scripts/validate-seed.ts`
- Create: `docs/exercise-authoring-guide.md`

- [ ] 題數約 100。
- [ ] C# 約 60%。
- [ ] TypeScript/JavaScript 約 20%。
- [ ] 其他約 20%。
- [ ] 每題游標合法。
- [ ] 每題有 Skill、Solution、Hints。
- [ ] Seed Validator 全部通過。
- [ ] Commit：`content: add mvp vim exercise catalog`

### Task 10.2：完整 E2E

**Files:**

- Create: `tests/e2e/guest-practice.spec.ts`
- Create: `tests/e2e/course-navigation.spec.ts`
- Create: `tests/e2e/scoring-feedback.spec.ts`
- Create: `tests/e2e/review-selection.spec.ts`
- Create: `tests/e2e/auth-sync.spec.ts`
- Create: `tests/e2e/deep-linking.spec.ts`

- [ ] 覆蓋 acceptance criteria 主要流程。
- [ ] Chrome、Firefox、WebKit。
- [ ] 修正所有 flaky test。
- [ ] Commit：`test: cover mvp user journeys`

### Task 10.3：Production Readiness

**Files:**

- Create: `docs/deployment.md`
- Create: `docs/operations.md`
- Modify: `README.md`
- Modify: `vercel.json`

- [ ] Vercel env 設定文件。
- [ ] Supabase Redirect URL 文件。
- [ ] Google OAuth origins 與 callback 文件。
- [ ] RLS 驗證。
- [ ] Production Build。
- [ ] Vercel Deep Link。
- [ ] 錯誤監控最低限度 console + user-safe message。
- [ ] Commit：`docs: add production deployment guide`

---

## Final Verification

```bash
npm ci
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
```

另外驗證：

- Supabase migrations 可從空資料庫依序執行。
- Seed Validator 通過。
- RLS 測試通過。
- Vercel Preview 可直接開啟深層路由。
- 前端 Bundle 不包含 Service Role、Secret Key 或 Google Client Secret。
- 所有 Acceptance Criteria 已對應測試或人工驗收紀錄。
