# 練習回饋、題目解說與重試流程設計

日期：2026-07-19

## 背景

目前練習回饋頁有四個需要一起處理的問題：

1. 展開「查看計算方式」後，狹窄寬度下的計算內容可能互相遮擋。
2. 「本題按鍵解說」由前端固定按鍵字典推測，不是出題者匯入的說明。
3. 題目產生完成回饋後只能前往下一題，不能重做同一題。
4. 練習中的 restart 保留原始開始時間，計時器不會歸零。

現行 restart 保留 `clientAttemptId` 與 `startedAt`，而 `startedAt` 同時驅動畫面計時、attempt duration 與速度評分。因此，單獨把畫面時間歸零會造成 UI、評分與保存資料不一致。本設計將 restart 定義為「捨棄尚未完成的 attempt，建立全新 attempt」。

## 目標

- 展開計算方式時，內容在桌面與窄畫面都不重疊。
- 完成回饋中的解題說明完全來自題目匯入資料。
- 回饋畫面提供「再試一次」，可用新 attempt 重做同一題。
- restart 後，計時、操作與所有 attempt-scoped 狀態一致歸零。
- 同一題可保存多筆完成 attempt，但題組索引只前進一次。
- 更新測試與產品文件，使新行為取代「restart 保留時間」的舊規則。

## 非目標

- 不新增逐按鍵的題目專屬說明 schema。
- 不保存 restart 前尚未完成的 attempt 為失敗或中止紀錄。
- 不在本次改動中擴充題組結果頁或加入整組重做功能。
- 不修改評分公式；只讓評分使用目前這一次新 attempt 的資料。
- 不進行與本需求無關的題庫、同步或回饋頁重構。

## 既有資料與約束

題目 solution 已有必填欄位：

```ts
interface CatalogSolution {
  sequence: string;
  normalizedActions: NormalizedAction[];
  keystrokeCount: number;
  recommended: boolean;
  explanation: string;
  displayOrder?: number;
}
```

`solutions[].explanation` 已存在於 catalog contract、Supabase `exercise_solutions.explanation`、repository mapping 與題目資料中，因此本次不新增資料庫 migration 或 catalog schema。

目前完成 attempt 時，`PracticePage` 會立即更新 session 到下一題，再顯示本題 feedback。這個順序無法安全支援重做同一題，因為 retry 後再次完成可能讓 session 重複前進。因此 session 前進必須延後到使用者點擊「下一題」。

## 設計

### 1. 計算方式版面

修改 `src/components/feedback/ExerciseFeedback.vue` 內的局部樣式：

- `details.metric-explanation` 保持在正常文件流中，展開後由內容撐高父層。
- `.metric-explanation-grid` 使用可自動換欄的 responsive grid，而不是在所有非手機寬度強制三欄。
- 每個說明項目設定 `min-width: 0`，長文字允許正常換行。
- 寬畫面維持三欄；容器空間不足時自動變為兩欄或單欄。
- 不使用 absolute positioning、負 margin 或全域樣式覆寫。

可採用等價於下列行為的局部 CSS：

```css
.metric-explanation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
}

.metric-explanation-grid > section {
  min-width: 0;
  overflow-wrap: anywhere;
}
```

驗收重點不是固定使用哪一段 CSS，而是三個計算說明在不同寬度下不可互相覆蓋，展開內容也不可蓋住後續區塊。

### 2. 匯入式解題說明

完成回饋只顯示推薦 solution 的 `explanation`：

```text
exercise.solutions
→ recommended solution
→ solution.explanation
→ feedback.recommendedExplanation
→ ExerciseFeedback
```

`attempt-outcome-service` 在建立 feedback view model 時，將推薦 solution 的原始 `explanation` 放入語意明確的 `recommendedExplanation` 欄位；不借用其他評分理由欄位。

行為規則：

- 保留「本題按鍵解說」作為回饋區塊標題。
- 區塊內容改為出題者撰寫的一整段推薦解法說明。
- 不再呼叫固定 `KEY_DESCRIPTIONS` 推測每個按鍵的用途。
- 不再顯示「本題使用的 Vim 按鍵」等 fallback 系統文字。
- 若遇到舊資料或異常資料，且 explanation 經 trim 後為空字串，整個解說區塊不渲染。
- `ExerciseFeedback.vue` 直接渲染 `recommendedExplanation`；移除不再使用的 `VimKeyGuide.vue`、`vim-key-guide.ts` 與其專屬測試，避免保留第二套解說來源。

題目編寫指南需明確說明：`solutions[].explanation` 會在完成回饋中直接顯示給使用者，內容應解釋整套推薦操作與選擇原因，而不是內部備註。

### 3. 全新 attempt 初始化流程

`PracticePage` 應提供單一內部流程，例如 `startFreshAttempt()`，供練習中 restart 與回饋後 retry 共用。具體命名依既有程式風格決定。

每次開始全新 attempt 都必須：

- 產生新的 `clientAttemptId`。
- 將 `attemptStartedAt` 設為目前時間。
- 將 `keystrokeCount` 設為 `0`。
- 清空 `recordedActions`。
- 將 `resetCount` 設為 `0`。
- 清除 hints、未達成條件訊息與 `hasUserInteraction`。
- 清除目前 feedback 與待前進 outcome 狀態。
- 將內容、游標與 Vim mode 還原至題目初始值。
- 遞增 editor instance key，重建 Vim editor。
- 移除或覆寫舊的未完成 attempt draft，保存新 attempt 的 fresh draft。

`useAttemptElapsedTime` 不需要維護獨立的顯示起點；它繼續以 `attemptStartedAt` 計算。因為 fresh attempt 會更新 `attemptStartedAt`，計時器、保存的 duration 與 speed score 會自然使用同一個起點。

#### 練習中的 restart

- restart 前的 attempt 尚未完成，因此不建立 Attempt 成績紀錄。
- 舊 draft 被新的 fresh draft 取代。
- 新 attempt 的計時器立即回到 `00:00`。
- restart 不保留舊按鍵數、操作紀錄、提示或 reset penalty。

#### 回饋後的「再試一次」

- 已完成並保存的上一筆 Attempt 保留在歷史中。
- 清除 feedback，建立新的 attempt ID，重做同一 exercise。
- session 索引不變。
- 使用者再次完成後會保存第二筆 Attempt；最後顯示的 outcome 決定使用者點「下一題」時如何更新 session。

### 4. 完成、重試與下一題的資料流

將「保存 attempt」與「推進 session」分成兩個明確步驟。

#### 產生回饋

```text
達成完成條件或跳過
→ 等待 draft queue
→ 建立並保存 Attempt outcome
→ 標記目前 draft completed
→ 顯示 feedback
→ 記錄待前進 outcome 類型
→ session 仍停在本題
```

此時不得呼叫 `completeCurrentExercise()`、`skipCurrentExercise()` 或其他會改變 current exercise index 的流程。

#### 點擊「再試一次」

```text
feedback 顯示中
→ startFreshAttempt()
→ feedback 與待前進 outcome 清除
→ session 保持本題
→ 新計時與新 draft 開始
```

#### 點擊「下一題」

```text
feedback 顯示中
→ 根據目前 feedback 的 outcome 類型更新 session 一次
→ 保存 session
→ 若 session completed，導向結果頁
→ 否則載入下一題
```

即使同一題完成或重試多次，session 也只能在使用者最後點擊「下一題」時前進一次。

如果使用者在 feedback 顯示後離開頁面、但尚未點擊「下一題」，已完成 Attempt 仍然存在；session 仍指向本題。重新進入時會從同一題建立新 attempt，而不會默默跳過使用者尚未確認前進的題目。

### 5. ExerciseFeedback 互動

`ExerciseFeedback` 新增 `retry` 事件：

- 「再試一次」與「下一題」放在同一 action 區域。
- 「下一題」維持主要 CTA。
- 「再試一次」使用次要按鈕樣式。
- outcome 或 session 正在保存時，兩個按鈕都 disabled，避免重複提交或競態。
- `retry` 只表達使用者意圖；attempt 狀態重置由 `PracticePage` 負責。

「再試一次」在 feedback 顯示時提供，包括正常完成或跳過後的回饋；它一律建立同一題的新 attempt。

## 錯誤處理

### Attempt outcome 保存失敗

- 不顯示可前進的 feedback。
- 不更新 session。
- 保留目前題目與可恢復狀態，沿用既有錯誤提示及重試保存方式。

### Fresh draft 保存失敗

- 不得建立第二份 session 進度或刪除已完成 Attempt。
- 畫面維持同一題的新初始狀態，並透過既有 draft save error 呈現問題。
- 後續成功保存時覆寫為目前 fresh attempt draft。

### Explanation 異常

- catalog 匯入時仍由既有 contract 拒絕缺少或無效的 explanation。
- UI 對執行期舊資料做防禦：空白 explanation 不顯示解說區塊，不生成系統 fallback。

### 重複點擊與競態

- 保存 outcome、更新 session 或載入下一題時停用 retry/next。
- 同一次 feedback 只能觸發一次 session advancement。
- fresh attempt 建立後，舊 feedback 的事件不得再改變 session。

## 測試策略

### ExerciseFeedback 單元測試

- 顯示傳入的推薦 solution explanation。
- 不顯示固定按鍵字典描述與 generic fallback。
- 空白 explanation 不渲染解說區塊。
- 點擊「再試一次」會 emit `retry`。
- 保存中 retry 與 next 都 disabled。

### Attempt outcome／PracticePage 測試

- fresh attempt 產生不同的 attempt ID。
- fresh attempt 更新 startedAt。
- restart 後 keystroke count、actions、reset count、hints、互動旗標與 feedback 全部歸零。
- restart 前未完成 attempt 不寫入 Attempt repository。
- retry 後 exercise ID 與 session index 不變。
- 完成 outcome 保存後 session 尚未前進。
- 點 next 後 session 只前進一次。
- 最後一題在 next 後才標記 session completed 並導向結果頁。
- 已完成 attempt 在 retry 後仍保留，第二次完成會新增另一筆 attempt。

### Playwright E2E

- 展開「查看計算方式」，在桌面與窄 viewport 檢查各說明區塊 bounding boxes 不相交。
- 展開內容會推開後續區塊，而不是覆蓋。
- restart 前先經過可觀察時間，restart 後計時回到 `00:00` 或容許的一秒內。
- restart 後完成題目，duration 與 speed score 只反映新 attempt。
- 完成 → 再試一次 → 確認仍為同一題 → 再次完成 → 下一題，確認沒有跳題或重複前進。
- 更新現有「restart 後 elapsed 不得倒退」斷言，使其改為驗證 fresh attempt 歸零。

### Catalog 與作者文件測試

- 保留 `solutions[].explanation` 必填 contract 測試。
- 不新增 schema、migration 或 production hash 語意。
- 題目編寫指南範例應包含面向學習者的完整解法說明。

## 文件同步

需要更新下列既有規則：

- `docs/architecture.md`：restart 不再保留 attempt ID 與 startedAt。
- `docs/product-spec.md`：restart 定義為捨棄未完成 attempt 並開始新 attempt。
- `docs/acceptance-criteria.md`：移除 restart 後 elapsed 不得歸零的舊驗收條件，改為新 attempt 全面重置。
- `docs/exercise-authoring-guide.md`：說明 `solutions[].explanation` 的使用者可見用途與撰寫要求。

## 驗收條件

1. 展開計算方式後，三段計算文字在支援的 viewport 下不互相遮擋。
2. 回饋中的解說逐字來自推薦 solution 的 `explanation`，不出現系統推測按鍵描述。
3. 練習中 restart 後，畫面時間於一秒容差內回到零。
4. restart 後的 attempt ID、開始時間、按鍵數、操作、提示與 reset count 都是全新狀態。
5. 完成 feedback 顯示「再試一次」與「下一題」。
6. 點「再試一次」會留在同一題，且建立全新 attempt；前一筆已完成 Attempt 不被刪除。
7. 顯示 feedback 時 session 尚未前進；只有點「下一題」才前進一次。
8. 最後一題只有在點「下一題」後才完成 session 並進入結果頁。
9. 單元、整合與 E2E 測試通過，且產品文件不再宣稱 restart 保留時間。
