# app5 三語試聽與成本實測（gpt-realtime-2.1-mini）

## 檔案
- `zh-TW.txt`、`ja.txt`、`en.txt`：三個動作（sit_side_reach、stand_calf_wall、lie_single_knee_hug）各 4 句 cue，另有 2 句讀音測試句。
  - 中文：保留「踝」「腰」測試句。
  - 日文：「背筋（せすじ／はいきん）」「股関節（こかんせつ）」「足首」「脛（すね）」。
  - 英文：calf、hamstring、ankles、quadriceps。
- `cues.json`：`[{id, lang, exerciseId, text}]`，共 42 句，給腳本讀。
- `measure_cost.mjs`：成本實測腳本（Node 18 以上，實跑時用 `ws` 套件）。
- `package.json`、`.gitignore`（排除 *.wav、輸出資料夾、results.csv、node_modules）。

文字原則：口語、像教練在旁邊說話。只寫動作與安全提醒（輕輕、別用力拉），不寫療效，也不寫「經專業審核」。內容狀態為 `source_referenced`。

## 怎麼執行
1. 先只跑預估，這一步不連網：`node measure_cost.mjs --dry-run [--lang ja] [--voice cedar]`
2. 實跑前要先經 Chun 同意，因為實跑會花錢。金鑰由黑嘛嘛透過 secret store 設成環境變數 `OPENAI_API_KEY`，不要貼在聊天、檔案或指令裡。
3. 實跑步驟：
   - `npm install`
   - `node measure_cost.mjs --lang zh-TW --voice marin --max-usd 0.50`
4. 可用參數：
   - `--lang`：zh-TW、ja、en
   - `--voice`：alloy、ash、ballad、coral、echo、sage、shimmer、verse、marin、cedar（官方建議 marin 或 cedar）
   - `--max-usd`：花費上限，預設 0.50；預估會超過就停
   - `--out`：輸出位置
   - `--reasoning`：minimal（預設）、low，或 none（不送這個欄位）

## 怎麼聽
- 輸出預設放在 `/workspace/stretch-app/audition/<lang>/<id>.<voice>.wav`。這個資料夾不進 repo。
- 格式是 PCM16、24kHz、單聲道 WAV，可以直接用 QuickTime 或 VLC 播放。
- 每個語言資料夾裡有 `transcripts.tsv`，欄位是 id、原文、模型逐字稿。逐字稿只能參考，**照念是否準確一定要人工聽**，尤其是讀音測試句。

## 怎麼看成本
- `results.csv` 的欄位：id、lang、chars、input_text_tokens、output_audio_tokens、output_text_tokens、audio_seconds、audio_tokens_per_second、cost_usd。
- `summary.json` 與終端摘要會依語言列出：
  - 每秒平均音訊 token
  - 每秒成本
  - 每千字成本
  - 一次自訂轉換的推估成本
- 自訂轉換的推估基準是 exercises.zh-Hant.json 前 10 個動作，共 40 句、509 字。日文和英文的推估同時列出「依字數」與「依句數」兩種，譯文長度不同時，以依句數為準。
- 秒數 = PCM 位元組數 ÷ 48000（24000 Hz × 2 bytes）。token 數取自 `response.done` 的 `response.usage.input_token_details` 與 `output_token_details`（text_tokens、audio_tokens）。
- 價格寫成腳本頂端的 `PRICE` 常數（每 1M token）：

| 項目 | 價格 |
|---|---|
| 文字輸入 | $0.60 |
| 快取文字輸入 | $0.06 |
| 文字輸出 | $2.40 |
| 音訊輸入 | $10 |
| 音訊輸出 | $20 |

- 輸出的逐字稿也算文字輸出 token，要另外計費。

## gpt-realtime-2.1-mini 的限制
- **只能走 Realtime API**（`v1/realtime`，WebSocket、WebRTC 或 SIP）。官方列出 `v1/audio/speech` 不支援，所以沒有一般的 TTS 端點。
- 這是對話模型，不是專用 TTS。照念靠 instructions 約束，可能加字、改字或念錯，**每句都要人工聽過**。
- 一個 session 一旦輸出過音訊就不能換 voice，所以腳本每句開一個新連線。
- 輸出 PCM 只支援 24kHz。
- 預設語音是 OpenAI 內建聲線，沒有指定台灣口音的參數，台灣腔要靠 instructions 引導並實際聽聽看。

## 來源（查證日 2026-10-30）
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/realtime-conversations
- https://developers.openai.com/api/reference/resources/realtime/server-events
