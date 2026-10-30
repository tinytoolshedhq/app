# Apps

此 repo 有多個獨立的 Expo app。根目錄的 `package.json`、`app.json`、`eas.json` 是空殼；版本、權限與 EAS 設定都在各 app 目錄裡。

| | app1 | app2 | app3 | app4 | app5 |
|---|---|---|---|---|---|
| 名稱 | 諧音猜猜 | 急廁 Go | Been Ages | Decibel Meter / 分貝計 | 伸展 |
| 目錄 | `app1/game` | `app2/mobile`（正式）；`app2/web` 為舊版 demo | `app3/mobile` | `app4/mobile` | `app5/mobile` |
| Bundle / package | `com.soundalike.app` | `com.toiletgo.app` | `com.beenages.app` | `com.tinytoolshed.decibelmeter` | `com.tinytoolshed.stretch` |
| 版本 | `1.0.0`（`ios.buildNumber` 由 EAS remote 遞增） | `1.1.5`（`ios.buildNumber` `22`，`appVersionSource: local`） | `1.1.1`（`ios.buildNumber` `12`，`appVersionSource: local`） | `1.0.0`（`ios.buildNumber` `2`，`appVersionSource: local`） | `0.1.0`（`ios.buildNumber` `1`，`appVersionSource: local`） |
| ASC App ID | `6798265759` | `6798266716` | TBA | TBA | TBA |
| 內購 | 無 | 非消耗型 `com.toiletgo.app.fullpack` | 非消耗型 `com.beenages.app.fullpack` | 無 | 非消耗型 `com.tinytoolshed.stretch.fullpack`（TODO，尚未在 ASC 建立） |
| 敏感權限 | 無（播放音效；麥克風已關閉） | 僅使用期間定位 | 無 | 麥克風（expo-audio metering；暫停於背景） | 無 |

商店頁（支援／隱私）由 repo 根目錄 `deploy-store-pages.sh` 部署到 GitHub Pages。合併後在 `main` 執行 `./deploy-store-pages.sh`（不要從功能分支跑，除非你就是要發那一版 HTML）。腳本會複製 `app1`–`app4` 的 `store/support.html` 與 `store/privacy.html`；缺檔會失敗，以免留下 gh-pages 上過期的內容。

---

## app1 — 諧音猜猜

諧音梗問答。題目圖在 `app1/game/assets/pictures/`（`1-1.jpg`、`1-2.jpg`…）。產品備註見 `app1/note.md`。

```bash
cd app1/game && npm install && npm start
```

上架文案與送審步驟：`app1/STORE_COPY.md`、`app1/store/SUBMIT.md`。

`app1/game/app.json` 的 `expo-av` 設了 `microphonePermission: false`。App 只播放音效，沒有麥克風、相機、相簿或定位。`ios.infoPlist` 只有 `ITSAppUsesNonExemptEncryption: false`。

---

## app2 — 急廁 Go

依定位找出附近還在營業、有廁所的地點；免費版線上載入 7-11，買斷後可下載離線完整資料包。產品與資料流見 `app2/note.md`。

```bash
cd app2/mobile && npm install && npm start
```

需設定 `mobile/.env`（參考 `.env.example`）：`EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_ANON_KEY`。地點 CDN 預設在 `app2/mobile/eas.json`：`EXPO_PUBLIC_PLACES_URL=https://tinytoolshedhq.github.io/app/places`。Android 正式包還需要 `GOOGLE_MAPS_API_KEY`（見 `app2/mobile/app.config.js`）。

| 文件 | 用途 |
|------|------|
| `app2/STORE_COPY.md` | App Store Connect 文案 |
| `app2/APP_STORE_IAP.md` | iOS 內購建立與 TestFlight 測試 |
| `app2/PLAY_STORE.md`、`app2/store/play/LISTING.md` | Google Play 文案與上架 |
| `app2/note.md` | 資料流、`fetchData/`、`deploy-places.sh` |

內購商品 ID 以程式為準：`app2/mobile/eas.json` 的 production / preview，以及 `app2/mobile/src/lib/iap.js` 預設值，都是 `com.toiletgo.app.fullpack`。`preview` profile 設了 `EXPO_PUBLIC_IAP_SIMULATE=1`，測真實 StoreKit 要用 `production`。

定位用途字串：

- 預設（`app.json` 的 `infoPlist` 與 `expo-location` plugin）：英文 “Your location is used to find nearby stores and cafes with a toilet.”
- 繁中、日文由 `expo-localization` 的 `locales` 注入：`languages/zh-Hant.json`、`languages/ja.json`、`languages/en.json` 的 `ios.NSLocationWhenInUseUsageDescription`
- Android 只宣告 `ACCESS_COARSE_LOCATION`、`ACCESS_FINE_LOCATION`

沒有相機、相簿、麥克風。

---

## app3 — Been Ages

「上次做這件事是多久以前？」生活記錄器。v1.1：清單、新增／編輯、記錄、提醒、小工具、分享卡片、行事曆、最近刪除與付費牆。

```bash
cd app3/mobile && npm install && npm start
```

- i18n：英文為主，含繁中（`zh-Hant`）與本機化顯示名稱
- IAP：一次性買斷 `com.beenages.app.fullpack`（照 `eas.json`；`preview` 以 `EXPO_PUBLIC_IAP_SIMULATE=1` 模擬）
- 單元測試：`npm test`

---

## app4 — Decibel Meter / 分貝計

用 `expo-audio` recorder metering（dBFS）加上使用者校準偏移，估算音量。可在 Expo Go 執行；沒有登入、網路或分析。

```bash
cd app4/mobile && npm install && npm start
```

- 顯示公式：`clamp(dBFS + 100 + offset, 0, 140)`（offset -20…+20，本機儲存）
- 權限：iOS `NSMicrophoneUsageDescription`、Android `RECORD_AUDIO`（`expo-audio` plugin）。背景時暫停 metering
- Bundle：`com.tinytoolshed.decibelmeter`。商店頁：`app4/store/`（合併後跑 `./deploy-store-pages.sh`）

---

## app5 — 伸展

依姿勢、部位與時間組合短時間伸展與活動。此切片離線：內容驗證、規則選課、播放器、記住上次選項、一次買斷 IAP（本機）。規格與內容見 `stretch-app/`。

```bash
cd app5/mobile && npm install && npm start
```

- 單元測試／型別／lint：`npm test`、`npm run typecheck`、`npm run lint`
- IAP 商品 ID 佔位：`com.tinytoolshed.stretch.fullpack`（尚未在 App Store Connect 建立）
- 無後端、無 TTS、無網路。動畫與語音為佔位。

---

## 付費版第一次 build

只有 **急廁 Go** 有 App 內購買。第一次打含 IAP 的正式包之前，先在 App Store Connect 與 Google Play Console 建好內購，product ID 與 `com.toiletgo.app.fullpack` 一致，再 `eas build`。商品未建或 ID 不符時，解鎖會失敗，通常要再送一版。

逐步操作見 `app2/APP_STORE_IAP.md`。第一次送審時，在版本頁勾選該 IAP 一併提交。

---

## iOS 隱私權限用途說明（Purpose Strings）

上架前對照各 app 實際呼叫的 API，只保留用到的權限。用途說明要具體；占位符或空泛英文（例如 “Allow app to access your microphone”）會被 Guideline 5.1.1 拒絕。第三方 SDK 只要把 API 打進 binary，就會要求對應的 `Info.plist` 鍵，即使 JS 沒呼叫。

目前幾個 app 的對照：

| 檢查 | 諧音猜猜 | 急廁 Go | 分貝計 |
|------|----------|---------|--------|
| 實際權限 | 無 | 使用期間定位 | 麥克風（僅估計音量） |
| 關掉用不到的 | `expo-av` → `microphonePermission: false` | 未裝 image-picker / 相機 / 麥克風 | 未開背景錄音／播放 |
| 用途說明 | 不需要 `*UsageDescription` | 英文預設＋ `languages/*.json` 的繁中、日文 | `expo-audio` plugin ＋ `languages/ios/*.json` |
| Android | 無多餘 permission | 僅定位 | `RECORD_AUDIO`（plugin `recordAudioAndroid`） |

若之後加 `expo-image-picker` 且只用相簿（`launchImageLibraryAsync`），不要設 `cameraPermission`；相機權限容易一併注入預設的 `NSMicrophoneUsageDescription`。只在真的要錄影收音時，才寫具體的麥克風用途說明。

送審前：

- [ ] 急廁 Go：商店後台已有 `com.toiletgo.app.fullpack`，與 `eas.json` / `iap.js` 一致
- [ ] `app.json` plugin、`ios.infoPlist`、`android.permissions` 與程式實際使用的權限一致
- [ ] 每個 `*UsageDescription` 都說明具體用途（急廁 Go 的繁中在 `languages/zh-Hant.json`）
- [ ] 權限有改時遞增 build（app2 改 `ios.buildNumber`；app1 由 EAS remote `autoIncrement`）後再 deploy
- [ ] App Store Connect 改選新 build，重新提交審查

參考：[Guideline 5.1.1](https://developer.apple.com/app-store/review/guidelines/#privacy)
