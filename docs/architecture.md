# Architecture Specification

## 1. 系統架構

```text
Browser
├── Vue 3 SPA
├── CodeMirror 6 + Vim Keymap
├── Domain Modules
├── Pinia
└── IndexedDB
     │
     ├── Vercel：前端部署
     └── Supabase
          ├── Auth
          ├── PostgreSQL
          ├── Data API
          ├── RLS
          └── Database Functions
```

## 2. 前端責任

前端負責低延遲互動：

- 初始化 CodeMirror。
- 設定初始內容與游標。
- 監聽內容、游標與 Vim Mode。
- 記錄標準化操作。
- 即時判定完成條件。
- 使用者互動後自動完成符合條件的題目，且同一題只送出一次成功結果。
- 計算速度與準確的預覽。
- 顯示提示與動畫。
- 先保存 IndexedDB。
- 同步 Supabase。

## 3. Supabase 責任

- Google OAuth。
- 公開題庫。
- 使用者資料。
- 答題紀錄。
- 熟練摘要。
- 複習排程。
- RLS。
- 以單一 `security invoker` RPC Transaction 記錄 Attempt 並更新摘要。

## 4. 建議前端結構

```text
src/
├── app/
│   ├── router/
│   ├── layouts/
│   └── providers/
├── features/
│   ├── auth/
│   ├── course/
│   ├── home/
│   ├── practice/
│   ├── review/
│   ├── progress/
│   ├── settings/
│   └── guest-sync/
├── domain/
│   ├── exercise/
│   ├── scoring/
│   ├── mastery/
│   └── review/
├── infrastructure/
│   ├── supabase/
│   └── indexed-db/
├── components/
│   ├── common/
│   ├── editor/
│   └── feedback/
├── stores/
├── types/
├── utils/
└── main.ts
```

## 5. 核心型別

```ts
export type LearningMode =
  | "beginner"
  | "memory_review"
  | "efficiency";

export type QuestionCount = 5 | 10 | 20;

export type VimMode =
  | "normal"
  | "insert"
  | "visual"
  | "replace"
  | "command";

export type ExerciseSource =
  | "web"
  | "neovim"
  | "ideavim"
  | "vscode_vim";

export interface CursorPosition {
  line: number;
  column: number;
}
```

禁止使用 `any` 隱藏不一致。

## 6. Domain Modules

### ExerciseEvaluator

```ts
export interface ExerciseEvaluator {
  evaluate(
    exercise: ExerciseDefinition,
    snapshot: EditorSnapshot,
  ): ExerciseEvaluation;
}
```

負責：

- `exact` 內容比對。
- `unchanged` 內容比對。
- `ignore`、`exact`、`range` 游標比對。
- `requiredMode` 比對。

不得讀取 CodeMirror View。

### CommandNormalizer

將原始按鍵與 CodeMirror Vim 狀態轉換為：

```ts
export type NormalizedAction =
  | { type: "vim_command"; command: string }
  | { type: "insert_text"; text: string; textLength: number }
  | { type: "mode_change"; mode: VimMode }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "search"; query: string; direction: "forward" | "backward" };
```

### SolutionMatcher

回傳：

```ts
export type SolutionMatch =
  | "recommended"
  | "accepted"
  | "valid_but_inefficient"
  | "unknown_valid";
```

最終結果正確時，即使操作不在題庫解法中，也不能判錯。

### ScoringCalculator

```ts
export interface ScoreResult {
  speedScore: number;
  accuracyScore: number;
  performanceQuality: 0 | 1 | 2 | 3 | 4 | 5;
}
```

### MasteryCalculator

```ts
export interface MasteryUpdate {
  previousScore: number;
  nextScore: number;
  previousLevel: 0 | 1 | 2 | 3 | 4 | 5;
  nextLevel: 0 | 1 | 2 | 3 | 4 | 5;
  delta: number;
}
```

### ReviewScheduler

輸入熟練等級、品質、提示層級與舊間隔，回傳下一個 `dueAt`。

### PracticeSelector

負責：

- 70% 到期與錯題。
- 20% 弱項。
- 10% 抽查。
- 題目不足遞補。
- 同一輪不重複 Exercise。
- 只使用已接觸技能，除非是課程模式。

## 7. CodeMirror Wrapper

`VimEditor.vue` 只負責包裝 CodeMirror。

Props：

```ts
export interface VimEditorProps {
  initialContent: string;
  initialCursor: CursorPosition;
  language: SupportedLanguage;
  showLineNumbers: boolean;
  showKeypresses: boolean;
  cursorTarget?: CursorMatchRule;
  autoFocus?: boolean;
  readOnly?: boolean;
}
```

Emits：

```ts
export interface VimEditorEmits {
  contentChanged: [content: string];
  cursorChanged: [cursor: CursorPosition];
  modeChanged: [mode: VimMode];
  actionRecorded: [action: NormalizedAction];
  editorReady: [];
}
```

每次切題必須建立全新 EditorState，清除：

- Undo 歷史
- Vim Pending Operator
- Search 狀態
- Visual Selection
- 上一題操作

Vim Extension 必須排在其他 Insert Mode keymap 之前。

`VimEditor.vue` 另負責載入 presentation-only 的 CodeMirror theme。當 `autoFocus` 為 true 且不是 readonly 時，必須在 EditorView 與 Vim bridge 建立完成後聚焦一次，不得透過 transaction 改動既有 selection。

當題目有 `cursorTarget` 時，`VimEditor.vue` 只負責將 `exact` 或 `range` 目標轉成 CodeMirror decoration；這是 presentation-only 行為，不改變 EditorState、游標或完成判定。目標位置使用黃色透明細邊框，並提供可辨識的 aria label。

`PracticePage.vue` 負責接收 `actionRecorded`、保存標準化操作、在內容／游標／Mode 改變後觸發自動評估，以及在首次互動後符合條件時呼叫既有 outcome service。完成回饋由 `ExerciseFeedback.vue` 呈現操作序列與三項指標的文字定義；評分與熟練計算仍只由 Domain modules 負責。

練習功能負責編輯器外的 orchestration：

- `PracticeEditorStatusBar.vue` 只呈現 Mode、elapsed time 與 restart event，不持有 timer 或 attempt state。
- elapsed-time composable 從目前 attempt 的 `startedAt` 與壁鐘時間計算秒數，並在 feedback 或頁面卸載時停止 interval。
- `PracticePage.vue` 將 restart 與完成回饋的「再試一次」接到同一個 fresh-attempt flow（`fresh-attempt-service.ts`）；該 flow 產生新的 `clientAttemptId` 與 `startedAt`，並重設內容、游標、Mode、按鍵、操作、提示與 resetCount。
- restart 不保存未完成 Attempt；已完成後的 retry 保留既有 Attempt，再為同一題建立新 attempt。
- `PracticePage.vue` 以 `isEditorLocked`（`feedback !== null || isSavingOutcome || isExerciseLoading`）同時鎖定 `VimEditor` 的 `readOnly` 與 `updateContent`／`updateCursor`／`updateMode`／`recordAction`／`recordKeydown` 等 handler；`VimEditor.vue` 透過 CodeMirror `Compartment` 讓 `readOnly` 在掛載後仍可反應式切換，避免完成、保存或載入下一題時仍可編輯或產生 draft 寫入。
- 完成 outcome 由 `attempt-outcome-commit.ts` 的 `commitAttemptOutcome` 在單一 IndexedDB transaction 中同時寫入 Attempt 與更新 session（含清空 attemptDraft），任一步失敗即整體 rollback，不會留下「Attempt 已存在但 draft 仍可恢復」的中間狀態；本機 transaction 成功後才呼叫 `syncStore.notifyAttemptCommitted()` 觸發背景／遠端同步。session 只有在使用者點擊「下一題」後才前進一次。
- `goToNext` 在推進 session 前，若還有下一題，會先以純函式 `advancePracticeSession` 預覽下一個 exerciseId 並成功取得該題目後，才實際呼叫 `completeCurrentExercise`／`skipCurrentExercise` 並保存 session；下一題載入失敗時，不會清除 feedback／pendingOutcome，也不會提交尚未確認的 session 前進狀態，並顯示可重試的錯誤訊息。

## 8. Attempt Draft

```ts
export interface AttemptDraft {
  clientAttemptId: string;
  exerciseId: string;
  exerciseVersion: number;
  learningMode: LearningMode;
  source: "web";
  startedAt: string;
  completedAt: string | null;
  initialContent: string;
  currentContent: string;
  initialCursor: CursorPosition;
  currentCursor: CursorPosition;
  currentMode: VimMode;
  actions: NormalizedAction[];
  mistakeCount: number;
  undoCount: number;
  resetCount: number;
  highestHintLevel: 0 | 1 | 2 | 3 | 4;
  completed: boolean;
}
```

## 9. 資料儲存流程

```text
完成題目
→ 產生 AttemptRecord
→ IndexedDB transaction 寫入
→ 顯示結果並允許下一題
→ 背景同步 Supabase
→ 成功：syncStatus = synced
→ 失敗：syncStatus = pending
```

同步失敗不能阻止下一題。

## 10. 訪客登入合併

```text
Google OAuth 成功
→ 讀取 pending / local Attempt
→ 呼叫 Supabase 記錄函式（record_exercise_attempt RPC）
→ 依 clientAttemptId 去重
→ 以 IndexedDbSyncedAttemptCommitter 依 revision 調和本機投影
→ 標記本機紀錄 synced
```

衝突規則：

- Attempt 是 append-only。
- 伺服器回傳的絕對熟練分數／等級與 `dueAt` 會覆蓋本機由 `calculateLearningProjection` 算出的預測值——本機值只是暫時預測，伺服器值才是權威來源（見第 10.1 節版本規則）。
- 合併失敗保留本機資料；已標記 `synced` 的 Attempt 不會重送 RPC。

### 10.1 本機學習投影與版本調和（P0.3）

`AttemptCompletionService`（`features/practice/services/attempt-completion-service.ts`）在完成或跳過題目時：

1. 讀取該題所屬技能目前的 `StoredSkillMastery` 與該題目的 `StoredExerciseReview`。
2. 呼叫純函式 `calculateLearningProjection`（`domain/mastery/learning-projection-calculator.ts`），同時輸出：
   - 每個受影響技能的 `StoredSkillMastery` 更新（呼叫既有 `calculateMasteryUpdate`）。
   - 由主要技能等級與提示層級算出的下一個 `StoredExerciseReview`（呼叫既有 `scheduleReview`）。
   - 一筆 `StoredLearningOutcome`，記錄每個技能提交後的 `masteryRevisions` 與 `reviewRevision`，作為之後版本比對的基準快照。
3. 呼叫 `commitLearningProjection`（`infrastructure/indexed-db/learning-projection-commit.ts`），在**同一個 IndexedDB transaction**中寫入 `attempts`、`sessions`、`skillMastery`、`exerciseReviews`、`learningOutcomes` 五個 object store；任一 `put()` 失敗即整個 transaction abort，五個 store 都不會留下部分寫入。
4. 本機 transaction 成功後才呼叫 `syncStore.notifyAttemptCommitted()`；transaction 失敗時，不會呼叫任何背景同步或遠端 RPC。

重複送出同一 `clientAttemptId`（例如重試）是安全的：`commitLearningProjection` 以既有 payload 比對判斷是否為重複提交，重複時不重算、不重寫，直接回傳先前實際持久化的結果。

登入後同步時，`IndexedDbSyncedAttemptCommitter`（`infrastructure/indexed-db/synced-attempt-committer.ts`）依 `StoredLearningOutcome.masteryRevisions` 與 `reviewRevision`（而非時間戳）判斷是否可以安全套用伺服器的絕對值：

- 本機目前 revision 等於這筆 outcome 提交時的快照 → 套用伺服器絕對值，revision 加一。
- 本機 revision 已經比快照新（例如使用者在同步前又完成了其他題目）→ 判定為過期回應，捨棄不套用。
- 本機 revision 比快照舊 → 視為本機狀態損壞，中止整個調和 transaction 而不是靜默覆蓋。
- Attempt 一律標記為 `synced`（伺服器確實已收到），即使沒有可調和的投影紀錄。

### 10.2 訪客/舊資料退回路徑（P0.2 fallback）

`ReviewSummaryService`、`PracticeSelectionService`（皆在 `features/*/services/`）優先讀取上述持久化投影：

- 有任何 `StoredSkillMastery` 紀錄時，到期題數直接讀 `ExerciseReviewRepository.listDue`，弱項技能直接依 `masteryScore` 由低到高排序；`daily_review` 與 `weakness_practice` 的候選池會以持久化到期清單覆寫既有的動態分類（把到期但被動態分類排除的題目直接插入到期池），弱項題目的排序也改用真實 `masteryScore`。
- 完全沒有投影紀錄、只有原始 Attempt 的使用者（例如尚未跑過本機投影提交的舊資料），退回既有 P0.2 動態演算法：`buildExerciseLearningSnapshots` + `buildPracticeCandidatePools`，行為與升級前完全一致。

兩個服務的建構子都以「可選 port、預設回傳空陣列」的方式接受這兩個新 repository，因此既有呼叫端與測試在不注入它們時，行為不變。

## 11. 路由

```ts
[
  { path: "/", name: "home" },
  { path: "/courses", name: "courses" },
  { path: "/courses/:unitSlug", name: "course-unit" },
  { path: "/practice/setup", name: "practice-setup" },
  { path: "/practice/:sessionId", name: "practice" },
  { path: "/practice/:sessionId/result", name: "practice-result" },
  { path: "/review", name: "review" },
  { path: "/progress", name: "progress" },
  { path: "/settings", name: "settings" },
  { path: "/auth/callback", name: "auth-callback" },
  { path: "/:pathMatch(.*)*", name: "not-found" },
]
```

## 12. Vercel SPA

根目錄：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

## 13. 環境變數

可公開於瀏覽器：

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

禁止：

```env
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
GOOGLE_CLIENT_SECRET=
```

Google Client Secret 僅配置於 Supabase／Google Provider 設定。

## 14. RLS 原則

所有 exposed schema tables：

```sql
alter table public.<table> enable row level security;
```

擁有者政策：

```sql
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id)
```

題庫只允許讀取 `is_published = true`。

## 15. 錯誤處理

### 題目資料不合法

- 不載入編輯器。
- 記錄錯誤。
- 跳過壞題。
- 補入下一題。
- 不算使用者失敗。

### CodeMirror 初始化失敗

提供：

- 重試載入。
- 返回題組。
- 重新整理。

### 同步失敗

顯示：

> 目前無法同步，紀錄已保存在這台裝置。

### 未完成中途離開

- 保存 AttemptDraft。
- 回來時選擇恢復或重設。
- 不自動算失敗。

## 16. 效能

- CodeMirror 僅在練習頁動態載入。
- 每次只預載目前題目與後續 1–2 題。
- 離開練習頁銷毀 View。
- 語言 Extension 動態載入。
- 不一次下載完整 100 題內容。

## 17. IndexedDB v2 Schema

資料庫名稱 `vim-forge`，目前 version 2。Schema 建立以「已存在的 store／index 不重建」為原則（`ensureStore`／`ensureIndex`），因此升級不會遺失既有資料：

| Store | keyPath | Index | 說明 |
|---|---|---|---|
| `attempts` | `clientAttemptId` | `syncStatus`、`sessionId`、`exerciseId`、`completedAt` | 沿用自 P0.1／P0.2。 |
| `sessions` | `id` | `status` | 沿用自 P0.1／P0.2。 |
| `settings` | `key` | — | 沿用自 P0.1／P0.2。 |
| `metadata` | `key` | — | 沿用自 P0.1／P0.2。 |
| `skillMastery` | `skillId` | — | P0.3 新增：本機技能熟練投影（`StoredSkillMastery`）。 |
| `exerciseReviews` | `exerciseId` | `dueAt`、`updatedAt` | P0.3 新增：本機間隔複習排程（`StoredExerciseReview`）。 |
| `learningOutcomes` | `clientAttemptId` | `sessionId`、`exerciseId`、`completedAt` | P0.3 新增：每次提交的投影快照，作為第 10.1 節版本調和的基準（`StoredLearningOutcome`）。 |

`skillMastery`、`exerciseReviews` 各自提供對應的唯讀 repository（`SkillMasteryRepository`、`ExerciseReviewRepository`），只有 `get`／`list*` 方法；寫入一律經第 10.1 節的原子提交流程，repository 本身不提供 `save`。

## 18. 題組建立（Session Starter）

`PracticeSessionStarter`（`features/practice/services/practice-session-starter.ts`）是課程模式、每日複習、指定主題、弱項練習共用的題組建立入口：

```ts
class PracticeSessionStarter {
  start(input: StartPracticeSessionInput): Promise<PracticeSession>;
}
```

流程固定為「先持久化，成功後才寫入 Pinia store」：

1. 以純函式 `createPracticeSession` 建立 `PracticeSession`。
2. `await repository.save(session, null)`。
3. 只有第 2 步成功後才呼叫 `store.restoreSession(session, null)`。

若第 2 步失敗，store 完全不變；呼叫端（`PracticeSetupPage.vue`、`CourseUnitPage.vue`）不需要各自處理「session 已建立但 store 沒同步」的中間狀態。

## 19. 學習進度與首頁個人化的真實資料來源

Progress（`/progress`）與首頁個人化摘要不是 prop-driven 元件：兩者都在 `onMounted` 內開啟 IndexedDB、建立對應 service，並呼叫真實 repository。

- `ProgressQueryService`（`features/progress/services/progress-query-service.ts`）組合 `SkillMasteryRepository.listAll`、`ExerciseReviewRepository.listDue`／`listAll`、`AttemptRepository.listAll` 與已發佈課程目錄（`CourseRepository`），輸出技能熟練（依課程目錄的單元／技能排序，而非依名稱字母排序）、單元完成度（依實際成功過的 Exercise 去重計算，不因同一題重複成功而膨脹）、到期複習題數，以及最近練習紀錄（含已下架題目，改用「已移除的題目」佔位標題，而不是整筆從清單移除）。
- `HomeLearningSummaryService`（`features/home/services/home-learning-summary-service.ts`）組合 `SessionRepository.getActive`、`ExerciseReviewRepository.listDue`、`SkillMasteryRepository.listAll` 與課程目錄，輸出「繼續上次練習」的 session id、今日待複習題數，以及熟練分數最低的一個技能建議。
- `ProgressPage.vue`、`HomePage.vue` 都以 `loading`／`loaded`（或有內容／無內容）／`error` 狀態呈現；`HomePage.vue` 的三張學習模式卡片與載入狀態、錯誤狀態無關，一律顯示。

本節描述的「頁面整合真實資料」宣稱，只有在對應執行期頁面實際呼叫上述 repository／service 時才算完成；只靠 prop-driven 元件測試（例如直接把假資料傳進 `ProgressPage` props）或獨立 domain 測試，不能證明頁面真的整合了本機資料，因此本節提到的頁面行為都必須同時有 Vitest（service／repository 層）與 Playwright（頁面實際讀寫 IndexedDB）兩層證據。第 10.1／10.2 節描述的是投影提交、版本調和與選題服務本身的 orchestration 行為，不是頁面整合宣稱，由對應的 Vitest／IndexedDB integration test 證明即可，不強制要求額外的 Playwright 證據；見 `docs/testing-strategy.md` 與 `docs/acceptance-verification.md`。
