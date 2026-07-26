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

## 20. P1：計分與 Draft 可靠性

### 20.1 Restart 與 Retry 的差異

`fresh-attempt-service.ts` 提供兩個不同的純函式：

```ts
export function createFreshAttemptState(
  input: CreateFreshAttemptStateInput,
): FreshAttemptState; // 建立全新計分狀態（clientAttemptId／startedAt／計分欄位皆由呼叫端提供或歸零）

export function restartCurrentAttempt(
  input: RestartCurrentAttemptInput,
): FreshAttemptState; // Restart：延續同一個 Attempt
```

`createFreshAttemptState()` 本身不是「Retry」——它是建立一個全新計分狀態的通用建構子，`clientAttemptId`／`startedAt` 皆由呼叫端傳入，而非自行產生。完成回饋後的「再試一次」（Retry）呼叫的是 `PracticePage.vue` 內的頁面層級 helper：

```ts
function createFreshAttemptForExercise(
  activeExercise: PracticeExercise,
): FreshAttemptState {
  return createFreshAttemptState({
    exercise: activeExercise,
    clientAttemptId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  });
}
```

這個 `createFreshAttemptForExercise()` 只存在於 `PracticePage.vue`，不是 `fresh-attempt-service.ts` 的匯出——它負責產生新的 `clientAttemptId`／`startedAt`，再委託 `createFreshAttemptState()` 建構其餘欄位。

「重新開始本題」（Restart）：

- 保留同一個 `clientAttemptId` 與 `startedAt`（已練習時間不歸零）。
- 保留 `keystrokeCount`、`mistakeCount`、`lastMistakeFingerprint`、`highestHintLevel`（提示層級不因重來而清空，避免透過反覆重來刷提示）。
- `resetCount` 加一，操作序列追加 `{ type: "reset" }`。
- 內容、游標還原為題目初始值，Mode 回到 Normal。
- 不建立成功、失敗或中止的 Attempt 紀錄。

完成回饋後的「再試一次」（Retry）：

- 建立全新的 `clientAttemptId` 與 `startedAt`。
- 所有計分欄位（按鍵、錯誤、提示、resetCount）歸零。
- 保留已完成題目原本保存的 Attempt。

Resume 對話框的「重設這一題」捨棄未完成的 Draft 並直接開始新的 Attempt，不計為 Restart。

### 20.2 失敗檢查的錯誤計數語意

`attempt-mistake-service.ts` 定義「錯誤」只在使用者按下「檢查目前結果」且目前編輯器快照仍不符合完成條件時計數：

```ts
export function createEditorSnapshotFingerprint(
  snapshot: CheckedEditorSnapshot,
): string; // JSON.stringify([content, cursor.line, cursor.column, mode])

export function recordFailedCheck(input: {
  snapshot: CheckedEditorSnapshot;
  mistakeCount: number;
  lastMistakeFingerprint: string | null;
}): FailedCheckResult;
```

- 相同的內容／游標／Mode 指紋只計一次；快照改變後再次失敗才會再加一次。
- Undo 只計入 `undoCount`，Restart 只計入 `resetCount`，皆不進入 `mistakeCount`。
- 跳過題目不算一次錯誤。
- 操作正確時仍自動完成，不需要按「檢查目前結果」。

`AttemptDraft`（見第 8 節）持久化 `mistakeCount` 與 `lastMistakeFingerprint`；Resume 時一律以 Normal Mode 呈現未完成內容，若持久化指紋對應目前快照，會先正規化成 Normal Mode 版本，避免重新整理後把同一個失敗狀態視為新的錯誤。

### 20.3 Draft 保存排程與 flush 邊界

`attempt-draft-save-scheduler.ts` 以 dirty flag 取代固定時間輪詢：

```ts
export interface AttemptDraftSaveScheduler {
  schedule(): void;
  flush(): Promise<FlushResult>; // "completed" | "failed"
  dispose(): Promise<void>;
}
```

- 同一個 JavaScript turn 內多次呼叫 `schedule()` 只會排入一個 microtask。
- 儲存序列化執行；儲存中若再被標記為 dirty，會在目前儲存完成後再跑一次，讀取的是執行當下的最新狀態，而不是排程當下的舊快照。
- 儲存失敗會呼叫 `onError` 並維持 dirty，讓之後的 `flush()`重試。
- `flush()` 只在沒有排隊中的 microtask、dirty 狀態或進行中的儲存時才 resolve；呼叫端（Restart、下一題、離開路由、`visibilitychange` 隱藏、卸載）在推進前都必須 `await scheduler.flush()`。
- `dispose()` 先 flush 一次再拒絕之後所有 `schedule()` 呼叫。

`draft-recovery-journal.ts` 在排入非同步 IndexedDB 儲存之前，於同一個 task 內同步寫入 `localStorage` 復原日誌；即使頁面在非同步儲存完成前就被關閉，也能在下次載入時比對日誌與實際持久化內容，判斷是否需要恢復。

### 20.4 Restart 的持久化優先於畫面更新

`PracticePage.vue` 的 `restartExercise()` 依序執行：

```text
flush 既有 Draft 排程
以純函式建立 restarted 狀態與 Draft
儲存 restarted Draft 到 IndexedDB
儲存 restarted Draft 到 Practice Store
才把 restarted 狀態套用到畫面（VimEditor、計時器、提示面板）
```

任一儲存步驟失敗時，維持重來前的畫面內容，不套用 restarted 狀態，並顯示可重試的錯誤訊息（見 `scoring-feedback.spec.ts` 的「keeps the pre-restart attempt visible when the fresh draft fails to persist」與「restores the fresh restart draft, not the pre-restart draft, after an immediate reload」）。

### 20.5 實體按鍵顯示與所有權

`VimEditor.vue` 透過 CodeMirror `domEventObservers` 監聽實際 `keydown`，發出格式化後的顯示字串（例如 `d`、`<Esc>`、`Shift-g`、`Ctrl-r`）：

```ts
export interface VimEditorEmits {
  // ...既有 emits
  keyPressed: [display: string];
}
```

修飾鍵單獨按下（`Shift`／`Control`／`Alt`／`Meta`）不發出事件；唯讀編輯器不發出事件。

這裡有兩個必須分開的概念，不可混為一談：

**`keystrokeCount`（已計分電文，本分支已實作、會持久化）**

目前（本分支）`PracticePage.vue` 的 `recordKeypress()` 用這個事件累計 `keystrokeCount` 並排程 Draft 儲存。`keystrokeCount` 是 `AttemptDraft` 明確定義的欄位（見第 8 節），透過 `buildAttemptDraft()`／`buildFreshAttemptDraft()` 寫入，並在 Resume 時還原——它會持久化、會上傳、屬於計分資料的一部分，不是裝置本地展示用的暫存值。

**最近按鍵顯示佇列（PR #1 待合併，屬於 UI 展示層）**

`PracticePage.vue` 目前尚未維護畫面上「最近 8 個按鍵」的顯示佇列——`RecentKeypresses.vue` 元件與其掛載邏輯屬於執行計畫 Task 10（PR #1／分支 `feat/p1-2-editor-settings`，尚未合併）的範圍。這個顯示佇列合併後的目標行為：

- 這份佇列只是畫面上「最近 8 個按鍵」的展示字串陣列，**不是** `keystrokeCount`，**不寫入 `AttemptDraft`**，也不上傳雲端——它是裝置本地、純展示用的臨時資料。
- Restart、Retry、下一題與 Resume 都會清空這份顯示佇列；`keystrokeCount` 本身不受影響，仍照常累計。
- `showKeypresses` 設定關閉時只是不渲染這份顯示佇列，`keystrokeCount` 仍持續累計。

`keyPressed` 事件本身、`keystrokeCount` 的累計與持久化，都是本分支已實作並有 Vitest／Playwright 證據的行為；「最近按鍵顯示佇列不持久化」則是 PR #1 合併後才能驗證的目標行為，本分支目前沒有也不能有對應證據（見 `docs/testing-strategy.md` 第 8 節、`docs/acceptance-verification.md` AC-054）。

## 21. P1：設定與編輯器整合

> 本節第 21.1、21.2 節描述的行為屬於 PR #1（分支 `feat/p1-2-editor-settings`）的範圍，**截至本文件撰寫時尚未合併**，本分支（`feat/p1-3-cloud-hydration`）的實際程式碼還沒有 `AppBootstrap.vue`、`editorFontSize` Prop 或對應的字級／行號 `Compartment`。以下描述的是執行計畫（`docs/superpowers/plans/2026-07-21-p1-vibe-execution-plan.md` Task 8、Task 9）定義的目標行為，供 PR #3 對照；PR #1 合併後應在這兩節補上實際檔案路徑與測試證據的交叉參照，而不是視為本分支已完成的既有事實。

### 21.1 應用程式啟動責任（PR #1，尚未合併）

計畫定義 `AppBootstrap.vue`（`src/app/providers/`）作為唯一負責初始化順序的元件：

```text
初始化 Settings Store
初始化 Sync Store
初始化 Auth Store（若尚未初始化）
呼叫 syncStore.setAuthenticated(currentUserId | null)
啟動一個監聽 Auth 使用者 id 變化的 watcher
```

`GoogleSignInButton.vue`、`OfflineSyncBanner.vue` 屆時不再各自初始化 Auth／Sync 或啟動監聽；即使初始化過程回報錯誤，`AppBootstrap.vue` 的 default slot 仍應渲染，不阻塞整個應用程式。

### 21.2 Settings Store 到已掛載 VimEditor 的反應式流程（PR #1，尚未合併）

計畫要求 `VimEditor.vue` 以 CodeMirror `Compartment` 讓下列 Props 在掛載後仍可反應式切換，且不改變既有 EditorView 實例：

```ts
export interface VimEditorProps {
  // ...
  editorFontSize: number;
  showLineNumbers: boolean;
}
```

`showKeypresses` 屆時不再是 VimEditor 的 Prop——最近按鍵顯示（見 20.5 節）屆時將屬於 `PracticePage.vue` 層級的關注點，不屬於編輯器包裝元件。目前（本分支）`VimEditor.vue` 只有既有的 `readOnlyCompartment`，沒有字級或行號 Compartment，`showKeypresses` 仍是既有 Prop、尚未搬移到 `PracticePage.vue`。這與第 20.5 節已經存在的 `keyPressed` emit（按鍵事件本身、`keystrokeCount` 累計）是兩件獨立的事：後者已在本分支實作，前者（反應式字級／行號、`showKeypresses` 搬移）仍待 PR #1 合併。

### 21.3 練習題量偏好的判斷順序

`PracticeSetupPage.vue` 決定題量選擇器預設值的優先順序固定為：

```text
URL 上合法的 count（5、10、20 之一）
→ 已同步的 settingsStore.preferredQuestionCount
→ Store 預設值
```

```ts
function parseQuestionCount(value: unknown): QuestionCount | null {
  if (value === "5" || value === "10" || value === "20") {
    return Number(value) as QuestionCount;
  }
  return null;
}
```

見 `PracticeSetupPage.test.ts` 的「prefers an explicit URL count of 10 over the synced setting」。使用者在頁面上手動變更題量後、若稍後才完成的 Settings 初始化不得覆蓋使用者的手動選擇——這部分的「延遲初始化與手動選擇保護」邏輯已在 PR #1（Task 12）實作並涵蓋測試，本文件不重複描述其實作細節，僅在此標註優先順序契約供 PR #3 對照；PR #1 合併後應在本節補上明確的交叉參照。

### 21.4 音效偏好：雲端同步層級已裝置本地化，前端 UI 移除待 PR #1 合併

雲端同步層級已經把 `soundEnabled` 視為純裝置本地欄位（本分支已實作並有測試）：`settings-merge-service.ts` 的 `resolveDeviceSound()`／`withSoundEnabled()` 在任何合併結果下都固定採用本機既有值，從不從雲端讀取或寫入——見 `settings-merge-service.test.ts` 與 `p1-cloud-hydration.spec.ts` Journey A（雲端 fixture 沒有 `soundEnabled` 欄位，本機值也不因雲端同步而改變）。

目前（本分支）Settings 頁面仍保留「開啟音效」UI 開關與對應的 Pinia state／`LocalSettings` 欄位——完整移除前端音效偏好（UI、Pinia state、`LocalSettings`、本機與雲端 repository 的欄位對應）屬於執行計畫 Task 11（PR #1／分支 `feat/p1-2-editor-settings`，尚未合併）的範圍，該分支合併後應更新本節，移除「目前仍保留」的描述。Supabase 的 `user_settings.sound_enabled` 資料行本身不受此影響，見 `docs/database-schema.md` 第 8.4 節：無論前端 UI 何時移除，這個資料行都作為部署相容性欄位保留。

## 22. P1：雲端學習狀態同步（Cloud Hydration）

### 22.1 責任邊界：上傳優先、下載獨立

`src/stores/sync-store.ts` 的 `syncAndHydrate()` 是唯一的「先上傳、成功後才下載」協調點：

```text
setAuthenticated(userId)
→ 若目前離線，等待 online 事件（且仍是目前 generation）
→ syncAndHydrate：先上傳所有 pending 本機 Attempt
→ 上傳完成後才呼叫 CloudHydrationService.downloadState(userId)
```

每次 `setAuthenticated()`（含登出）都會遞增內部 `generation` 計數器；任何非同步流程在恢復執行時都會重新比對 generation，過期的呼叫（例如使用者在同步進行中又登出或切換帳號）會直接變成 no-op，不會套用過期結果。

`CloudHydrationService.downloadState()`（`src/features/cloud-hydration/services/cloud-hydration-service.ts`）本身**只下載，不上傳**——上傳 pending Attempt 是 Sync Store 的職責，兩者刻意分離，讓下載服務可以獨立測試、獨立驗證原子性與版本調和規則，不必牽涉上傳重試邏輯。`downloadState()` 的固定順序：

```text
LocalDataOwnerRepository.bind(userId)
→ hydrateSettings(userId)（Settings CAS 合併，見 22.6 節）
→ CloudHydrationMetadataRepository.get(userId)（讀取已儲存的三組 cursor）
→ committer.captureProjectionRevisions()（在套用任何一頁之前，先拍下目前本機 Mastery／Review 版本快照）
→ 逐頁下載並提交 Attempts（見 22.4／22.5 節）
→ 逐頁下載並提交 Mastery
→ 逐頁下載並提交 Reviews
→ metadataRepository.markCompleted(userId, now)
```

任一步驟失敗都會中止整個下載，不會呼叫後續步驟或標記完成。

### 22.2 一個瀏覽器資料庫只綁定一個帳號

`LocalDataOwnerRepository`（`src/infrastructure/indexed-db/local-data-owner-repository.ts`）把目前 IndexedDB 綁定的帳號 id 存在既有 `metadata` store（沿用既有 key path，不需要升版）：

- 第一次綁定：直接寫入。
- 同一使用者再次綁定：視為冪等，不動作。
- 不同使用者嘗試綁定：拋出 `LocalDataOwnerConflictError`，上傳與下載都會中止，並顯示「此瀏覽器已有其他帳號的本機學習資料，已停止同步。」——絕不會把兩個帳號的資料混進同一份本機投影。

### 22.3 各資料集獨立的分頁 Cursor

`src/types/cloud-learning-state.ts` 為 Attempts、Mastery、Reviews 各自定義獨立的 Cursor 型別（而非共用單一時間戳記）：

```ts
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
```

`SupabaseCloudLearningStateRepository`（`src/infrastructure/supabase/supabase-cloud-learning-state-repository.ts`）依對應的複合排序（例如 `created_at asc, client_attempt_id asc`）查詢 `limit + 1` 筆，只回傳 `limit` 筆；`hasMore` 只在確實存在多出的那一筆時為真，`nextCursor` 取自實際回傳的最後一筆。`CloudHydrationMetadataRepository`（`src/infrastructure/indexed-db/cloud-hydration-metadata-repository.ts`）將三組 cursor 與 `completedAt`、`schemaVersion` 一併持久化在 `metadata` store 的 `cloud-hydration` 記錄中，讓中斷或分次的下載可以從上次進度繼續，而不必每次都從頭讀取整個帳號的歷史資料。

### 22.4 原子的「資料頁 + Cursor」提交

`IndexedDbCloudHydrationCommitter`（`src/infrastructure/indexed-db/cloud-hydration-committer.ts`）的 `commitAttemptsPage`／`commitMasteryPage`／`commitReviewsPage` 各自在單一 IndexedDB transaction 中，同時寫入該資料集的 store 與 `metadata` store 的對應 cursor 欄位：

```text
attempts store + metadata store（Attempts 頁）
skillMastery store + metadata store（Mastery 頁）
exerciseReviews store + metadata store（Reviews 頁）
```

任一筆寫入失敗（例如注入的 `DataError`）都會讓整個 transaction abort——不會出現「這一頁的部分資料寫入成功、但 cursor 沒有前進」或反過來的中間狀態。Attempts 的合併規則：本機不存在時以 `syncStatus: "synced"` 新增；本機為 `pending` 時保留本機（尚未同步的本機紀錄優先於雲端回傳）；遠端沒有回傳的本機紀錄一律不刪除。

### 22.5 Mastery／Review 版本調和守則

Mastery、Review 每一頁提交時，都以 `captureProjectionRevisions()` 拍下的快照作為「這一頁遠端資料是基於哪個本機版本算出來的」基準，逐筆套用同一條規則：

```text
本機目前 revision 等於快照的 expected revision
  → 套用遠端值，revision 加一

本機目前 revision 大於快照的 expected revision
  → 判定遠端資料過期，捨棄（skippedNewer），但這一頁的 cursor 仍然前進

本機目前 revision 小於快照的 expected revision
  → 視為本機狀態不一致的不變量錯誤，中止整個 transaction
```

「捨棄過期資料」與「分頁進度前進」是兩件互相獨立的事：即使一整頁的項目都因為過期而被捨棄，該頁的 cursor 仍會前進，下次下載才不會卡在同一頁重複比對（見 `cloud-hydration-committer.test.ts` 對 3→4 版本競態的 cursor 斷言，以及 `p1-cloud-hydration.spec.ts` Journey E 在真實瀏覽器下驗證「本機在延遲的雲端回應仍卡住時完成一題」的情境：本機因為樂觀預測與 RPC 權威回應各寫入一次，revision 從 0 推進到 2，之後才釋放的過期 Mastery 頁不得覆蓋分數或 revision）。

### 22.6 Settings 合併的 CAS（比較後交換）保護

`mergeCloudSettings()`（`src/features/settings/services/settings-merge-service.ts`）決定本機與雲端 Settings 何者為準：

```text
兩者皆無 → 維持預設值，不寫入
只有本機 → 上傳本機
只有雲端 → 存回本機
兩者皆有：較新且合法的 updatedAt 勝出；時間相同或兩者皆不合法時本機勝出
```

當合併結果初步判定「雲端勝出」時，在真正寫回本機之前會重新讀取一次本機（compare-and-swap）：若使用者在雲端請求進行中又修改了本機設定，改以最新的本機快照重新判定，避免蓋掉使用者剛做的變更；只執行一次重新讀取／重算循環，最終寫入階段若又發生變更，則視為可由下一次雲端同步調和的良性競態。`soundEnabled`（見 21.4 節）不論合併結果如何，一律採用裝置本地既有值，從不被雲端值覆蓋，也從不上傳。

### 22.7 已開啟頁面的即時刷新

`HomePage.vue`、`ProgressPage.vue`、`ReviewPage.vue` 都以 `watch(() => syncStore.localLearningStateRevision, ...)` 監聽本機學習狀態的整體版本號。`localLearningStateRevision` **只在整個 `downloadState()` 呼叫成功完成後才加一次**（`src/stores/sync-store.ts`：`await cloudHydrationService.downloadState(targetUserId)` 完成、且 generation 未過期後才 `this.localLearningStateRevision += 1`）——它不是逐頁提交時遞增的計數器；若下載在完成 Attempts／Mastery／Reviews 其中幾頁後才失敗，這個版本號完全不會前進。

因此已開啟的頁面是在整個 hydration 流程結束、所有頁面資料都已提交完成之後，才重新呼叫 service／repository 取得一次最終狀態，而不是隨著雲端下載逐頁提交而多次重新載入。見 `p1-cloud-hydration.spec.ts` Journey C（Progress）、Journey F（Home）、Journey G（Review）：頁面停留在原地，雲端回應被延遲保留，回應釋放、hydration 完成後畫面才一次性更新為最終資料，過程中不發生導航或重新整理。

### 22.8 Active Session 與 Attempt Draft 永遠留在裝置本地

進行中的練習 Session 與尚未完成的 `AttemptDraft`（見第 8 節）不屬於雲端同步的資料集——`cloud-learning-state-mapper.ts` 的型別中沒有對應欄位，`CloudHydrationService` 也不會讀取或寫入 `sessions` store 的進行中內容。跨裝置恢復同一個未完成 Attempt 不是 P1 範圍；換裝置只會看到雲端已保存的 Settings、完成的 Attempts、Mastery、Reviews，不會看到另一台裝置上未完成的練習畫面。

### 22.9 錯誤、重試、離線與帳號衝突

- 帳號衝突（22.2 節）：顯示明確訊息並同時停止上傳與下載，保留現有本機投影不被覆蓋（見 `p1-cloud-hydration.spec.ts` Journey D）。
- 下載中的錯誤：`sync-store.ts` 記錄 `hydrationErrorMessage`，不會讓整個應用程式崩潰或卡在載入畫面。
- 離線：現有的 `OfflineSyncBanner.vue` 訊息優先序（Task 23 的 `bannerState`）維持不變，離線不影響已完成的本機投影，恢復連線後才觸發 `syncAndHydrate()`。
- 上傳去重：已標記 `synced` 的本機 Attempt 不會重送 RPC；伺服器 `record_exercise_attempt` 本身也以 `(user_id, client_attempt_id)` 去重（見 `docs/database-schema.md` 第 5 節）。
