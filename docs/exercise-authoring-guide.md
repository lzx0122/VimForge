# 題庫編寫指南

## 編寫入口與來源

`content/catalog.json` 是 ChatGPT 編輯與提交前驗證的 canonical 題庫快照。它包含完整、明確列出的 exercises；每個 exercise 都有不可變的 stable slug，不再以 `variants[].count` 在匯入時隱式產生題目。

首次建立快照時，工具會從 `supabase/seed.sql` 的 `$catalog$` JSON block 依宣告順序展開既有題庫。之後每一輪編輯都應先取得 production export snapshot，再以該 snapshot 作為 ChatGPT 編輯的起點；不要把手寫 SQL 當成 ChatGPT 的主要編輯格式。SQL seed 仍保留作為資料庫初始化來源，並可用下列 legacy validator 檢查：

```bash
npx --no-install vite-node --script scripts/validate-seed.ts
```

## 題庫目標

- 必須有 10 個 published units、合計 100 個 published exercises。
- 語言比例固定為 60/20/20：C# 60 題、TypeScript/JavaScript 合計 20 題、JSON/HTML/CSS/SQL/Markdown 等其他語言合計 20 題。
- 單元與題數依 `docs/product-spec.md` 的課程地圖配置。
- 每題必須有 Skill、Solution、Hints；不得加入 MVP 以外的遊戲化或管理功能。

## Canonical snapshot 結構

根物件必須包含 `schemaVersion: 1`、正整數 `catalogRevision`、`catalogHash`、ISO `exportedAt` 與 `units`。每個 unit 直接包含 `exercises`：

```json
{
  "schemaVersion": 1,
  "catalogRevision": 1,
  "catalogHash": "sha256:<64 lowercase hex>",
  "exportedAt": "2026-07-17T00:00:00.000Z",
  "units": [
    {
      "slug": "text-objects",
      "title": "文字物件",
      "description": "練習文字物件。",
      "difficulty": "advanced",
      "estimatedMinutes": 20,
      "displayOrder": 8,
      "isPublished": true,
      "skills": [],
      "exercises": [
        {
          "slug": "text-objects-01",
          "title": "修改字串",
          "instruction": "只修改目標字串。",
          "language": "typescript",
          "exerciseType": "challenge",
          "difficulty": "advanced",
          "initialContent": "const label = \"draft\";",
          "expectedContent": "const label = \"approved\";",
          "initialCursor": { "line": 0, "column": 15 },
          "completionRule": {
            "contentMatch": "exact",
            "cursorMatch": { "type": "ignore" },
            "requiredMode": "normal"
          },
          "supportedModes": ["memory_review", "efficiency"],
          "targetDurationMs": 8000,
          "version": 1,
          "isPublished": true,
          "skills": [
            { "skillSlug": "quoted-text-object", "weight": 1, "primary": true }
          ],
          "solutions": [],
          "hints": []
        }
      ]
    }
  ]
}
```

`skills` 關係的 weights 必須總和為 `1` 且恰有一個 `primary: true`。`solutions` 至少一筆且恰有一筆 `recommended: true`；每筆都要有正整數 `keystrokeCount` 與合法的 `normalizedActions`。`hints` 必須各有 level 1、2、3、4，不能重複或缺漏。stable slug 只能使用小寫字母、數字與連字號；既有 slug 不可改名。

## 給 ChatGPT 的編輯提示

每次請附上完整的 `content/catalog.json`（或由 production export 取得的完整 snapshot）與以下要求：

1. 回傳完整 JSON 根物件，不要只回傳片段。
2. 保留未修改 unit、exercise、skill、solution、hint 的所有欄位與順序。
3. 新題目使用新的 stable slug；不要重新編號既有題目，也不要用 ordinal-only 的重複情境充數。
4. 不要使用 Markdown code fence、註解或 JSON 以外的文字。
5. 新增或修改題目時，維持合法語言、模式、完成條件、技能權重、解法與四層提示。

## 離線驗證

在 repository root 執行：

```bash
npm run content:validate -- content/catalog.json
```

成功輸出固定為 `Validated 10 units and 100 exercises.`。錯誤會列出 JSON path 並以 nonzero exit code 結束；validator 只讀取檔案，不啟動或連線任何 Supabase，也不會修改輸入檔案。提交前仍需依 Task protocol 執行完整的 `npm run type-check`、`npm run lint`、`npm run test` 與 `npm run build`。
