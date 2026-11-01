# Bot 任務交接

## 目錄與操作
每個收件 bot 使用固定目錄名稱，例如 `code`、`editor-asia`、`editor-americas`、`editor-europe`、`coordinator`。這些是建議名稱；設定觸發前須確認它們對應的平台 bot。

1. 寄件 bot 在 `shared/tasks/<收件 bot>/inbox/<任務檔名>.md` 新增一份任務，檔名使用不覆蓋既有檔案的名稱。
2. 完成寫入後 commit、push。GitHub 事件只能看到已 push 的變更。
3. 收件 bot 讀取指定任務與必要引用，執行工作。
4. 結果寫到 `shared/results/<任務檔名>.md`，將原任務移到 `shared/tasks/<收件 bot>/done/`，再 commit、push。
5. 如需下一個 bot 接手，在對方 inbox 新增任務，引用結果路徑。不要把過程再轉述成一整段 bot 對話。

以下只是方便撰寫的範例，不做格式驗證：

```markdown
# 檢查登入流程修改
來源：editor-asia
目標：確認指定版本的登入修改是否有錯誤。
相關內容：<base commit> 到 <head commit> 的 src/auth.ts 差異。
完成條件：將問題位置或檢查結論寫入 shared/results/<本任務檔名>.md。
```

## 自動觸發的接線要求（尚未實作）
- 每個 bot 需有對應的 Grok Bot routine。
- 只有 main 上新增或修改該 bot `inbox/*.md` 的 push 才應喚醒它，刪除 inbox 檔案不觸發。
- `done/`、`shared/results/`、說明文件及其他程式碼變更不應單獨喚醒 bot。
- 如果平台原生 GitHub trigger 無法在啟動模型前精確過濾路徑，使用一般程式先過濾，再呼叫對應 routine 的 webhook。
- 喚醒內容只包含 repo、分支、commit SHA 與任務路徑；bot 依該版本讀取任務。
- Webhook secret 放在平台或 CI 的 secret 設定，不能提交到 repo。

本流程不加入任務格式驗證、去重、交接次數或 token 上限。觸發過濾仍需設定，避免每次一般提交或結果寫回都喚醒模型。
