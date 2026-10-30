# 伸展 app（暫定名）實作計畫 — app5/

更新：2026-10-30。依據：`README.md`、`exercises.zh-Hant.json`，以及 Chun 2026-10-30 的四項決定。
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

## 3. 後端候選（2026-10-30 查官方頁）
| 候選 | 免費額度 | 付費起點 | 適合度 |
|---|---|---|---|
| **Cloudflare Workers + D1 + R2 + Queues**（推薦） | Workers 每天 10 萬 requests；D1 每天 500 萬 rows read、10 萬 rows written、5 GB；R2 10 GB-month、egress 免費；Queues 每天 1 萬 ops | Workers Paid 每月 US$5（含 1,000 萬 requests、D1 250 億 reads、5,000 萬 writes）；R2 US$0.015/GB-month | D1 可用 SQL 交易做原子預留；R2 egress 免費，適合音檔下載；Queues 跑生成工作。缺點：要自己寫 auth（Apple JWKS 驗證） |
| Supabase | Free：50,000 MAU、500 MB DB、1 GB 檔案、5 GB egress；1 週沒活動會暫停 | Pro 每月 US$25 起（100 GB 檔案、250 GB egress） | Postgres 交易最穩，內建 Sign in with Apple。Free 會暫停，不適合正式上線 |
| Firebase（Cloud Functions + Firestore + Storage） | Functions 每月 200 萬次（需 Blaze）；Firestore 每天 2 萬 writes、5 萬 reads；Storage 5 GB、每月 100 GB 下載（限美國區） | Blaze 按量計費 | Auth 成熟；Firestore transaction 可做帳本。Functions 一定要綁卡（Blaze） |

來源：<https://developers.cloudflare.com/workers/platform/pricing/>、<https://supabase.com/pricing>、<https://firebase.google.com/pricing>（皆 2026-10-30 查）。

## 4. TTS 供應商候選（2026-10-30 查官方頁）
字數是用腳本從 JSON 實際統計的 `voice_cues.text`：30 動作、120 段、**共 1,500 字**，每動作 42–56 字（平均 50）。最長的 10 個動作合計 531 字。所有 `max_duration_seconds` 合計 780 秒。

| 供應商／模型 | 官方價格 | zh-TW 品質 | 語氣指令 |
|---|---|---|---|
| OpenAI gpt-4o-mini-tts | 文字輸入 US$0.60/1M tokens；音訊輸出 US$12/1M tokens | 支援中文；台灣口音和用詞要實測 | ✅ 有 `instructions` 參數，最符合「可愛、溫柔、慢一點」這類需求 |
| OpenAI tts-1 / tts-1-hd | US$15 / US$30 每 1M 字元 | 同上，偏中性 | ❌ 只能調語速 |
| Google Chirp 3 HD | 每月前 100 萬字元免費，之後 US$30/1M | 有 cmn-TW 聲音（要試聽） | 有限（SSML、語速） |
| Google Gemini 2.5 Flash TTS | 輸入 US$0.50/1M tokens；輸出 US$10/1M audio tokens（25 tokens/秒） | 要實測 | ✅ 用 prompt 控制風格 |
| ElevenLabs v4 / Flash | v4 US$0.08/1K 字元；Flash/Turbo US$0.04/1K | 多語；中文口音要實測 | ✅ v4 有 audio tags |
| Azure Speech zh-TW Neural | **官方頁的數字沒有載出來，今天無法查證**。只確認 F0 免費層每月 50 萬字元 | zh-TW 聲音最成熟，例如 HsiaoChen | SSML style（部分聲音） |

來源：<https://developers.openai.com/api/docs/pricing>、<https://cloud.google.com/text-to-speech/pricing>、<https://elevenlabs.io/pricing/api>、<https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/>（皆 2026-10-30 查）。

### 成本估算
假設：
- 一次轉換：最長 10 個動作，531 字，音長上限 300 秒（README 上限 5 分鐘）。
- 試聽：約 60 字、約 10 秒。
- 重試係數 ×1.5。

| 模型 | 一次轉換 | ×1.5 重試 | 一次試聽 | 預設包（1,500 字／780 秒） |
|---|---|---|---|---|
| gpt-4o-mini-tts | 音訊 token 對秒數的換算**今天官方頁未列，無法查證**，M5 要用 usage 回傳值實測 | — | 實測 | 實測 |
| tts-1 | US$0.008 | US$0.012 | US$0.0009 | US$0.023 |
| Chirp 3 HD | US$0.016 | US$0.024 | US$0.0018 | US$0.045（在免費額度內是 0） |
| Gemini 2.5 Flash TTS | ≤US$0.075（300 秒 ×25 tokens） | ≤US$0.11 | ≈US$0.0025 | ≈US$0.20 |
| ElevenLabs v4 | US$0.042 | US$0.064 | US$0.0048 | US$0.12 |

每位用滿 10 次的付費用戶（含重試）：tts-1 約 US$0.12；Chirp 3 HD 約 US$0.24；ElevenLabs v4 約 US$0.64；Gemini 上限約 US$1.1。

### 每月總成本估算
假設：當月 N 位付費用戶**全部用滿 10 次**，每人再加 10 次試聽，用 ElevenLabs v4 做保守估計；後端是 Cloudflare Paid。

| 付費用戶 | 轉換次數 | TTS（v4，含重試＋試聽） | 後端 | 音檔儲存 |
|---|---|---|---|---|
| 100 | 1,000 | ≈ US$69 | US$5 | 約 0.5 GB，在免費額度內 |
| 1,000 | 10,000 | ≈ US$690 | US$5（requests 和 rows 都在額度內） | 約 5 GB，免費 |
| 10,000 | 100,000 | ≈ US$6,900 | ≈ US$5–10 | 約 50 GB ≈ US$0.6/月 |

音檔大小假設每個動作約 50 KB（AAC 64 kbps、約 26 秒 ≈ 200 KB 為上限）。換成 Chirp 3 HD 時，TTS 費用約為上表的 40%。

對照 README 的假設試算（US$4 售價、10 次預算 US$1）：Apple 抽成 15%（Small Business Program）後約剩 US$3.4。v4 每人約 US$0.69，在預算內。Gemini 的上限情況接近 US$1，偏緊。

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
所有憑證只由**黑嘛嘛或蘋果大師**設定。金鑰只存在後端 secret store（例如 Cloudflare Workers Secrets），絕不進 app、JSON、repo 或聊天。

| 項目 | 費用 | 誰設定 |
|---|---|---|
| 1. 後端主機帳號（建議 Cloudflare，Workers Paid） | 每月 US$5；Free 可先開發 | 黑嘛嘛 |
| 2. 資料庫（D1，包含在 1；若選 Supabase 則 Pro 每月 US$25） | 包含在 1 | 黑嘛嘛 |
| 3. 物件儲存與 CDN（R2，包含在 1，超過 10 GB 後 US$0.015/GB） | 估計很低 | 黑嘛嘛 |
| 4. TTS 供應商帳號與 API key：二選一，或兩個都開來比較 | 按量計費；先設每月花費上限 | 黑嘛嘛 |
| 5. App Store Connect：非消耗型商品 ID 與價格、In-App Purchase API key（.p8、Key ID、Issuer ID）、Server Notifications V2 URL | Apple 開發者年費已有 | 蘋果大師 |
| 6. Sign in with Apple capability 與 App ID 設定 | 無 | 蘋果大師 |
| 7. EAS dev build 與 TestFlight build | 每次都要 Chun 同意 | 蘋果大師 |
| 8. Figma：先用 Starter，超出才升級 | 先免費 | previewer／黑嘛嘛 |
| 9. （選用）網域，用於 API 與 CDN | 每年約十幾美元，未查證 | 黑嘛嘛 |

## 資安審查建議（M4／M5 實作時納入）
1. （中）購買時將使用者 UUID 設為 `appAccountToken`，後端驗證時比對 appAccountToken 與 session 使用者一致，避免外流的 signedTransaction 被別的帳號先 verify 而佔走額度。
2. （中）App Store Server Notifications V2 webhook 以相同 x5c 憑證鏈驗證 `signedPayload`，依 `notificationUUID` 去重；未驗證的通知一律丟棄，防偽造 REFUND 或重放。
3. （低）Apple identity token 驗證 iss、aud（bundle ID）、exp、nonce；session JWT 簽章密鑰放 secret store，有效期短。
4. （低）toneText 除長度上限外過濾控制字元，伺服器端固定系統指令，避免使用者改寫模型行為。
5. （低）log 與錯誤訊息不記錄 signedTransaction、identity token、session JWT、簽名 URL、toneText 原文（必要時只記 hash 或前後幾碼）；簽名 URL 有效期短（例如 15 分鐘）。
6. （低）R2 分開 bucket：預設語音包公開、私人音檔私有，不共用同一 bucket 以路徑區分。

