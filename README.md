# Vim Practice Platform — Vibe Coding 規格包

這是一個「瀏覽器版 Vim 反覆練習平台」的 MVP 規格，設計目標接近 Epop 的學習節奏：

1. 依使用者需求選擇練習模式。
2. 直接在瀏覽器的 CodeMirror 編輯器操作 Vim。
3. 每題分別評估速度、準確與熟練。
4. 根據錯題與熟練度安排後續複習。
5. 訪客可立即練習，登入後可跨裝置保存。

## AI Coding Agent 閱讀順序

開始實作前，依序閱讀：

1. `docs/decisions.md`
2. `docs/product-spec.md`
3. `docs/architecture.md`
4. `docs/database-schema.md`
5. `docs/testing-strategy.md`
6. `docs/acceptance-criteria.md`
7. `docs/implementation-plan.md`
8. `docs/agent-prompt.md`

## 固定技術

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- CodeMirror 6
- `@replit/codemirror-vim`
- Supabase Auth
- Supabase PostgreSQL
- Supabase Data API
- IndexedDB
- Vitest
- Vue Test Utils
- Playwright
- Vercel

## MVP 部署方式

```text
Vue 3 SPA
   │
   ├── 部署：Vercel
   ├── 訪客資料：IndexedDB
   └── 雲端資料：Supabase
         ├── Google OAuth
         ├── PostgreSQL
         ├── RLS
         └── Database Functions
```

## MVP 明確不包含

- ASP.NET Core 或其他自訂後端
- Neovim、IdeaVim、VS Code 外掛
- 排行榜、好友、聯賽
- XP、等級、徽章、愛心、金幣
- 付費訂閱
- 題庫管理後台
- AI 自動生成題目
- 手機上的完整 Vim 練習體驗

## Agent 執行原則

- 一次只實作 `implementation-plan.md` 的一個 Task。
- 不得自行更換技術。
- 不得擴充 MVP。
- 核心規則必須寫成純 TypeScript 模組，不可塞進 Vue 元件。
- 每個 Task 先寫測試，再寫最小實作。
- 完成後必須執行型別檢查、測試與建置。
