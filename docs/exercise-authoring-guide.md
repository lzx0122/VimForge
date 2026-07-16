# 題庫編寫指南

MVP 題庫的唯一編寫入口是 `supabase/seed.sql` 內的 `$catalog$` JSON block。後續 SQL 會把每個 unit 與 variant 展開成正式資料列；不要直接手寫重複的 `insert`，也不要在前端硬編題目。

## 題庫目標

- 必須有 10 個 published units、合計 100 個 published exercises。
- 語言比例固定為 60/20/20：C# 60 題、TypeScript/JavaScript 合計 20 題、JSON/HTML/CSS/SQL/Markdown 等其他語言合計 20 題。
- 單元與題數依 `docs/product-spec.md` 的課程地圖配置。
- 每題必須有 Skill、Solution、Hints；不得加入 MVP 以外的遊戲化或管理功能。

## Catalog 結構

每個 unit 定義共用的教學內容，再由 `variants` 產生實際題目：

```json
{
  "slug": "basic-cursor-movement",
  "title": "基礎游標移動",
  "description": "練習 h、j、k、l。",
  "difficulty": "beginner",
  "estimatedMinutes": 20,
  "displayOrder": 2,
  "published": true,
  "exerciseType": "guided",
  "supportedModes": ["beginner", "memory_review"],
  "skills": [],
  "solutions": [],
  "hints": [],
  "variants": []
}
```

合法值如下：

- `difficulty`：`beginner`、`intermediate`、`advanced`。
- `exerciseType`：`tutorial`、`guided`、`challenge`、`review`。
- `supportedModes`：`beginner`、`memory_review`、`efficiency`，至少一個。
- `language`：`csharp`、`typescript`、`javascript`、`json`、`html`、`css`、`sql`、`markdown`、`plaintext`。
- `completionRule.contentMatch`：`exact` 或 `unchanged`。
- `completionRule.cursorMatch.type`：`ignore`、`exact` 或 `range`。
- `completionRule.requiredMode`：需要時使用 `normal`、`insert`、`visual`、`replace` 或 `command`。

`variants[].count` 決定該 variant 產生幾題。可在 title、instruction、內容、解法與提示中使用 `{{n}}`，展開時會以該 variant 內從 1 開始的 ordinal 取代。產生後的 exercise slug 由 unit slug 與單元內題號組成，因此 unit slug 與 display order 都必須唯一。

## Skill、Solution、Hints

每個 unit 的共用資料會附加到該 unit 產生的每一題：

- `skills` 至少一項；`weight` 必須大於 0，且每題所有 skill weights 總和必須為 1。至少一項應標示 `primary: true`。
- `solutions` 至少一項，必須包含非空的按鍵序列、normalized actions、正整數 keystroke count 與說明；至少一項必須標示 `recommended: true`。
- `hints` 必須完整提供 level 1、2、3、4，各 level 不得重複。提示需由方向性提示逐步增加到完整操作，`commandPreview` 可在不應直接揭露指令時使用 `null`。

同一 unit 共用解法與提示只適合操作結構相同的 variants。若正確操作或教學內容不同，請拆成另一個 unit 或調整 variant 分組，不要提供與題目不一致的共用資料。

## 游標與完成條件

`initialCursor.line` 與 `column` 都是從 0 開始。line 必須存在，column 可以等於該行長度，但不得超出。換行內容請使用 JSON 的 `\n`。

`expectedContent` 必須描述完成後內容。`completionRule` 要明確指定內容比對、游標比對，以及必要時的 Vim mode。例如只判斷內容且要求回到 Normal Mode：

```json
{
  "contentMatch": "exact",
  "cursorMatch": { "type": "ignore" },
  "requiredMode": "normal"
}
```

新增題目時，先人工確認起始游標指向預期字元，再讓 validator 進行邊界與 TypeScript schema 驗證。

## 驗證流程

在 repository root 執行：

```bash
npx --no-install vite-node --script scripts/validate-seed.ts
npx vitest run scripts/validate-seed.test.ts
```

第一個指令成功時會輸出 `Validated 10 units and 100 exercises.`。提交前仍需依 Task protocol 執行完整的 `npm run type-check`、`npm run lint`、`npm run test` 與 `npm run build`。任何 validator 錯誤都必須修正，不得調低題數、放寬比例或略過 schema 檢查。
