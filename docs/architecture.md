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
→ 呼叫 Supabase 記錄函式
→ 依 clientAttemptId 去重
→ 重新取得雲端摘要
→ 標記本機紀錄 synced
```

衝突規則：

- Attempt 是 append-only。
- 熟練摘要以 Attempts 重新計算或由資料庫函式更新。
- 不直接以本機熟練度覆蓋雲端熟練度。
- 合併失敗保留本機資料。

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
