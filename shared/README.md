# Shared Workspace

所有 bot 的檔案交接區。使用者可直接交辦任何 bot；bot 之間依 `OPERATING.md` 透過檔案交接。

## Structure
- `tasks/<收件 bot>/inbox/` — 待處理任務；目錄名稱使用固定的 bot 識別名稱。
- `tasks/<收件 bot>/done/` — 已完成任務。
- `results/` — 任務結果，檔名與原任務相同。
- `drafts/` — 貼文及腳本草稿；保留既有 Typefully 排程流程。
- `calendar/` — 發文及發布排程。
- `strategy/` — 按需建立的短期策略筆記。

任務流程及 webhook 設定見 `tasks/README.md`。GitHub Actions 負責觸發；需完成 Grok routine 與 secret 設定，並開啟 `BOT_HANDOFF_ENABLED` 才會實際喚醒 bot。

Do not commit secrets.
