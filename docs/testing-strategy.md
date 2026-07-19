# Testing Strategy

## 1. 測試分層

### Unit Tests

工具：Vitest。

必測：

- ExerciseEvaluator
- CommandNormalizer
- SolutionMatcher
- ScoringCalculator
- MasteryCalculator
- ReviewScheduler
- PracticeSelector
- IndexedDB Repositories

### Component Tests

工具：Vue Test Utils + Vitest。

必測：

- ModeSelectionCards
- QuestionCountSelector
- ProgressiveHintPanel
- ExerciseFeedback
- PracticeHeader
- TopicSelector
- OfflineSyncBanner

### Integration Tests

測試：

- Practice Store 與 IndexedDB。
- Supabase Repository 的資料轉換。
- 訪客登入合併。
- 題組恢復。
- 同步失敗後重試。

### End-to-End Tests

工具：Playwright。

主要流程：

1. 訪客選擇記憶複習、5 題。
2. 完成一題。
3. 重新整理。
4. 紀錄仍存在。
5. 進入結果頁。

其他：

- 自由選擇課程單元。
- 顯示題庫實際提供的提示層級；缺號時仍能依序解鎖。
- 未完成時不能自動結束。
- 內容正確但 Mode 錯誤時提示回 Normal。
- 同步錯誤不阻止下一題。
- 深層路由重新整理可正常載入。

## 2. Scoring Tests

### 速度

- 推薦 3 keys、實際 3 keys、低於目標時間 → 100。
- 推薦 3、實際 6、時間效率 50 → 50。
- 未完成 → 0。
- beginner 使用 2.0 時間寬限。
- memory_review 使用 1.3 時間寬限。
- efficiency 無寬限。

### 準確

- 一次完成、無提示 → 100。
- 2 mistakes、1 undo、Level 2 → 79。
- Level 1 後又 Level 3，只扣 Level 3。
- 跳過 → 0。
- 低效率但無錯誤 → 不扣準確。

### 熟練

- 同題立即重做倍率 0.4。
- 不同題同技能倍率 1.0。
- 隔天成功倍率 1.2。
- 七天成功倍率 1.35。
- Level 4 提示倍率 0.15。
- 高等級單次失敗有下降保護。
- 不符合最低條件時不得進 Level 4／5。

## 3. Practice Selector Tests

10 題：

- 7 due/error
- 2 weakness
- 1 mastered check

5 題：

- 3 due/error
- 1 weakness
- 1 mastered check

20 題：

- 14 due/error
- 4 weakness
- 2 mastered check

不足遞補：

```text
due 不足
→ weakness
→ overdue mastered
→ same difficulty random
```

同一 Exercise 不得重複。

## 4. RLS Tests

必須確認：

- anon 可讀 published 題庫。
- anon 不可讀 unpublished 題目。
- authenticated A 不可讀 B 的 Attempt。
- authenticated A 不可修改 B 的 Session。
- 使用者不能將 row 的 `user_id` 更新成他人。
- 前端 Publishable Key 無法修改題庫。
- 未授權角色不能執行 privileged Function。
- Service Role 不出現在前端 Bundle。

## 5. Accessibility

人工與自動檢查：

- 所有主要按鈕可用鍵盤操作。
- Focus 樣式可見。
- 編輯器焦點狀態清楚。
- 顏色不是唯一狀態提示。
- 結果卡有文字標籤。
- 提示按鈕具 `aria-expanded`。
- Mode 顯示具可讀文字。

## 6. Browser Matrix

MVP 必測：

- 最新穩定 Chrome。
- 最新穩定 Edge。
- 最新穩定 Firefox。
- macOS Safari 最新穩定版進行至少 Smoke Test。

## 7. Commands

專案 scripts：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "type-check": "vue-tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

每個 Task 至少執行：

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

影響主要流程時加上：

```bash
npm run test:e2e
```

## 8. Definition of Done

不得只因畫面看起來正常宣告完成。

完成必須：

- 測試通過。
- TypeScript 通過。
- Build 通過。
- 沒有 `any`、`TODO`、停用規則規避問題。
- 錯誤路徑有測試。
- 修改內容符合當前 Task，沒有超範圍功能。
