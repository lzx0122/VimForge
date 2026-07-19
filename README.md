# VimForge

VimForge 是以 Vue 3、TypeScript、CodeMirror 6 與 Supabase 建立的瀏覽器 Vim 練習平台。訪客資料會先保存至 IndexedDB；登入後再同步至受 RLS 保護的 Supabase PostgreSQL。

## 本機啟動

需求：Node.js 20.19 以上與 npm。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

在 `.env.local` 填入瀏覽器可公開的 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY`。不得放入 service-role key、Supabase secret key 或 Google client secret。

## 驗證

```bash
npm run type-check
npm run lint
npm run test
npm run build
npm run test:e2e
```

題庫另可執行：

```bash
npx vite-node --script scripts/validate-seed.ts
```

## 文件

- [產品規格](docs/product-spec.md)
- [架構](docs/architecture.md)
- [資料庫 Schema](docs/database-schema.md)
- [題目編寫指南](docs/exercise-authoring-guide.md)
- [部署指南](docs/deployment.md)
- [維運手冊](docs/operations.md)
- [驗收對照](docs/acceptance-verification.md)

## 部署架構

```text
Vue 3 SPA on Vercel
   │
   ├── 訪客與離線資料：IndexedDB
   └── 雲端資料：Supabase
         ├── Google OAuth
         ├── PostgreSQL
         ├── Row Level Security
         └── Database Functions
```

Vercel、Supabase Redirect URLs 與 Google OAuth 的逐步設定及上線檢查，請依照[部署指南](docs/deployment.md)操作。

## MVP 範圍

本專案不包含自訂後端、排行榜、好友／聯賽、XP／等級／徽章、付費訂閱、題庫後台、AI 產題或手機完整 Vim 練習體驗。
