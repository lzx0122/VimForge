# Acceptance Verification

此表將 `docs/acceptance-criteria.md` 的每一項需求對應到可重複的自動化證據。標示「外部環境」的項目仍需在已連結的 Supabase／Vercel 環境完成 smoke test，不能由本機結果取代。

| AC | 自動化證據 | 外部環境補充 |
| --- | --- | --- |
| AC-001 | `LearningModeGrid.test.ts`、`guest-practice.spec.ts` | — |
| AC-002 | `guest-practice.spec.ts` | — |
| AC-003 | `PracticeSetupPage.test.ts`、`review-selection.spec.ts` | — |
| AC-004 | `CoursesPage.test.ts`、`course-navigation.spec.ts` | — |
| AC-005 | `guest-practice.spec.ts` | — |
| AC-006 | `VimEditor.test.ts`、`scoring-feedback.spec.ts` | — |
| AC-007 | `create-editor-state.test.ts` | — |
| AC-008 | `exercise-evaluator.test.ts` | — |
| AC-009 | `exercise-evaluator.test.ts` | — |
| AC-010 | `exercise-evaluator.test.ts`、`scoring-feedback.spec.ts` | — |
| AC-011 | `solution-matcher.test.ts`、`attempt-outcome-service.test.ts` | — |
| AC-012 | `ProgressiveHintPanel.test.ts`、`scoring-feedback.spec.ts` | — |
| AC-013 | `ProgressiveHintPanel.test.ts`、`scoring-feedback.spec.ts` | — |
| AC-014 | `scoring-calculator.test.ts` | — |
| AC-015 | `scoring-calculator.test.ts`、`attempt-outcome-service.test.ts` | — |
| AC-016 | `scoring-calculator.test.ts` | — |
| AC-017 | `scoring-calculator.test.ts` | — |
| AC-018 | `mastery-calculator.test.ts` | — |
| AC-019 | `mastery-calculator.test.ts` | — |
| AC-020 | `practice-selector.test.ts`、`review-selection.spec.ts` | — |
| AC-021 | `practice-selector.test.ts` | — |
| AC-022 | `topic-practice-service.test.ts`、`review-selection.spec.ts` | — |
| AC-023 | `indexed-db.test.ts`、`attempt-sync.test.ts`、`auth-sync.spec.ts` | 在實際 Supabase outage 情境重驗 |
| AC-024 | `indexed-db.test.ts`、`guest-practice.spec.ts` | — |
| AC-025 | `attempt-sync.test.ts`、record-attempt migration contract | 在 linked Supabase 重送同一 ID |
| AC-026 | `guest-sync-service.test.ts`、`auth-sync.spec.ts` | 完成實際 Google OAuth 登入 |
| AC-027 | `user-learning-migrations.test.ts`、`rls_user_learning.sql` | 在空 DB 執行 `supabase test db` |
| AC-028 | `validate-seed.test.ts`、`rls_user_learning.sql` | 在 anon session 查 published/unpublished |
| AC-029 | `deep-linking.spec.ts`、`vercel.json` 契約測試 | 直接載入 Vercel Preview 深層網址 |
| AC-030 | `deep-linking.spec.ts` | Production 行動裝置 smoke test |

## 驗收紀錄規則

- 自動化欄位只有在對應測試與完整 verification suite 通過後才算完成。
- 外部環境欄位需記錄 deployment URL、commit、執行日期與結果；不得記錄帳號憑證或 token。
- 失敗項目需保留為未通過，修正後重跑整個相關 journey，不以局部人工觀察取代。
