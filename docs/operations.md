# Production Operations

本手冊定義每次 release 的最低驗證、RLS 檢查、錯誤處理與回復方式。部署細節見[部署指南](deployment.md)。

## Release Checklist

## Catalog content release

Catalog authoring is a local-first, production-only workflow:

```text
export → ChatGPT edit → validate → diff → prepare → dry-run → publish
```

Run `npm run content:export:production`, provide the catalog JSON to ChatGPT,
then validate and review the semantic diff with `content:validate` and
`content:diff`. `npm run content:prepare-release -- <modified-json>` writes one
timestamped catalog migration and a hash-bound release manifest. The guarded
`npm run content:publish:production` command reruns validation, checks that the
linked project and pending migration match the manifest, displays the counts,
and requires typing the exact production project ref before it invokes the
pinned Supabase CLI. It reads the private release state back and succeeds only
when revision and catalog hash match the manifest. There is no force or bypass
flag.

This workflow never starts or requires a local Supabase instance. Removing an
exercise from JSON unpublishes it (`is_published = false`) so historical
attempts retain their foreign keys; hard deletion is not part of a release.
If post-publish verification fails, retain the migration and release evidence,
stop promotion, and prepare a reviewed forward-fix migration after confirming
the production release state. Do not reset, truncate, or roll back production.

在乾淨 checkout 執行：

```bash
npm ci
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
npx vite-node --script scripts/validate-seed.ts
```

檢查 `dist` 不含 service-role key、Supabase secret key、Google client secret 或其他實際憑證。確認 migration、seed 與 app commit 一起接受審查，並依[驗收對照](acceptance-verification.md)記錄 automated 與 external smoke test 結果。

## RLS 與資料庫驗證

靜態契約測試會檢查 migration 啟用 RLS、owner policy、append-only attempts、公開題庫 policy 與 pgTAP 測試內容：

```bash
npx vitest run scripts/user-learning-migrations.test.ts scripts/validate-seed.test.ts
npx vite-node --script scripts/validate-seed.ts
```

在可拋棄的本機 Supabase 資料庫從空 DB 套用全部 migration 與 seed，再執行 `supabase/tests/rls_user_learning.sql`：

```bash
supabase start
supabase db reset
supabase test db
```

測試必須證明：使用者 A 看不到使用者 B 的 attempt、attempt 無法 update/delete、anon 只能讀 published catalog。若本機 Docker、Supabase CLI linkage 或 project 設定不存在，記錄為「外部環境未驗證」，不可當成通過。

## 上線後 Smoke Test

1. 直接載入首頁、`/courses/text-objects`、練習設定與 `/auth/callback`，再各自重新整理。
2. 以訪客完成一題，確認重新整理後 session 與 attempt 仍存在。
3. 模擬離線完成一題，確認提示待同步且可繼續練習。
4. 以 Google 登入，確認 pending attempt 成功匯入；失敗項目仍留在 IndexedDB。
5. 以兩個測試帳號執行 RLS 隔離查詢，不使用 service-role key。
6. 檢查小螢幕練習頁顯示實體鍵盤建議。

## 錯誤監控與使用者訊息

最低監控策略是瀏覽器 console。可搜尋前綴 `[VimForge]`；每筆只包含固定 context、錯誤名稱與安全訊息。使用者介面則顯示可採取行動、但不揭露內部資料的訊息，例如稍後重試或確認網路。

任何環境均不得記錄 access token、refresh token、authorization header、OAuth code、完整 Supabase response、attempt 內容、IndexedDB payload、環境變數或使用者個資。不得直接 `console.error(error)`；所有預期外的錯誤都經過 sanitizer。

事件初步處理：

1. 由 `[VimForge] <context>` 判斷 auth、sync、practice 或 settings 範圍。
2. 在相同 deployment 與瀏覽器重現，不要求使用者傳送 token 或儲存內容。
3. 檢查 Vercel deployment logs、Supabase Auth logs 與 database logs，但仍遵守最小資料原則。
4. 若影響資料一致性，停止 promotion；保留 IndexedDB pending records，避免清除使用者尚未同步的紀錄。

## Rollback 與復原

- **Frontend Rollback：**在 Vercel 將上一個已驗證 deployment promote 為 Production，然後重跑 deep-link、auth 與 guest smoke test。
- **設定 Rollback：**還原上一組已知正確的非機密 URL／publishable key 設定並重新部署。Google secret 只在 Supabase provider 端輪替。
- **Database：**已套用的 migration 採 forward fix；不要在未確認資料影響前手動刪表、降版或回滾 migration。先備份、在 staging 演練修復 migration，再推至 Production。
- **Auth incident：**必要時在 Supabase 暫停 Google provider，保留本機 pending data，修正 Redirect URLs／provider 設定後再恢復。

復原後重跑完整 release checklist、RLS 測試與驗收對照。將 incident 時間、受影響版本、症狀、處置與驗證結果記錄在團隊的事件系統；不得附上任何 secret。
