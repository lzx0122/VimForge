# Testing Strategy

## 1. 測試分層

### Unit Tests

工具：Vitest。

必測：

- ExerciseEvaluator
- CommandNormalizer
- SolutionMatcher
- ScoringCalculator
- MasteryCalculator
- ReviewScheduler
- PracticeSelector
- IndexedDB Repositories（含 P0.3 新增的 `SkillMasteryRepository`、`ExerciseReviewRepository`、`LearningOutcomeRepository`——皆為唯讀，寫入只透過原子提交流程）
- `learning-projection-commit.ts`（原子 transaction，任一 store 寫入失敗須整體 rollback）
- `synced-attempt-committer.ts`（依 `masteryRevisions`／`reviewRevision` 版本調和，而非時間戳）
- `PracticeSessionStarter`（先持久化、成功後才更新 store）
- `ReviewSummaryService`、`PracticeSelectionService`（有本機投影時優先使用；沒有投影紀錄時的 P0.2 fallback 需各自獨立測試覆蓋）
- `ProgressQueryService`、`HomeLearningSummaryService`

### Component Tests

工具：Vue Test Utils + Vitest。

必測：

- ModeSelectionCards
- QuestionCountSelector
- ProgressiveHintPanel
- ExerciseFeedback
- PracticeHeader
- TopicSelector
- OfflineSyncBanner

### Integration Tests

測試：

- Practice Store 與 IndexedDB。
- Supabase Repository 的資料轉換。
- 訪客登入合併。
- 題組恢復。
- 同步失敗後重試。

**凡是宣稱某個頁面或使用者 journey 已整合真實 repository／service 的驗收項目，Component／Integration Tests 本身不足以證明完成。** 任何以 prop-driven 方式掛載頁面元件（例如直接把假的 `ProgressDashboard`／`HomeLearningSummary` 傳進 props）的測試，只能證明元件邏輯正確；必須額外有對應的 End-to-End 測試，確認執行期頁面真的呼叫了 repository／service、讀寫了真實的 IndexedDB，才能視為該頁面整合功能完成。純 domain、repository、transaction 或 service orchestration（例如原子提交、版本調和、選題演算法本身）的驗收項目，由對應的 Vitest／IndexedDB integration test 證明即可，不強制要求額外的頁面 End-to-End 測試（見 `docs/acceptance-verification.md` 的驗收規則）。

### End-to-End Tests

工具：Playwright。

主要流程：

1. 訪客選擇記憶複習、5 題。
2. 完成一題。
3. 重新整理。
4. 紀錄仍存在。
5. 進入結果頁。

完整 P0 學習迴圈（`tests/e2e/learning-loop.spec.ts`）：

1. 訪客從首頁進入課程單元、完成一題。
2. 單題回饋顯示真實（非虛構）的熟練分數變化。
3. 完成 session，結果頁顯示彙總數字。
4. 學習進度頁顯示同一技能與單元的真實進度。
5. 今日複習顯示與學習進度相同的到期題數。
6. 重新整理後上述資料不變。

其他：

- 自由選擇課程單元。
- 顯示題庫實際提供的提示層級；缺號時仍能依序解鎖。
- 未完成時不能自動結束。
- 內容正確但 Mode 錯誤時提示回 Normal。
- 同步錯誤不阻止下一題。
- 深層路由重新整理可正常載入。
- 本機學習投影的 transaction 失敗時（`scoring-feedback.spec.ts`），Attempt、`skillMastery`、`exerciseReviews`、`learningOutcomes` 都不留下部分寫入，也不呼叫同步 RPC。
- 登入同步（`auth-sync.spec.ts`）：本機熟練預測值在同步後被伺服器絕對值取代，且已同步的 Attempt 不會重送——RPC handler 在第二次呼叫時直接讓測試失敗，而不是只在特定時間點檢查呼叫次數。
- 今日複習的到期題數與持久化 `exerciseReviews` 一致，即使該使用者完全沒有本機 Attempt（`review-selection.spec.ts`）。

## 2. Scoring Tests

### 速度

- 推薦 3 keys、實際 3 keys、低於目標時間 → 100。
- 推薦 3、實際 6、時間效率 50 → 50。
- 未完成 → 0。
- beginner 使用 2.0 時間寬限。
- memory_review 使用 1.3 時間寬限。
- efficiency 無寬限。

### 準確

- 一次完成、無提示 → 100。
- 2 mistakes、1 undo、Level 2 → 79。
- Level 1 後又 Level 3，只扣 Level 3。
- 跳過 → 0。
- 低效率但無錯誤 → 不扣準確。

### 熟練

- 同題立即重做倍率 0.4。
- 不同題同技能倍率 1.0。
- 隔天成功倍率 1.2。
- 七天成功倍率 1.35。
- Level 4 提示倍率 0.15。
- 高等級單次失敗有下降保護。
- 不符合最低條件時不得進 Level 4／5。

## 3. Practice Selector Tests

10 題：

- 7 due/error
- 2 weakness
- 1 mastered check

5 題：

- 3 due/error
- 1 weakness
- 1 mastered check

20 題：

- 14 due/error
- 4 weakness
- 2 mastered check

不足遞補：

```text
due 不足
→ weakness
→ overdue mastered
→ same difficulty random
```

同一 Exercise 不得重複。

上述比例與遞補規則描述的是 `buildPracticeCandidatePools` 動態分類演算法（P0.2），至今未修改。使用者已有本機技能熟練投影時，`PracticeSelectionService` 會另外覆寫這些池：持久化到期清單中的題目一律進入到期池，弱項題目改依真實 `masteryScore` 排序（見 `docs/architecture.md` 第 10.2 節）。因此 `practice-selection-service.test.ts` 需要涵蓋兩種情境：沒有投影紀錄時維持本節既有行為，以及有投影紀錄時到期／弱項判斷改由持久化資料主導。

## 4. RLS Tests

必須確認：

- anon 可讀 published 題庫。
- anon 不可讀 unpublished 題目。
- authenticated A 不可讀 B 的 Attempt。
- authenticated A 不可修改 B 的 Session。
- 使用者不能將 row 的 `user_id` 更新成他人。
- 前端 Publishable Key 無法修改題庫。
- 未授權角色不能執行 privileged Function。
- Service Role 不出現在前端 Bundle。

## 5. Accessibility

人工與自動檢查：

- 所有主要按鈕可用鍵盤操作。
- Focus 樣式可見。
- 編輯器焦點狀態清楚。
- 顏色不是唯一狀態提示。
- 結果卡有文字標籤。
- 提示按鈕具 `aria-expanded`。
- Mode 顯示具可讀文字。

## 6. Browser Matrix

MVP 必測：

- 最新穩定 Chrome。
- 最新穩定 Edge。
- 最新穩定 Firefox。
- macOS Safari 最新穩定版進行至少 Smoke Test。

## 7. Commands

專案 scripts：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "type-check": "vue-tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

每個 Task 至少執行：

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

影響主要流程時加上：

```bash
npm run test:e2e
```

## 8. P1 測試證據

### Vitest（domain／service／repository 層）

- `fresh-attempt-service.test.ts` — Restart 保留 `clientAttemptId`／`startedAt`／計分欄位並使 `resetCount` 加一；Retry 產生全新 Attempt。
- `attempt-mistake-service.test.ts` — 指紋計算與失敗檢查去重規則。
- `attempt-draft-save-scheduler.test.ts` — microtask 合併、序列化儲存、失敗重試、`dispose()` 語意。
- `draft-recovery-journal.test.ts` — 同步日誌寫入先於非同步 IndexedDB 儲存。
- `keyboard-display.test.ts` — 按鍵格式化規則（修飾鍵順序、特殊鍵顯示、修飾鍵單獨按下時回傳 `null`）。
- `PracticeSetupPage.test.ts` — 題量偏好判斷順序（URL → 已同步設定 → 預設值）。
- `settings-merge-service.test.ts` — Settings CAS 合併規則與 `soundEnabled` 裝置本地保留。
- `cloud-learning-state-mapper.test.ts` — 雲端列驗證與相容 null 正規化。
- `supabase-cloud-learning-state-repository.test.ts` — 分頁查詢契約（排序、`limit + 1`、cursor 推導）。
- `local-data-owner-repository.test.ts` — 帳號綁定與衝突偵測。
- `cloud-hydration-metadata-repository.test.ts` — Cursor／`completedAt`／`schemaVersion` 持久化與驗證。
- `cloud-hydration-committer.test.ts` — 原子頁面提交、Mastery／Review 版本調和（含過期資料仍推進 cursor）、重放安全。
- `cloud-hydration-service.test.ts` — 下載順序、分頁迴圈、多輪重放不重複套用、已完成重跑不回退 Attempts／Mastery／Reviews。

### Playwright（頁面整合層）

凡宣稱「執行期頁面已整合雲端同步」的驗收項目，必須引用下列 Playwright 檔案而非只有 Vitest 證據：

- `tests/e2e/p1-scoring-reliability.spec.ts` — Resume 後計分欄位正確恢復並持續累計；Restart 與 Retry 在真實瀏覽器下產生的 Attempt 身分差異。
- `tests/e2e/scoring-feedback.spec.ts` — 除既有 P0 涵蓋範圍外，另涵蓋 Restart 的持久化優先於畫面套用（`restores the fresh restart draft, not the pre-restart draft, after an immediate reload`、`keeps the pre-restart attempt visible when the fresh draft fails to persist`）、緊接在 reload 前的實體按鍵仍保留在同一個 Attempt 身分下（`keeps a physical keypress that lands immediately before a reload, with the same Attempt identity`）。
- `tests/e2e/p1-cloud-hydration.spec.ts` — 五個 journey：新裝置完整 hydration（含 Settings／Attempts／Mastery／Reviews／metadata 的逐欄位精確比對）、pending Attempt 上傳完成後才開始下載讀取（以完成標記與明確的讀取呼叫順序證明，不依賴畫面 banner 的有無或固定等待）、帳號衝突同時停止上傳與下載、已開啟頁面在 hydration 完成後自動刷新、延遲的過期 Mastery 回應不得覆蓋競態中產生的較新本機分數與 revision。
- `tests/e2e/auth-sync.spec.ts` — 登入合併、伺服器絕對值調和、已同步 Attempt 不重送。

本節沿用第 1 節既有的規則：純 domain／repository／transaction／service orchestration（例如原子提交、版本調和本身）由 Vitest／IndexedDB integration test 證明即可；任何「執行期頁面已經走過這條路徑」的宣稱都必須額外有對應 Playwright 證據。

### 尚待 PR #1 提供的證據

`AppBootstrap.test.ts`、`RecentKeypresses.test.ts`、`tests/e2e/p1-editor-settings.spec.ts` 與 `VimEditor.vue` 的字級／行號 `Compartment` 測試案例屬於 PR #1（分支 `feat/p1-2-editor-settings`）範圍，截至本文件撰寫時該分支尚未合併，本分支（`feat/p1-3-cloud-hydration`）尚無這些檔案；對應行為僅在 `docs/architecture.md` 第 21.1／21.2 節與第 20.5 節以「計畫目標行為」描述，不得視為本分支已驗證完成，見 `docs/acceptance-verification.md` AC-054／055／056。

### 資料庫層（外部環境，Docker 相依）

- `supabase/tests/p1_learning_hydration.sql` — 需在已連結真實 PostgreSQL 的環境執行 `supabase test db` 才能驗證；本機沙盒若無 Docker，此項目維持未執行狀態，不得以本機 Vitest／Playwright 結果替代。
- `scripts/user-learning-migrations.test.ts` — 驗證遷移檔本身的欄位／約束契約（純解析層級，非對真實 PostgreSQL 執行）。

## 9. Definition of Done

不得只因畫面看起來正常宣告完成。

完成必須：

- 測試通過。
- TypeScript 通過。
- Build 通過。
- 沒有 `any`、`TODO`、停用規則規避問題。
- 錯誤路徑有測試。
- 修改內容符合當前 Task，沒有超範圍功能。
