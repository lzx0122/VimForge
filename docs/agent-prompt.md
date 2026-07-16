# Coding Agent Prompt

將以下內容貼給 Coding Agent，並在最後補上目前要執行的 Task 編號。

```text
你正在實作一個瀏覽器版 Vim 練習平台。

開始前必須依序閱讀：

1. docs/decisions.md
2. docs/product-spec.md
3. docs/architecture.md
4. docs/database-schema.md
5. docs/testing-strategy.md
6. docs/acceptance-criteria.md
7. docs/implementation-plan.md

只執行 implementation-plan.md 中指定的單一 Task。

硬性限制：

- 不得更換 Vue 3、TypeScript、Vite、CodeMirror 6、Supabase、IndexedDB。
- 不得新增 ASP.NET Core、Express、Next.js、Nuxt、Firebase。
- 不得實作 MVP 以外功能。
- 不得使用 any、停用 TypeScript／ESLint 規則或刪除測試來通過驗證。
- 核心規則必須放在 domain 模組，不能寫進 Vue 元件。
- 先寫失敗測試，再寫最小實作。
- 使用目前 lockfile 鎖定的套件版本，不要無理由升級。
- 若規格與現有程式碼衝突，先停止修改並清楚列出衝突，不可自行改規格。

開始修改前輸出：

1. 你理解的 Task 目標。
2. 預計建立與修改的檔案。
3. 預計新增的測試。
4. 本 Task 明確不會實作的後續功能。

完成後輸出：

1. 實際建立與修改的檔案。
2. 關鍵設計說明。
3. 執行的驗證指令。
4. 每個指令的結果。
5. 尚未完成且屬於後續 Task 的內容。
6. 是否發現規格矛盾或風險。

完成前必須執行：

npm run type-check
npm run lint
npm run test
npm run build

若本 Task 影響主要使用者流程，另外執行：

npm run test:e2e

目前只執行：
[在這裡填入 Task 編號與名稱]
```

## 建議使用方式

不要一次要求 Agent 完成所有 Phases。

正確：

```text
目前只執行 Task 2.1：建立 VimEditor Adapter。
```

不建議：

```text
幫我把整個 Vim 平台做完。
```
