# Codex 啟動方式

## 1. 建立基準版本

在專案根目錄執行：

```bash
git init
git add README.md AGENTS.md CODEX-START.md docs manifest.json
git commit -m "docs: add vim practice implementation specification"
```

## 2. 啟動 Codex CLI

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

進入 Codex 後先確認工作區與規則：

```text
/status
```

接著輸入：

```text
請先閱讀 AGENTS.md、README.md，以及 AGENTS.md 指定的全部規格文件。
不要修改任何檔案。
請回報：
1. 你載入了哪些規則與規格文件；
2. implementation-plan.md 有哪些 Phase 與 Task；
3. Task 0.1 的目標、預計檔案、測試與驗證方式；
4. 是否發現規格矛盾。
```

確認 Codex 的理解正確後，設定長期目標：

```text
/goal 依照 AGENTS.md 與 docs/implementation-plan.md，逐 Task 建立 Vim Practice Platform；維持測試、型別檢查、Lint 與 Build 通過，不擴充 MVP，不自行更換技術。
```

## 3. 第一個實作指令

```text
執行 Task 0.1：初始化 Vue 專案與品質工具。

嚴格遵守 AGENTS.md 與 docs/agent-prompt.md。
只完成 Task 0.1，不要開始 Task 0.2。
先說明理解、檔案、測試與非本次範圍，再開始修改。
完成後執行所有 Task 0.1 要求的驗證，修正到全部通過，更新 implementation-plan.md 對應勾選，並建立規格指定的 Git commit。
```

## 4. 每個 Task 完成後

輸入：

```text
/review
```

再輸入：

```text
/diff
```

確認沒有問題後，繼續下一個 Task，例如：

```text
執行 Task 0.2：建立共用型別與資料驗證。
嚴格遵守 AGENTS.md，只完成 Task 0.2。完成後執行必要驗證、更新計畫勾選並建立規格指定的 commit。
```

## 5. 建議的人工檢查點

- 完成 Phase 0：確認工具鏈、Router 與測試框架穩定。
- 完成 Phase 2：實際操作 CodeMirror Vim，確認按鍵與模式正確。
- 完成 Phase 5：確認訪客模式、IndexedDB 與重新整理恢復正常。
- 開始 Phase 6 前：建立 Supabase 專案並準備公開前端環境變數。
- 開始 Phase 7 前：設定 Google OAuth。
- Phase 10：連接 Vercel、執行完整 E2E 與部署驗收。

## 6. 中斷後繼續

在原專案目錄重新啟動：

```bash
codex resume --last
```

進入後檢查：

```text
/status
/goal
```

然後告訴 Codex：

```text
讀取 Git 狀態與 docs/implementation-plan.md，找出最後一個已完成且已提交的 Task。不要重做已完成內容。先回報目前狀態，再執行下一個尚未完成的 Task。
```
