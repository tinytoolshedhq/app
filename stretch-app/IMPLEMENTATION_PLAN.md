
# 伸展 app（暫定名）實作計畫 — app5/

更新：2026-10-30（第二版：全免費方案起步、TTS 只比較 Google 與 OpenAI）。依據：`README.md`、`exercises.zh-Hant.json`，以及 Chun 2026-10-30 的四項決定。
本文件只是計畫，不含程式。價格都標了查證日期，**所有成本都是估算**，正式定價前要用實測校正。

## 0. 已定決策
1. Expo（managed workflow）放在 `app5/`，慣例跟 app3/app4 一樣（TypeScript、expo-router、expo-iap）。
2. 自訂 AI 語音第一版就做：後端、可恢復身分、綁定已驗證購買的 10 次額度、原子預留＋冪等鍵、快取、試聽頻率限制。
3. 預設語音使用事先生成的 AI 音檔，隨內容包下載，所有使用者共用。
4. 不找專業審核。改成「官方來源＋注意事項」。已決定 `review_status` 為 `source_referenced`，不可寫成專業審核通過，文案不可宣稱有治療效果（見 §9）。

## 1. 模組切分

### App（app5/src/）
| 模組 | 職責 | 狀態 |
|---|---|---|
| `content/` | 載入並驗證 JSON 與內容包 manifest（zod），檢查 ID 唯一、時間軸 0–30 秒無空缺或重疊、語音不跨界 | 離線核心分支進行中 |
| `builder/` | 規則選課：姿勢 → 部位 → 器材 → 排序；避免相鄰重複、偏好同準備姿勢；明示重複 | 進行中 |
| `player/` | 30 秒加 3 秒時間軸，以時鐘和暫停累計計算；暫停、上一個、略過、靜音；耳機斷線自動暫停 | 進行中 |
| `audio/` | AudioService：播放提示音、ducking、鎖屏背景播放、切段時先停舊音 | 進行中（佔位音） |
| `storage/` | expo-sqlite / AsyncStorage：上次選項、收藏組合、已下載包索引 | 進行中 |
| `packs/` | 內容包下載器：先下載到暫存、驗證雜湊、整包切換，失敗保留舊版、可續傳 | M3 |
| `iap/` | expo-iap 買斷、恢復購買，把交易 JWS 交給後端 | 進行中（本機部分） |
| `account/` | 身分：Sign in with Apple 加後端 session | M4 |
| `voice/` | 語氣輸入、試聽、工作建立與輪詢、下載、切換語音組 | M5 |

### 後端
| 模組 | 職責 |
|---|---|
| `auth` | 驗證 Apple identity token，發 session JWT |
| `entitlement` | 驗證 App Store 交易 JWS（App Store Server API / Library），用 `originalTransactionId` 綁定使用者，只授予一次 10 次 |
| `quota` | 額度帳本：reserve / commit / release，冪等 |
| `voice-jobs` | 建立工作、呼叫 TTS、量測音長、逐段重試、打包 |
| `preview` | 短試聽，有頻率、次數、長度限制 |
| `cache` | 依快取鍵去重 |
| `storage/CDN` | 預設語音包（公開）與私人自訂音檔（簽名 URL） |
| `admin script` | 離線生成預設語音包，在開發者機器或 CI 執行，金鑰放在 secret store |

### 介面

**AudioService（app）**
```ts
interface AudioService {
  load(cues: {id:string; uri:string; atMs:number; maxMs:number}[]): Promise<void>;
  playAt(cueId: string): Promise<void>;
  stopAll(): Promise<void>;      // 切換、略過、斷線時呼叫
  pause(): void; resume(): void; setMuted(m: boolean): void;
  onRouteChange(cb: (e:{reason:'oldDeviceUnavailable'|string}) => void): Unsubscribe;
}
```

**內容包 manifest**
```json
{ "pack_id":"base", "content_version":"…", "schema_version":"…",
  "voice": {"voice_set_id":"default-zh-TW-v1","model":"…","script_version":"…"},
  "files":[{"path":"anim/sit_shoulder_circles.mp4","bytes":0,"sha256":"…","kind":"animation|cover|audio","ref":"exercise_id or cue_id"}] }
```
動畫和音檔分開管理（README §6）：更換語氣只會換掉 `voice` 和音檔。

**Entitlement API**
- `POST /v1/entitlements/verify` { signedTransaction }：回傳 { unlocked, quota:{granted, used, reserved} }。
- 同一個 `originalTransactionId` 再次驗證時，只回傳現有帳本，不重發 10 次。

**Voice-job API**
- `POST /v1/voice/preview` { toneText }：回傳 { previewUrl, remainingPreviews }，HTTP 429 帶 Retry-After。
- `POST /v1/voice/jobs`，Header 帶 `Idempotency-Key`，body { toneText, exerciseIds[≤10], scriptVersion }：回傳 { jobId, status, reservedCredit }。
- `GET /v1/voice/jobs/{id}`：回傳 { status: queued|running|succeeded|failed, files[{cueId,url,durationMs,sha256}] }。
- 下載失敗後重試只重抓 `files`，不再建立工作、不扣額度。

## 2. 里程碑
| # | 交付 | 外部依賴 | 現在可做？ |
|---|---|---|---|
| M0 | 規格與本計畫 PR，APP_STAGES 加上 app5 Stage 2 | 無 | ✅ |
| M1 | app5 骨架、資料載入與驗證、規則選課、單元測試 | 無 | ✅（進行中） |
| M2 | 播放器 30+3、AudioService（佔位音）、離線儲存、記住上次選項 | 無；鎖屏與耳機行為要真機驗證 | ✅ 程式可做；真機測試等 build |
| M3 | IAP 買斷與恢復購買（本機）、內容包下載器（本機 mock 伺服器） | ASC 商品 ID 與價格、dev build（要 Chun 同意） | ✅ 程式可做；實測要等 |
| M4 | 後端 auth、entitlement、quota 帳本；用模擬器和 mock JWS 測 | 後端帳號、Apple In-App Purchase key、Services ID | ⏳ 本機 emulator 可先寫 |
| M5 | 語音試聽、工作、快取、音長檢查 | TTS 帳號與 API key | ⏳ 可先用 mock TTS |
| M6 | 預設語音包生成（30 動作、120 段、1,500 字） | TTS key；Chun 選定聲音 | ⏳ |
| M7 | 動畫：previewer 在 Figma 先做 3 個代表動作 → 確認後做全部 30 個；輸出無聲 MP4 加靜態封面 | Figma（Starter 先試） | 由 previewer 負責 |
| M8 | 整合、飛航模式驗收、README §10 清單、TestFlight | EAS build、TestFlight（都要 Chun 同意，由蘋果大師執行） | ⏳ |

## 3. 後端：Cloudflare Workers Free + D1 + R2（2026-10-30 查官方文件）
Chun 2026-10-30 決定：全部從免費方案開始。程式要設計成升級到 Workers Paid 時不必改程式。

### Free 方案限制（官方數字）
| 項目 | Free | Paid（對照） |
|---|---|---|
| Workers requests | 每天 100,000（UTC 0 點重置；超過回 Error 1027） | 無上限 |
| CPU time | 每次 HTTP 請求 10 ms；Cron 也是 10 ms | 預設 30 秒，最多 5 分鐘 |
| 等待時間（wall-clock） | HTTP 沒有上限（client 保持連線即可）；`ctx.waitUntil()` 回應後最多再撐 30 秒 | 同左 |
| Subrequests | 每次呼叫 50 個（Cloudflare 內部服務 1,000 個） | 10,000 個 |
| 同時等待回應標頭的連線 | 6 | 6 |
| Memory | 每個 isolate 128 MB | 128 MB |
| Worker 大小 | 64 MiB（未壓縮） | 64 MiB |
| 啟動時間 | 1 秒 | 1 秒 |
| Cron Triggers | 每帳號 5 個 | 250 個 |
| 環境變數＋secrets | 每個 Worker 64 個，每個 5 KB | 128 個 |
| Queues | **Free 可用**：每天 10,000 ops；保留 24 小時；consumer 每次最多 15 分鐘 | 每月 100 萬 ops |
| Durable Objects | **Free 可用**（只限 SQLite backend）：每天 10 萬 requests、13,000 GB-s | — |
| D1 rows read | 每天 500 萬 | 每月 250 億 |
| D1 rows written | **每天 100,000** | 每月 5,000 萬 |
| D1 容量 | 單一 DB 500 MB；帳號合計 5 GB；最多 10 個 DB | 單一 10 GB |
| D1 每次 Worker 呼叫可查詢次數 | 50 次（一個 `batch()` 算 1 次） | 1,000 次 |
| R2（只限 Standard class） | 每月 10 GB-month 儲存、Class A 100 萬次、Class B 1,000 萬次；egress 免費 | 超出後按量計費 |

來源（皆 2026-10-30 查）：
- <https://developers.cloudflare.com/workers/platform/limits/>（頁面更新 2026-10-29）
- <https://developers.cloudflare.com/workers/platform/pricing/>（Queues、DO、D1 免費額度；頁面更新 2026-10-02）
- <https://developers.cloudflare.com/d1/platform/limits/>（頁面更新 2026-10-24）
- <https://developers.cloudflare.com/r2/pricing/>（頁面更新 2026-10-26）

### 一次轉換塞得進 Free 嗎？
假設一次轉換：最多 10 個動作，約 40 段提示（每動作 4 段），每段 1 次 TTS 呼叫和 1 次 R2 put，再加 D1。

- **單一請求做完：不行**。40 次 TTS＋40 次 R2 put＋D1 查詢 ≈ 85 個 subrequests，超過 Free 的 50。`waitUntil` 只有 30 秒，也撐不住 40 次 TTS 的等待時間。
- **CPU 不是瓶頸**。等 TTS 回應不算 CPU。主要的 CPU 成本是 JWS 驗證（ECDSA，用 WebCrypto，應該只要幾 ms）、sha256、解析音長。
  - 做法是把 TTS 回應直接用 stream 轉存到 R2，不在記憶體裡轉碼。
  - 音長從 WAV/PCM 的位元組數，或 MP3 frame header 算出來。
  - 10 ms 仍然偏緊，M5 要用 Workers Logs 實測 CPU time。
- **採用的設計：分段處理，由 client 輪詢推進**，不依賴 Queues。
  1. `POST /jobs`：預留額度，在 D1 寫入 job 和 cue 列，回傳 jobId。
  2. App 每 2–3 秒呼叫一次 `POST /jobs/{id}/step`。每次最多處理 **5 段**：約 5 次 TTS＋5 次 R2 put＋1 次 D1 batch ≈ 12 個 subrequests，連線上限 6 剛好可以並行。
  3. 處理前先用 D1 條件更新把 cue 從 `pending` 改成 `running`，加 lease 時間，避免重複處理。
  4. 全部段落 `done` 且長度檢查通過後，commit 額度。
  5. 一次轉換約 8 次 step，加上建立和輪詢，總計約 20 個 requests。
  6. App 進背景時暫停；回前景後從 D1 狀態續跑，續跑不會重複扣額度。
- **升級選項**：之後若要不靠 App 輪詢，可改用 Queues（Free 每天 10,000 ops，每則訊息約 3 ops，約 3,300 則／天），或用 Durable Object alarm。程式用同一個 `processCueBatch(jobId, n)` 函式，只是換觸發方式。

### D1 每日寫入上限能撐幾次轉換
每次轉換估計寫入的 rows（含索引會多算一列）：

| 項目 | 估計 rows |
|---|---|
| ledger：reserve＋commit | 2 筆 ×2 = 4 |
| job：建立加約 8 次狀態更新 | ≈ 10 |
| cue：40 筆，每筆建立、running、done 共 3 次更新，加索引 | ≈ 40 × 3 × 2 = 240 |
| cache：40 筆加索引 | ≈ 80 |
| **合計** | **≈ 330 rows** |

- 每天 100,000 ÷ 330 ≈ **300 次轉換／天**。這還沒算試聽、登入和 entitlement 的寫入，那些每次大約 2–4 rows。
- 優化做法：cue 狀態改存在 job 的一個 JSON 欄位，每次 step 寫 1 列，可降到每次轉換約 60 rows，也就是約 **1,600 次／天**。
- requests 上限 100,000／天 ÷ 每次轉換約 20 ≈ 5,000 次，所以 D1 寫入才是先碰到的上限。

### 帳號與卡片
- **R2**：官方 Get started 寫要先「Complete the checkout flow to add an R2 subscription」，同時說 R2 免費開始使用。是否一定要填卡片，文件沒有明說，**未能確認**，由黑嘛嘛開通時確認。來源：<https://developers.cloudflare.com/r2/get-started/>（2026-10-30 查）。
- **Workers Free**：官方限制頁和價格頁都沒有寫需要卡片，Free 是預設方案。是否完全免卡，**未能在官方頁確認**。

### 升級到 Paid 的條件與步驟（不改程式）
**升級條件**（任一成立就提出，經 Chun 同意後升級）：
- D1 每日寫入連續 3 天超過 70,000 rows。
- requests 每天超過 70,000。
- Workers Logs 出現 `exceededCpu`。
- R2 用量超過 8 GB-month。
- 正式上線前，想要更穩定的 CPU 上限。

**程式設計約束**：
- 每次 step 處理段數是 `STEP_CUES` 環境變數（Free 設 5，Paid 可設 40，一次做完）。
- Step 迴圈不假設 CPU 足夠。
- 觸發方式抽象成 `JobRunner` 介面（client 輪詢、Queues、DO alarm 三選一），用 `wrangler.toml` 的 vars 切換。
- 所有上限值都放在設定裡，不寫死在程式。

**升級步驟**：
1. 黑嘛嘛在 Dashboard 把 Workers 升級成 Paid（US$5/月），並設定 billing 通知。
2. 在 `wrangler.toml` 加 `[limits] cpu_ms = 30000`（這是設定檔，不是程式），把 `STEP_CUES` 改成 40。
3. 重新 deploy。D1 和 R2 的資料不用搬移，綁定名稱也不變。

## 4. TTS：Google Cloud TTS Chirp 3 HD vs OpenAI（2026-10-30 查官方頁）
ElevenLabs 依 Chun 的選擇排除，不列入推薦。

字數是用腳本從 JSON 實際統計的 `voice_cues.text`：30 動作、120 段、**共 1,500 字**。最長的 10 個動作合計 531 字。所有 `max_duration_seconds` 合計 780 秒。

### ⚠️ 兩個重大發現
1. **Chirp 3 HD 沒有台灣華語（cmn-TW）**。官方語言表只有 `cmn-CN`（Mandarin Chinese (China)）和 `yue-HK`（粵語，Preview），用的會是中國大陸口音。
   - 聲音名稱格式是 `cmn-CN-Chirp3-HD-<名稱>`，可選 Achernar、Aoede、Kore、Leda、Puck、Charon、Zephyr 等 30 個。
   - 要台灣口音，只能改用 Google 舊的 cmn-TW 聲音（Standard、WaveNet），這要另外確認有哪些可用。
2. **OpenAI 的 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 已宣告 deprecated，2027-01-06 停止服務**。官方建議改用 Realtime API 的 `gpt-realtime-2.1-mini`，而 `/v1/audio/speech` 不支援這個模型，要改用 WebSocket 流程。
   - v1 若在 2027-01 之後上線，**應直接用 gpt-realtime-2.1-mini 實作**，或至少把 TTS provider 介面抽象化，方便切換。

### 比較
| 項目 | Chirp 3 HD | OpenAI gpt-4o-mini-tts（2027-01-06 停用） | OpenAI tts-1 / tts-1-hd（同日停用） | OpenAI gpt-realtime-2.1-mini（替代） |
|---|---|---|---|---|
| 價格 | 每月前 100 萬字元免費，之後 US$30/1M 字元 | 文字輸入 US$0.60/1M tokens；音訊輸出 US$12/1M tokens | US$15 / US$30 每 1M 字元 | 文字輸入 US$0.60/1M；音訊輸出 US$20/1M tokens |
| zh-TW | ❌ 只有 cmn-CN | 支援中文，但官方說聲音以英文最佳化；台灣口音可以用 instructions 要求（Accent），要實測 | 同左，不能調口音 | 要實測 |
| 語氣控制 | ❌ 沒有語氣指令。只能調 `speaking_rate`（0.25–2.0）、用 markup 加 `[pause]`、自訂發音，SSML `<prosody>` 是 Preview | ✅ 有 `instructions`，可控制 accent、tone、speed、emotion | ❌ | ✅ 用 prompt 控制 |
| 試用門檻 | **要有 billing account，並綁信用卡或其他付款方式**；Free Trial 送 US$300、90 天 | **要先預付 credits**，最少 US$5，credits 一年後過期 | 同左 | 同左 |

來源（皆 2026-10-30 查）：
- <https://cloud.google.com/text-to-speech/pricing>
- <https://cloud.google.com/text-to-speech/docs/chirp3-hd>
- <https://docs.cloud.google.com/free/docs/free-cloud-features>
- <https://developers.openai.com/api/docs/pricing>
- <https://developers.openai.com/api/docs/guides/text-to-speech>
- <https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing>

### 自訂語氣能不能做
- **Chirp 3 HD**：「可愛、溫柔、稍慢」只能做到「換一個聲音＋調語速＋加停頓」，做不到真正的語氣轉換，而且是大陸口音。
- **OpenAI 的 instructions 模型**才能符合 README §6 的需求。
- **建議**：
  - 自訂語音用 OpenAI。以停用時程來看，優先評估 gpt-realtime-2.1-mini；若 gpt-4o-mini-tts 在停用前仍可用，可以先拿來試聽。
  - 預設語音包可以用 Chirp 3 HD（落在免費額度內），但前提是 Chun 接受大陸口音，否則也改用 OpenAI。
  - 要等試聽結果（tts-audition-script）出來再定案。

### 成本估算
假設：
- 一次轉換：最長 10 個動作，531 字，音長上限 300 秒。
- 試聽：約 60 字。
- 重試係數 ×1.5。

| 模型 | 一次轉換 | ×1.5 | 一次試聽 | 預設包（1,500 字） |
|---|---|---|---|---|
| Chirp 3 HD | US$0.016（在 100 萬字元／月免費額度內為 0） | US$0.024 | US$0.0018 | US$0.045（在免費額度內為 0） |
| tts-1 | US$0.008 | US$0.012 | US$0.0009 | US$0.023 |
| tts-1-hd | US$0.016 | US$0.024 | US$0.0018 | US$0.045 |
| gpt-4o-mini-tts / realtime-2.1-mini | 音訊 tokens 和秒數的換算**官方價格頁沒有列，無法查證**，M5 要用回應的 usage 欄位實測 | — | — | — |

Chirp 免費額度能撐多少：每月 100 萬字元 ÷ 每次轉換 531 字 ≈ 1,880 次轉換／月（不算試聽和重試）。

### 每月總成本估算
假設：當月 N 位付費用戶全部用滿 10 次，每人再加 10 次試聽，並套用 ×1.5 重試。

| 付費用戶 | 轉換次數 | Chirp 3 HD | tts-1-hd | 後端 |
|---|---|---|---|---|
| 100 | 1,000 | 約 0.86M 字元，在免費額度內，約 US$0 | 約 US$26 | Free |
| 1,000 | 10,000 | 約 8.6M 字元，超出部分約 US$228 | 約 US$258 | Free 不夠，D1 寫入會超過，要轉 Paid（US$5） |
| 10,000 | 100,000 | 約 US$2,550 | 約 US$2,580 | Paid，約 US$5–10 |

gpt-4o-mini-tts 和 realtime 的數字要等實測後補上。

## 5. 身分登入候選
| 方案 | 可恢復性 | 優點 | 缺點 |
|---|---|---|---|
| **A. Sign in with Apple ＋ 交易綁定**（推薦） | 換機或重裝後，用同一個 Apple ID 登入就能取回帳本 | 穩定的 `sub`；Apple 審核接受；可以不拿 email | 多一步登入（只在要用 AI 語音時才要求） |
| B. 匿名帳號 ＋ `originalTransactionId` 綁定 | 恢復購買取得同一個 originalTransactionId 後，以交易找回帳本 | 完全不用登入 | 要先有購買才可恢復；免費試聽無法跨裝置限制；家人共享時語意要處理 |
| C. 裝置 ID（identifierForVendor 或 Keychain UUID） | 重裝或換機可能遺失 | 最簡單 | 不符合「可恢復身分」，只能當試聽限流的輔助 |

**建議**：A 為主、B 當後援。
- 帳本主鍵用 `originalTransactionId`，同一筆交易只授予一次 10 次。
- Apple `sub` 綁到交易上。
- 匿名 session 加上 C 只用在免費試聽的限流。

## 6. 購買驗證
- App 用 expo-iap 拿到交易 JWS（StoreKit 2 的 `jwsRepresentation`），送到後端。
- 後端驗證 JWS：
  - x5c 憑證鏈要連到 Apple Root CA G3。
  - 檢查 bundleId、productId、environment。
  - 必要時呼叫 App Store Server API 的 Get Transaction Info，確認沒有被撤銷（`revocationDate`）。
- 再訂閱 App Store Server Notifications V2，收到 REFUND 時停止新的生成（已生成的音檔保留與否，由 Chun 決定）。
- API key（.p8）只放在後端 secret store。

## 7. 額度帳本、快取、限流

### 帳本資料表
- `grants(original_tx_id PK, user_id, granted=10, created_at)`，PK 保證只授予一次。
- `ledger(id, original_tx_id, job_id, kind: reserve|commit|release, delta, idempotency_key UNIQUE, at)`。

### 流程
- **reserve**：單一交易內檢查 `granted - committed - reserved ≥ 1`，再插入。D1 用 batch / transaction，Postgres 用 `SELECT … FOR UPDATE`。
- **commit**：所有段落都通過音長檢查、而且已上傳後才執行。
- **release**：失敗或逾時（例如 30 分鐘）時由排程釋放。
- **冪等**：同一個 `Idempotency-Key` 回傳同一個 jobId。
- **部分成功**：不切換整組，可以只重試失敗的段落，仍在同一個工作內。

### 快取鍵
`sha256(exercise_id | script_version | locale | voice_id | normalized_tone | model_version)`

- `normalized_tone`：trim、全形轉半形、壓縮空白、轉小寫。
- 命中快取時不扣額度。
- 私人語氣的結果只對同一個使用者命中，不跨使用者共享。預設語音則共用。

### 限流（初值，待成本測試後調整）
- 試聽：免費每帳號每天 3 次、付費每天 10 次；每次 ≤80 字、≤15 秒。
- 正式額度用完後，停止提供付費語氣試聽。
- 工作：每個使用者同時最多 1 個執行中。
- 全域：每日 TTS 花費上限，觸發後暫停生成。

## 8. Expo 可行性
- **鎖屏背景播放**：expo-audio 的 config plugin（`enableBackgroundPlayback`）會加上 `UIBackgroundModes: audio`，並設定 `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' })`。
  - JS 在背景可能被暫停，所以要先把整段時間軸的提示音排好；回前景時用時鐘校正。
  - 這一項要真機驗證。
- **keep-awake**：播放中用 `expo-keep-awake`。
- **耳機斷線**：要監聽 route change（oldDeviceUnavailable）。expo-audio 是否直接提供這個事件需要確認，可能要寫小型原生模組，或用社群套件，而這需要 dev build。
- **expo-iap**：原生模組，不能在 Expo Go 跑，必須用 dev build（EAS build 要 Chun 同意）。
  - JS 邏輯可以先在 Expo Go 用 mock 開發。
- **Sign in with Apple**：`expo-apple-authentication`，需要 capability，也要 dev build。
- **影片**：expo-video 播放無聲 MP4。下載用 expo-file-system，搭配 sha256 驗證。

## 9. 安全與文案
- 不寫「專業審核」「物理治療師認可」，也不寫「治療、改善疼痛、復健」這類效果宣稱。
- 定位是「日常伸展與活動」。
- 每個動作都標示參考來源（JSON `sources`：NHS 坐姿與柔軟度活動、Newcastle Hospitals、Cambridge University Hospitals），並註明「來源僅為動作方向參考，不代表來源認證本 App 的講稿或 30 秒安排」。
- 共同注意事項（README §10）在首次使用時顯示，設定頁也可以再看：
  - 若疼痛、麻木、暈眩，立即停止。
  - 有傷勢、剛手術、懷孕或有活動限制，先確認是否適合。
- 標示「AI 合成語音」，加上「非醫療建議」聲明。

## 10. 需要 Chun 確認的付費服務／帳號／金鑰
完整表格見 `accounts-needed.md`，這裡只列重點。

- 所有憑證只由黑嘛嘛（Cloudflare、Google、OpenAI）或蘋果大師（Apple）設定。
- 金鑰只放在 **Wrangler secrets**（後端 secret store），絕不進 app、JSON、repo 或聊天。
- 全部先用免費方案。
- **免費也要付款方式的項目**：
  - Google Cloud：billing account 要綁卡。
  - OpenAI：要先預付至少 US$5。
  - Cloudflare R2：要完成 checkout，是否要卡**未能確認**。

## 資安審查建議（M4／M5 實作時納入）
1. （中）購買時將使用者 UUID 設為 `appAccountToken`，後端驗證時比對 appAccountToken 與 session 使用者一致，避免外流的 signedTransaction 被別的帳號先 verify 而佔走額度。
2. （中）App Store Server Notifications V2 webhook 以相同 x5c 憑證鏈驗證 `signedPayload`，依 `notificationUUID` 去重；未驗證的通知一律丟棄，防偽造 REFUND 或重放。
3. （低）Apple identity token 驗證 iss、aud（bundle ID）、exp、nonce；session JWT 簽章密鑰放 secret store，有效期短。
4. （低）toneText 除長度上限外過濾控制字元，伺服器端固定系統指令，避免使用者改寫模型行為。
5. （低）log 與錯誤訊息不記錄 signedTransaction、identity token、session JWT、簽名 URL、toneText 原文（必要時只記 hash 或前後幾碼）；簽名 URL 有效期短（例如 15 分鐘）。
6. （低）R2 分開 bucket：預設語音包公開、私人音檔私有，不共用同一 bucket 以路徑區分。



