# 練習回饋簡化 UX 設計

## 目標

將練習流程收斂成「使用者自己完成，完成後查看回饋」：移除播放功能，讓漸進提示支援題庫實際提供的任意層級，並讓按鍵解說只反映題目作者定義的推薦解法。

## 決策

### 1. 完全移除播放

- 刪除編輯器附近的播放區、播放按鈕、按鍵逐顆高亮與完成後內容預覽。
- Level 4 不再觸發重設，也不會以動畫代替使用者完成題目。
- 編輯器保留在頁面上，使用者仍可直接繼續練習或重新開始。

### 2. 漸進提示依實際存在的層級解鎖

- 題目可提供 1–4 的任意子集合，例如 `[1, 3]` 或 `[2, 4]`。
- 每次解鎖目前最高層級之後、數值最小的下一個可用提示。
- 不要求一定存在四層；不存在的層級不會阻塞後續提示。
- UI 顯示目前解鎖層級與可用提示數量，不把 `/ 4` 當成題目必須完成的進度。

### 3. 按鍵解說只使用題目推薦解法

- 題目作者在推薦 solution 的 `normalizedActions` 定義解說來源。
- 實際嘗試的 `normalizedActions` 仍保存於 Attempt，用於評分、解法比較與同步，但不再傳給按鍵解說。
- `insert_text` 的文字內容永遠不會轉成 Vim 按鍵；解說服務只分析推薦解法中的 Vim command、mode change、undo、search 等操作。
- 完成回饋中的 Vim 按鍵解說維持預設收合，只列出推薦解法中實際出現的唯一按鍵，依首次出現順序排列。

## 元件與資料流

```text
PracticeExercise.solutions[recommended].normalizedActions
    -> createAttemptOutcome.feedback.recommendedActions
    -> ExerciseFeedback.recommendedActions
    -> VimKeyGuide
```

`PracticePage` 不再匯入或渲染 `EditorPlayback`。`ProgressiveHintPanel` 只負責提示層級解鎖與顯示。

## 驗證重點

- ProgressiveHintPanel 在提示層級缺號時仍能依序顯示所有可用提示。
- Practice 頁面不再有播放按鈕、播放測試識別字或播放完成重設流程。
- Attempt outcome 的 feedback 使用推薦 actions 的複本，不與使用者 actions 共用參照。
- VimKeyGuide 的輸入文字不會產生解說，且使用者額外輸入的按鍵不會出現在完成回饋的解說中。
- 元件單元測試、服務測試、E2E 與完整驗證命令全部通過。
