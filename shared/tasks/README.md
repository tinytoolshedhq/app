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

## 自動觸發
- `.github/workflows/bot-handoff.yml` 與 `scripts/bot_handoff.py` 負責路徑篩選與 webhook 呼叫，不使用模型判斷路由。
- 每個 bot 需有對應的 Grok Bot routine。
- 只有 main 上新增或修改該 bot `inbox/*.md` 的 push 才應喚醒它，刪除 inbox 檔案不觸發。
- `done/`、`shared/results/`、說明文件及其他程式碼變更不應單獨喚醒 bot。
- 如果平台原生 GitHub trigger 無法在啟動模型前精確過濾路徑，使用一般程式先過濾，再呼叫對應 routine 的 webhook。
- 喚醒內容只包含 repo、分支、commit SHA 與任務路徑；bot 依該版本讀取任務。
- Webhook secret 放在平台或 CI 的 secret 設定，不能提交到 repo。
- 同一個 push 給同一個 bot 的多份任務會合併為一次喚醒；接收資料的 `task_paths` 是路徑清單。
- Bot 必須用自己的 GitHub 登入、PAT 或 GitHub App token push。以 Actions 的 `GITHUB_TOKEN` 推送通常不會觸發下一個 push workflow。
- 手動執行此 workflow 永遠只預演最近一次 commit 的任務差異，不呼叫 bot。

## 一次性設定
1. 在每個 Grok Bot 建立 webhook routine，指令包含：讀取 `shared/OPERATING.md`，按 payload 的 `commit` 版本讀取 `task_paths` 中所有任務，只讀必要引用。結果回寫 main 前先整合最新 main，不要把 main 重設為 payload 的舊版本。完成後移至 done，不直接聯絡其他 bot。
2. 在 GitHub Settings → Secrets and variables → Actions → Secrets 新增 `GROK_BOT_WEBHOOKS`。內容是以下 JSON，以 routine 顯示的 POST URL 與原始 key 替換 placeholder；不要把整段 Authorization header 填入 key。

```json
{
  "code": {"url": "https://<routine-post-url>", "key": "<routine-key>"},
  "editor-asia": {"url": "https://<routine-post-url>", "key": "<routine-key>"},
  "editor-americas": {"url": "https://<routine-post-url>", "key": "<routine-key>"},
  "editor-europe": {"url": "https://<routine-post-url>", "key": "<routine-key>"},
  "coordinator": {"url": "https://<routine-post-url>", "key": "<routine-key>"}
}
```

只需填入實際使用的 bot；JSON 的 key 必須與其任務目錄名稱一致。

3. 在 Actions → Variables 將 `BOT_HANDOFF_ENABLED` 設為 `true`。未設定或為 `false` 時，push 只記錄路由結果，不呼叫 bot。
4. 新增一份無外部副作用的測試任務並 push，在 Actions 的 Bot file handoff 查看紀錄，再到 Grok 確認 bot 已執行。HTTP 200 只代表 routine 接受喚醒，不代表任務完成。
5. 如要暫停實際喚醒，將變數改回 `false`。

Webhook 失敗不自動重試；Actions 手動重跑既有 push run 可能再次喚醒 bot。收到失敗時先確認 Grok 是否已接受任務，再決定是否重跑。

參考：[Grok Bot routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)、[GitHub workflow 觸發限制](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。

本流程不加入任務格式驗證、去重、交接次數或 token 上限。觸發過濾仍需設定，避免每次一般提交或結果寫回都喚醒模型。
