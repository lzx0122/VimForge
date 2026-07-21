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

Given 題目提示層級為 Level 1、Level 3、Level 4
When 使用者依序點擊提示
Then 依序顯示 Level 1、Level 3、Level 4
And 不存在的 Level 2 不會阻塞後續提示
And 題目不要求一定提供四層提示

## AC-013：不提供播放

Given 使用者正在練習題目
When 使用者查看任一提示層級
Then 頁面不顯示播放按鈕或操作動畫
And 編輯器不因查看提示而重設
And 使用者必須親自完成題目

## AC-014：推薦按鍵解說

Given 題目有作者定義的推薦解法 explanation
And 使用者以不同但有效的按鍵完成題目
When 顯示完成回饋
Then「本題按鍵解說」逐字顯示該 explanation
And 不由前端固定按鍵字典或使用者實際輸入的操作序列產生描述
And explanation 為空白時不顯示此區塊

## AC-015：速度

Given 題目正確完成  
When 計算速度  
Then 使用按鍵效率 60% 與時間效率 40%  
And 分數限制為 0–100

## AC-016：未完成速度

Given 題目未完成或跳過  
When 計算速度  
Then speedScore 為 0

## AC-017：準確

Given 使用者有兩次 mistake、一次 undo、最高 Hint Level 2  
When 題目完成  
Then accuracyScore 為 79

## AC-018：提示不累加

Given 使用者先看 Level 1 再看 Level 3  
When 計算準確  
Then 只套用 Level 3 的 15 分扣分  
And 不套用 3 + 8 + 15

## AC-019：熟練長期性

Given 使用者只在一題取得高分  
When 更新熟練  
Then 不得直接進 Level 4 或 Level 5

## AC-020：Level 5 門檻

Given masteryScore 大於等於 85  
But 使用者沒有經過七天以上無提示成功  
When 計算 level  
Then 最高維持 Level 4

## AC-021：今日複習

Given 使用者選擇 10 題今日複習  
And 候選題充足  
When 系統建立題組  
Then 包含 7 題到期／錯題  
And 2 題弱項  
And 1 題已熟悉抽查

## AC-022：題目不足遞補

Given 到期題只有 3 題  
When 使用者要求 10 題  
Then 剩餘題目依弱項、久未複習、同難度題遞補  
And 同一 Exercise 不重複

## AC-023：指定主題

Given 使用者有到期文字物件題  
When 只選擇搜尋主題練習  
Then 搜尋題正常產生  
And 原到期文字物件題仍保留

## AC-024：本機優先

Given 使用者完成一題  
When Supabase 無法連線  
Then Attempt 先保存 IndexedDB  
And 顯示離線同步訊息  
And 使用者可繼續下一題

## AC-025：重新整理保存

Given 訪客已完成一題  
When 重新整理頁面  
Then 已完成紀錄仍存在  
And 練習進度可恢復

## AC-026：去重同步

Given 同一 clientAttemptId 因網路錯誤重送兩次  
When Supabase 接收  
Then資料庫只存在一筆 Attempt

## AC-027：Google 登入合併

Given 訪客有本機 Attempts  
When Google OAuth 成功  
Then pending Attempts 同步至帳號  
And 本機紀錄標記 synced  
And 同步失敗的紀錄仍保留

## AC-028：RLS

Given 使用者 A 與 B 均已登入  
When A 嘗試讀取 B 的 exercise_attempts  
Then 查詢回傳空集合或權限錯誤  
And 不洩漏 B 的資料

## AC-029：公開題庫

Given 使用者未登入  
When 查詢 published exercises  
Then 可讀取  
When 查詢 unpublished exercises  
Then 不可讀取

## AC-030：SPA 深層路由

Given 使用者直接開啟 `/courses/text-objects`  
When Vercel 回應  
Then Vue SPA 正常載入  
And 不回傳 404

## AC-031：手機提示

Given 裝置沒有實體鍵盤或寬度偏小  
When 進入練習頁  
Then 顯示建議使用電腦與實體鍵盤  
And 仍可查看課程與進度

## AC-032：練習題自動聚焦

Given 可編輯練習題已載入\
When CodeMirror 與 Vim bridge 建立完成\
Then 編輯器自動取得焦點一次\
And 游標維持在題目提供的起始位置\
And 第一個 Vim 按鍵不需要先點擊編輯器\
And 唯讀編輯器不得自動取得焦點

## AC-033：編輯器狀態列

Given 使用者正在完成一題\
When Vim Mode 改變\
Then 編輯器下方狀態列顯示目前 Mode\
And 顯示從 Attempt startedAt 計算的已練習時間\
And 時間格式為 mm:ss\
And 背景分頁造成 interval 延遲時，時間仍以壁鐘差值為準

## AC-034：重新開始本題

Given 使用者已修改題目內容、揭露提示並經過部分練習時間\
When 點擊「重新開始本題」\
Then 內容與游標還原為題目初始值\
And Vim Mode 回到 Normal\
And 建立新的 clientAttemptId 與 startedAt\
And 已練習時間在一秒容差內回到 00:00\
And 按鍵數、操作、提示與 resetCount 歸零\
And 不建立成功、失敗或中止 Attempt\
And outcome 保存中控制項不可操作

## AC-035：操作後自動完成

Given 使用者尚未完成題目
When 使用者輸入有效操作並使內容、游標與 Vim Mode 同時符合完成條件
Then 系統自動建立一次成功 Attempt
And 顯示單題回饋
And 不需要點擊「檢查答案」
When 題目剛載入且初始狀態已符合完成條件
Then 系統不得在使用者互動前自動建立 Attempt

## AC-036：實際操作紀錄

Given 使用者在題目中執行 Vim command、插入文字、模式切換、Undo、Reset 或搜尋
When 單題回饋顯示
Then 顯示由標準化操作組成的使用者實際操作序列
And 有效但未出現在題庫解法中的操作仍會被保留並標示為未收錄的有效操作

## AC-037：游標目標提示

Given completion_rule.cursorMatch 為 exact 或 range
When 題目載入編輯器
Then 目標位置顯示黃色透明細邊框
And 目標提示不得改變內容、游標或完成判定
Given completion_rule.cursorMatch 為 ignore
Then 不顯示游標目標框

## AC-038：指標定義可理解

Given 使用者查看單題回饋
Then 看得到準確、速度、熟練的簡短定義
When 使用者展開「查看計算方式」
Then 看得到準確扣分、速度 60%／40% 權重與模式寬限
And 看得到熟練 0–5 等級及其長期指標定義
And 不得顯示「重新開始」相關的扣分說明

## AC-039：匯入式解題說明

Given 題目的推薦 solution 有 explanation\
When 使用者查看單題回饋\
Then「本題按鍵解說」逐字顯示該 explanation\
And 不顯示由固定按鍵字典推測的描述\
Given explanation 在執行期為空白\
Then 不顯示「本題按鍵解說」區塊

## AC-040：單題再試一次與前進

Given 使用者完成或跳過目前題目並看見單題回饋\
Then session 仍指向目前題目\
When 點擊「再試一次」\
Then 保留已保存的 Attempt\
And 以新的 attempt ID 與 startedAt 重做同一題\
When 再次完成後點擊「下一題」\
Then session 只前進一次\
And 最後一題在此時才完成 session 並導向結果頁

## AC-041：完成與保存期間鎖定編輯器

Given 使用者已完成題目並看見單題回饋，或 outcome 正在保存、或下一題正在載入\
When 使用者嘗試在編輯器輸入\
Then 編輯器維持唯讀且內容不變\
And 不建立或更新 attemptDraft\
And 不新增 Attempt 紀錄\
And 重新整理後不得恢復已完成 Attempt 的未完成 draft

## AC-042：下一題載入失敗時的復原

Given 使用者已看見單題回饋且點擊「下一題」\
When 下一題的題目資料載入失敗\
Then 單題回饋與 pendingOutcome 維持顯示\
And session 不得前進或持久化前進狀態\
And 舊題編輯器維持唯讀，不重新顯示「跳過這題」或啟用重新開始\
And 顯示可重試「下一題」的錯誤訊息\
When 之後再次點擊「下一題」且載入成功\
Then 正確進入下一題且不建立錯誤 exerciseId 的 Attempt

## AC-043：Attempt 與 session／draft 原子提交

Given 使用者完成或跳過題目\
When 系統保存 Attempt 並清空 attemptDraft\
Then 兩者在同一個 IndexedDB transaction 中提交\
And 任一步失敗時兩者皆不生效，不留下 Attempt 已存在但 draft 仍可恢復的中間狀態\
And 本機 transaction 成功後才觸發背景／遠端同步

## AC-044：題組建立先持久化再更新 store

Given 使用者透過課程模式、每日複習、指定主題或弱項練習建立新題組\
When `PracticeSessionStarter` 執行\
Then 先呼叫 repository 保存 session\
And 只有保存成功後才把 session 寫入 Pinia store\
When 保存失敗\
Then store 維持原狀，不出現「已建立但未反映在畫面」的中間狀態

## AC-045：本機學習投影原子提交

Given 使用者完成或跳過題目\
When 系統計算該題所屬技能的熟練變化與下一次複習排程\
Then Attempt、Session、`skillMastery`、`exerciseReviews`、`learningOutcomes` 五個 store 在同一個 IndexedDB transaction 中提交\
And 任一 store 寫入失敗時，五個 store 都不生效，不留下部分寫入\
And 本機 transaction 失敗時不呼叫任何背景或遠端同步 RPC\
And 同一 `clientAttemptId` 重複提交不重算、不重寫，回傳先前實際持久化的結果

## AC-046：複習與弱項優先使用本機投影，訪客舊資料退回既有演算法

Given 使用者已有本機技能熟練投影紀錄\
When 系統計算今日複習到期題數與弱項技能\
Then 到期題數直接來自 `ExerciseReviewRepository.listDue`\
And 弱項技能依真實 `masteryScore` 由低到高排序\
And 被動態分類排除、但實際已到期的題目仍會出現在到期題組中\
Given 使用者只有原始 Attempt、尚未產生任何本機投影紀錄\
When 系統計算今日複習到期題數與弱項技能\
Then 退回既有 P0.2 動態 snapshot／pool 演算法，行為與升級前一致

## AC-047：學習進度與今日複習的到期題數一致

Given 同一位使用者同時查看「學習進度」與「今日複習」\
When 兩頁都完成載入\
Then 兩頁顯示的到期題數必須相同\
And 兩者都來自同一份持久化 `exerciseReviews` 資料，而非各自獨立計算

## AC-048：登入同步以伺服器絕對值調和本機預測

Given 訪客完成題目後產生本機熟練預測值\
When Google OAuth 登入成功並同步該筆 Attempt\
Then 本機熟練分數與等級被伺服器回傳的絕對值取代\
And 該筆 Attempt 標記為 `synced`\
When 稍後重新整理或再次觸發同步\
Then 已標記 `synced` 的 Attempt 不會重新呼叫記錄函式\
And 已調和的熟練值不再改變

## AC-049：學習進度頁讀取真實資料

Given 使用者已有本機或雲端學習紀錄\
When 進入「學習進度」頁\
Then 技能熟練、單元完成度、到期複習數與最近練習皆來自實際 repository 查詢結果\
And 不使用寫死或由測試假資料傳入的 props\
And 找不到對應課程目錄資料的技能或題目改用誠實的預設呈現，不得顯示虛構名稱

## AC-050：首頁個人化摘要

Given 使用者已有學習紀錄\
When 進入首頁\
Then 顯示「繼續上次練習」（若有進行中 session）、「今日有 N 題待複習」（N 大於 0 時）與「建議加強：技能名稱」（有可辨識的最弱技能時）\
And 三張學習模式卡片維持完整顯示\
Given 使用者沒有任何學習紀錄，或個人化摘要載入失敗\
Then 不顯示上述任何一張個人化卡片，也不顯示虛構數字\
And 三張學習模式卡片仍完整顯示且可操作
