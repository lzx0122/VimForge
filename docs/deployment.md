# Production Deployment

本指南涵蓋 Supabase、Google OAuth 與 Vercel 的首次設定。以下命令必須在專案根目錄執行；`<...>` 均為部署者自行替換的值，不可直接照抄。

## 1. 前置需求

- Node.js 20.19 以上與 npm。
- 已建立 Supabase project，且本機 Supabase CLI 已登入並完成 linkage。
- 已建立 Google Cloud OAuth 2.0 Web application。
- 已建立或可建立 Vercel project。
- 正式網域與預覽網域均使用 HTTPS。

先確認應用程式本身可建置：

```bash
npm ci
npm run type-check
npm run lint
npm run test
npm run build
```

## 2. Supabase 資料庫

Production content tooling is pinned to Supabase CLI `2.79.0`; use the
repository script so an unpinned global binary cannot accidentally apply a
migration:

```bash
npx --no-install supabase@2.79.0 --version
npm run supabase:cli -- --version
```

The `--no-install` flag intentionally fails when the pinned CLI is not already
available. Install or cache that exact version through the team's approved
tooling, then link the checkout to the intended project and verify the link
before running any push:

```bash
npx --no-install supabase@2.79.0 login
npx --no-install supabase@2.79.0 link --project-ref <production-project-ref>
npx --no-install supabase@2.79.0 status --linked --output json
```

The status output must identify the exact production project ref. Do not use a
local Supabase instance for the catalog release workflow; local database/RLS
tests are a separate disposable verification step described in
[operations.md](operations.md#rls-與資料庫驗證).

連結目標 project，再依 migration 檔名順序套用 Schema、RLS 與 database function。Production schema migration is the `supabase db push` workflow shown below; 題庫不得以 seed 或 `--include-seed` 推送，catalog 必須透過 reviewed migration workflow 發布。

```bash
npx --no-install supabase@2.79.0 db push --linked

# Production catalog releases: validate, prepare, and publish the reviewed migration.
npm run content:validate -- content/catalog-modified.json
npm run content:prepare-release -- content/catalog-modified.json
npm run content:publish:production -- content/release-manifest.json
```

`supabase/seed.sql` is for disposable local/bootstrap verification only; do not
run `db push --include-seed` against production.

推送後必須依[維運手冊](operations.md#rls-與資料庫驗證)驗證 RLS。不要以 service-role 身分判斷 RLS 是否有效；測試需使用 anon／authenticated 角色。

## 3. Google OAuth 與 Supabase Auth

### Google Cloud Console

OAuth client 類型選擇 Web application：

1. **Authorized JavaScript origins** 加入 `http://localhost:5173` 與正式站台 origin，例如 `https://vimforge.example.com`。Google origins 不接受路徑；若要測試 Vercel Preview，逐一加入實際 preview origin，不使用萬用字元。
2. **Authorized redirect URIs** 加入 Supabase provider 頁面顯示的 callback，例如 `https://<project-ref>.supabase.co/auth/v1/callback`。這裡不是 Vue 的 `/auth/callback`。
3. 將 Google Client ID 與 Client Secret 只填入 Supabase Dashboard 的 Google provider 設定。不得放入 Vite、Vercel 前端環境變數、原始碼或 Git。

### Supabase URL Configuration

在 Authentication → URL Configuration：

- Site URL 設為正式 origin，例如 `https://vimforge.example.com`。
- Redirect URLs 加入 `http://localhost:5173/auth/callback`。
- Redirect URLs 加入精確正式 callback：`https://vimforge.example.com/auth/callback`。
- 若需要 Vercel Preview，加入官方建議的 project pattern，例如 `https://*-<team-or-account-slug>.vercel.app/**`；權限允許時優先列出實際 preview callback。

應用程式送給 Supabase 的 `redirectTo` 是目前 origin 加 `/auth/callback`；Supabase 再經由 Google 使用 `/auth/v1/callback` 完成 provider callback。兩者用途不同。

## 4. Vercel

匯入 Git repository，framework 選 Vite。`vercel.json` 已固定：

- Build command：`npm run build`
- Output directory：`dist`
- 所有 SPA 路由 rewrite 到 `/index.html`
- 基本安全 response headers

在 Preview 與 Production 各自加入以下兩個瀏覽器可公開環境變數：

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

可使用 Dashboard，或先連結 project 後透過 CLI 設定：

```bash
vercel link
vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY preview
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
```

不要建立 `VITE_SUPABASE_SERVICE_ROLE_KEY`、`VITE_SUPABASE_SECRET_KEY` 或 `VITE_GOOGLE_CLIENT_SECRET`。Vite 的 `VITE_` 值會進入瀏覽器 bundle。環境變數異動只會套用至新 deployment，需重新部署。

## 5. Preview 與 Production 驗證

部署 Preview 後，至少直接開啟下列網址並重新整理；皆應回傳 SPA 而非 404：

- `https://<preview-host>/`
- `https://<preview-host>/courses/text-objects`
- `https://<preview-host>/practice/setup?mode=memory_review`
- `https://<preview-host>/auth/callback`

接著驗證訪客練習、離線保存、Google 登入、pending attempt 同步，以及兩個帳號間的 RLS 隔離。Production promotion 後以正式網域重跑相同 smoke test。

正式上線前不可略過 `npm run test:e2e`。沒有 Supabase project linkage、Google provider 或 Vercel project 時，只能完成本機與靜態驗證，不能把外部 smoke test 標記為通過。

## 官方參考

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase database testing](https://supabase.com/docs/guides/database/testing)
- [Google OAuth 2.0 policy](https://developers.google.com/identity/protocols/oauth2/policies)
