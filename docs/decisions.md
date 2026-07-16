# Architecture Decision Records

## DEC-001：產品型態

建立純瀏覽器 Vim 練習平台。使用者不需要安裝 Vim、Neovim、IdeaVim 或其他外掛。

## DEC-002：前端框架

使用 Vue 3、TypeScript 與 Vite。

不得改成 React、Next.js、Nuxt 或其他框架。

## DEC-003：編輯器與 Vim 模擬

使用 CodeMirror 6 搭配 `@replit/codemirror-vim`。

不自行重寫完整 Vim 引擎。

## DEC-004：後端服務

使用 Supabase 提供：

- Google OAuth
- PostgreSQL
- Data API
- Row Level Security
- Database Functions

MVP 不建立 ASP.NET Core、Node.js、Express 或其他自訂 API 伺服器。

## DEC-005：部署

Vue SPA 部署至 Vercel。

專案根目錄必須包含 `vercel.json`，將所有 SPA 路由 rewrite 至 `/index.html`。

## DEC-006：訪客模式

訪客不用登入即可練習。

訪客資料使用原生 IndexedDB，透過 Repository 介面封裝。不得只使用記憶體或 localStorage 保存答題紀錄。

## DEC-007：登入方式

MVP 僅支援 Google OAuth。

不實作 Email 密碼、Magic Link、GitHub OAuth。

## DEC-008：學習模式

首頁提供三種可自由選擇的模式：

- `beginner`：從零開始
- `memory_review`：記憶複習
- `efficiency`：效率進階

模式是本次練習方式，不是永久等級。

## DEC-009：題量

記憶複習與效率進階可選：

- 5 題
- 10 題
- 20 題

預設 10 題。

## DEC-010：課程單元

所有課程單元可自由進入，不使用強制解鎖。

系統可以顯示先備技能建議，但不能阻止進入。

## DEC-011：評價指標

每題分別顯示：

- 速度 `0–100`
- 準確 `0–100`
- 熟練 `0–5`

不合併成單一總分。

## DEC-012：題庫

MVP 題庫約 100 題，使用 Supabase Seed Data 匯入。

不做題庫管理後台。

## DEC-013：題目語言比例

- C#：60%
- TypeScript／JavaScript：20%
- JSON、HTML、CSS、SQL、Markdown：20%

至少 80% 題目使用程式碼情境。

## DEC-014：每日複習比例

今日自動複習：

- 到期與錯題：70%
- 弱項補強：20%
- 已熟悉抽查：10%

## DEC-015：離線優先寫入

每次完成題目：

1. 先寫入 IndexedDB。
2. 再同步 Supabase。
3. 失敗時標記為 `pending`。
4. 網路恢復後重試。

## DEC-016：外掛預留

答題紀錄包含 `source`：

- `web`
- `neovim`
- `ideavim`
- `vscode_vim`

MVP 只會寫入 `web`，其他來源只保留資料契約。

## DEC-017：核心模組邊界

以下模組必須為不依賴 Vue 的純 TypeScript：

- `ExerciseEvaluator`
- `CommandNormalizer`
- `SolutionMatcher`
- `ScoringCalculator`
- `MasteryCalculator`
- `ReviewScheduler`
- `PracticeSelector`

## DEC-018：安全

所有 Supabase `public` schema 資料表均啟用 RLS。

使用者資料以：

```sql
(select auth.uid()) = user_id
```

限制擁有者。前端只使用 Publishable Key，禁止暴露 Service Role 或 Secret Key。

## DEC-019：裝置範圍

MVP 以桌面電腦與實體鍵盤為主要環境。

手機可查看課程與進度，但不保證完整 Vim 操作。
