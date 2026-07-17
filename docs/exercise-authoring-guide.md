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
      "skills": [
        {
          "slug": "quoted-text-object",
          "name": "引號內文字物件",
          "description": "選取並修改引號內的文字。",
          "category": "text_object",
          "difficulty": "advanced",
          "primary": true,
          "displayOrder": 1
        }
      ],
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
          "solutions": [
            {
              "sequence": "ci\"approved<Esc>",
              "normalizedActions": [
                { "type": "vim_command", "command": "ci\"" },
                { "type": "insert_text", "text": "approved", "textLength": 8 },
                { "type": "mode_change", "mode": "normal" }
              ],
              "keystrokeCount": 12,
              "recommended": true,
              "explanation": "使用文字物件取代引號內的內容。",
              "displayOrder": 1
            }
          ],
          "hints": [
            { "level": 1, "content": "先定位要修改的引號內文字。", "commandPreview": null },
            { "level": 2, "content": "使用變更指令搭配引號文字物件。", "commandPreview": "c + i + \"" },
            { "level": 3, "content": "輸入 approved 後回到 Normal Mode。", "commandPreview": "ci\"approved<Esc>" },
            { "level": 4, "content": "完整操作是 ci\"approved<Esc>。", "commandPreview": "ci\"approved<Esc>" }
          ]
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

validator 會將 ordinal-only 或高度相似的題目列為 warnings，讓既有 100 題基線仍可通過；完全相同的題目內容是 validation error。若要在發版時把所有多樣性警告升級為錯誤，使用：

```bash
npm run content:validate -- --strict-content-diversity content/catalog.json
```

Warnings 會連同 JSON path 印出；錯誤或 strict mode warnings 會以 nonzero exit code 結束。validator 只讀取檔案，不啟動或連線任何 Supabase，也不會修改輸入檔案。提交前仍需依 Task protocol 執行完整的 `npm run type-check`、`npm run lint`、`npm run test` 與 `npm run build`。

## Production snapshot editing workflow

Use this sequence for every catalog change. It is intentionally file based: the
only command that can change production is the separately guarded publish step.

1. Export the complete production snapshot and keep it as the review base:

   ```bash
   npm run content:export:production -- <production-project-ref>
   ```

   Confirm that the export revision and hash match `content/catalog.json` before
   asking ChatGPT to edit anything. Never use a hand-written SQL fragment as the
   editing source.

2. Give ChatGPT the complete JSON file (all units, skills, exercises, solutions,
   and hints), not a representative excerpt. Use this prompt:

   ```text
   Edit the attached VimForge catalog snapshot. Return one complete JSON root
   object and nothing else: no Markdown fences, comments, or explanation.
   Preserve schemaVersion, catalogRevision, exportedAt, every unchanged field,
   and the existing array order. Existing exercise slugs are stable IDs: never
   rename, renumber, or reuse them. New slugs must be lowercase kebab-case and
   unique. Keep every exercise valid for its unit, including one primary skill
   with weights totaling 1, one recommended solution, and exactly hint levels
   1, 2, 3, and 4. Do not add rankings, XP, badges, an admin feature, or any
   other non-MVP field. Return the full modified catalog JSON.
   ```

3. Save ChatGPT's response as a new file such as
   `content/catalog-modified.json`. Validate both snapshots before reviewing
   changes:

   ```bash
   npm run content:validate -- content/catalog.json
   npm run content:validate -- content/catalog-modified.json
   npm run content:diff -- --base content/catalog.json content/catalog-modified.json
   ```

   Read the diff as a release review: `Added` creates a new exercise,
   `Changed` advances content-owned fields (and the exercise version), and
   `Unpublish` means the slug is absent from the modified snapshot. Removed
   exercises are unpublished rather than deleted so historical attempts retain
   their foreign keys. A diff over 25% requires an explicit large-change
   confirmation; do not bypass that review casually.

4. Prepare the migration and hash-bound manifest. The command writes one
   timestamped migration and does not contact Supabase:

   ```bash
   npm run content:prepare-release -- content/catalog-modified.json
   ```

   Review the generated SQL and `content/release-manifest.json`. Confirm the
   manifest counts, target hash, base revision, and migration path are exactly
   the values shown by the diff. Keep the modified snapshot and migration in
   the same change for review.

5. Before publishing, verify the production project twice. The linked project
   must be the intended production ref, and the command requires typing that
   exact ref followed by the independent confirmation `PUBLISH`:

   ```bash
   npm run content:publish:production -- content/release-manifest.json
   ```

   The publisher performs a dry-run pending-migration check, reruns validation,
   prints the added/changed/unpublished counts, and verifies the private release
   revision and catalog hash after the migration. It never accepts a force or
   bypass flag. If the project ref, pending migration list, manifest hash, or
   post-publish state is unexpected, stop and investigate instead of pushing.

Expected preparation output has this shape (the timestamp and hash vary):

```text
Prepared 20260717010203_catalog_release.sql with target sha256:<64 lowercase hex>
```

Expected publish output has this shape:

```text
Catalog release summary: added 1, changed 1, unpublished 1, unchanged 98.
Published catalog revision 2 (sha256:<64 lowercase hex>) to <production-project-ref>.
```

The workflow is locally testable with mocked CLI calls. It does not start a
local Supabase instance and it must not be used as evidence that production was
verified; production verification requires the linked project, the typed ref,
the migration push, and the post-publish release-state query.
