# v1 需要的帳號清單（伸展 app，暫定名）

更新：2026-10-30。**只是清單，尚未開任何帳號。**

規則：
- 所有金鑰只存在後端 secret store，也就是 **Wrangler secrets**（`wrangler secret put`）。
- 金鑰絕不進 app、JSON、repo、文件或聊天。
- 開帳號、設定憑證只由黑嘛嘛（Cloudflare、Google、OpenAI）或蘋果大師（Apple）處理。
- 任何要花錢的動作都要先經 Chun 同意。

| 帳號／項目 | 有免費方案？ | 免費也要卡或預付？ | 誰設定 | 產生的 secret → 存放位置 | 建議花費上限／警示 |
|---|---|---|---|---|---|
| Cloudflare Workers Free | ✅ 每天 10 萬 requests | 官方頁沒寫需要卡，**未能確認是否完全免卡** | 黑嘛嘛 | 部署用的 API token 只放在 CI／黑嘛嘛的 secret store，不進 repo | Free 沒有費用；Dashboard 開 usage 通知 |
| Cloudflare D1 | ✅ 每天寫入 10 萬 rows，總容量 5 GB | 包含在 Workers | 黑嘛嘛 | 不需要 secret（用 binding） | D1 寫入超過 70,000 rows／天就警示 |
| Cloudflare R2 | ✅ 10 GB-month、Class A 100 萬次、Class B 1,000 萬次 | 要先完成「R2 subscription checkout」，**是否需要卡未能確認**（[R2 get started](https://developers.cloudflare.com/r2/get-started/)，2026-10-30） | 黑嘛嘛 | 用 binding，不需要 S3 key；若要 S3 key，放 Wrangler secrets | 8 GB 時警示 |
| Google Cloud（Text-to-Speech，Chirp 3 HD） | ✅ 每月 100 萬字元（Chirp 3 HD） | **需要**：要有 billing account，Free Trial 註冊時要提供信用卡或其他付款方式（[Free program](https://docs.cloud.google.com/free/docs/free-cloud-features)、[TTS pricing](https://cloud.google.com/text-to-speech/pricing)，2026-10-30） | 黑嘛嘛 | Service account JSON key，或改用 API key 並限制只能呼叫 TTS → Wrangler secrets | Budget alert 設 US$5／月（50%、90%、100% 通知）；在 quota 頁限制每天的字元數 |
| OpenAI API（gpt-4o-mini-tts，或替代的 gpt-realtime-2.1-mini） | ❌ 新帳號是預付制 | **需要預付 credits**，最少 US$5，關閉 auto-reload（[OpenAI help](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing)，2026-10-30） | 黑嘛嘛 | Project API key，只開 audio 權限 → Wrangler secrets | 先預付 US$5–10；設 project hard spend limit；不開 auto-reload |
| Apple Developer Program | 已有（年費） | 已付 | 蘋果大師 | — | — |
| ASC：非消耗型商品 ID 與價格 | — | — | 蘋果大師（價格要 Chun 決定） | 不是 secret | — |
| ASC：In-App Purchase API key（.p8、Key ID、Issuer ID） | 免費 | 不需要 | 蘋果大師 | .p8 內容 → Wrangler secrets；**絕不 commit .p8，也不寫路徑或 ID** | — |
| ASC：App Store Server Notifications V2 URL | 免費 | 不需要 | 蘋果大師 | 不需要 secret（payload 用 x5c 驗證） | — |
| Sign in with Apple（App ID capability） | 免費 | 不需要 | 蘋果大師 | 用 bundle ID 作為 aud，不需要 secret | — |
| Expo／EAS（dev build、TestFlight） | 沿用既有帳號 | 沿用既有方案；**每次 build 都要 Chun 同意** | 蘋果大師 | EXPO_TOKEN 已在既有 secret store，不印出、不新增 | — |
| Figma | ✅ Starter | 不需要 | previewer／黑嘛嘛 | 不需要 | 先不升級 |

**需要卡或預付的項目**：
- Google Cloud（billing account 要綁卡）
- OpenAI（預付至少 US$5）
- Cloudflare R2（checkout，是否要卡未確認）
