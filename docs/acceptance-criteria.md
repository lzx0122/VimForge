# Acceptance Criteria

## AC-001：模式選擇

Given 使用者進入首頁  
When 頁面載入完成  
Then 顯示「從零開始」、「記憶複習」、「效率進階」三張卡片  
And 三張卡片皆可用鍵盤選取

## AC-002：模式不是永久等級

Given 使用者完成過效率進階題目  
When 返回首頁  
Then 仍可選擇從零開始  
And 不需重設帳號或進度

## AC-003：題量

Given 使用者選擇記憶複習或效率進階  
When 進入設定頁  
Then 可選 5、10、20 題  
And 預設為 10 題

## AC-004：自由課程

Given 使用者從未完成基礎移動  
When 進入課程地圖  
Then 仍可進入文字物件單元  
And 系統最多顯示先備技能建議  
And 不阻止進入

## AC-005：訪客開始

Given 使用者未登入  
When 點擊任一模式  
Then 可直接開始練習  
And 不跳轉到登入頁

## AC-006：CodeMirror Vim

Given 練習題已載入  
When 編輯器取得焦點  
Then Normal Mode Vim 操作有效  
And 目前 Mode 顯示在頁面上

## AC-007：題目狀態隔離

Given 使用者在上一題有 Undo 歷史與搜尋狀態  
When 切換下一題  
Then 下一題沒有上一題 Undo 歷史  
And 搜尋、Visual Selection、Pending Operator 均清除

## AC-008：精確內容判定

Given completion_rule.contentMatch 為 exact  
When 最終內容完全等於 expected_content  
Then contentMatched 為 true  
When 只有一個字元不同  
Then contentMatched 為 false

## AC-009：游標判定

Given completion_rule.cursorMatch 為 exact  
When 內容正確但游標位置錯誤  
Then 題目不得完成

## AC-010：Mode 判定

Given requiredMode 為 normal  
When 內容已正確但仍在 Insert Mode  
Then 題目不得完成  
And 顯示「請回到 Normal Mode」

## AC-011：未知有效解法

Given 最終狀態符合完成條件  
And 操作序列不在 exercise_solutions  
When 評估題目  
Then 題目仍算完成  
And solutionMatch 為 unknown_valid  
And 顯示推薦解法

## AC-012：提示順序

Given 使用者尚未看提示  
When 第一次點提示  
Then 只顯示 Level 1  
When 再次點提示  
Then 顯示 Level 2  
And 不可直接跳到 Level 4

## AC-013：完整提示

Given 使用者開啟 Level 4  
When 操作示範完成  
Then 題目重設  
And 使用者必須親自完成  
And 動畫不直接產生成功 Attempt

## AC-014：速度

Given 題目正確完成  
When 計算速度  
Then 使用按鍵效率 60% 與時間效率 40%  
And 分數限制為 0–100

## AC-015：未完成速度

Given 題目未完成或跳過  
When 計算速度  
Then speedScore 為 0

## AC-016：準確

Given 使用者有兩次 mistake、一次 undo、最高 Hint Level 2  
When 題目完成  
Then accuracyScore 為 79

## AC-017：提示不累加

Given 使用者先看 Level 1 再看 Level 3  
When 計算準確  
Then 只套用 Level 3 的 15 分扣分  
And 不套用 3 + 8 + 15

## AC-018：熟練長期性

Given 使用者只在一題取得高分  
When 更新熟練  
Then 不得直接進 Level 4 或 Level 5

## AC-019：Level 5 門檻

Given masteryScore 大於等於 85  
But 使用者沒有經過七天以上無提示成功  
When 計算 level  
Then 最高維持 Level 4

## AC-020：今日複習

Given 使用者選擇 10 題今日複習  
And 候選題充足  
When 系統建立題組  
Then 包含 7 題到期／錯題  
And 2 題弱項  
And 1 題已熟悉抽查

## AC-021：題目不足遞補

Given 到期題只有 3 題  
When 使用者要求 10 題  
Then 剩餘題目依弱項、久未複習、同難度題遞補  
And 同一 Exercise 不重複

## AC-022：指定主題

Given 使用者有到期文字物件題  
When 只選擇搜尋主題練習  
Then 搜尋題正常產生  
And 原到期文字物件題仍保留

## AC-023：本機優先

Given 使用者完成一題  
When Supabase 無法連線  
Then Attempt 先保存 IndexedDB  
And 顯示離線同步訊息  
And 使用者可繼續下一題

## AC-024：重新整理保存

Given 訪客已完成一題  
When 重新整理頁面  
Then 已完成紀錄仍存在  
And 練習進度可恢復

## AC-025：去重同步

Given 同一 clientAttemptId 因網路錯誤重送兩次  
When Supabase 接收  
Then資料庫只存在一筆 Attempt

## AC-026：Google 登入合併

Given 訪客有本機 Attempts  
When Google OAuth 成功  
Then pending Attempts 同步至帳號  
And 本機紀錄標記 synced  
And 同步失敗的紀錄仍保留

## AC-027：RLS

Given 使用者 A 與 B 均已登入  
When A 嘗試讀取 B 的 exercise_attempts  
Then 查詢回傳空集合或權限錯誤  
And 不洩漏 B 的資料

## AC-028：公開題庫

Given 使用者未登入  
When 查詢 published exercises  
Then 可讀取  
When 查詢 unpublished exercises  
Then 不可讀取

## AC-029：SPA 深層路由

Given 使用者直接開啟 `/courses/text-objects`  
When Vercel 回應  
Then Vue SPA 正常載入  
And 不回傳 404

## AC-030：手機提示

Given 裝置沒有實體鍵盤或寬度偏小  
When 進入練習頁  
Then 顯示建議使用電腦與實體鍵盤  
And 仍可查看課程與進度
