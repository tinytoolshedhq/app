# 伸展（app5/mobile）

2026-11-07 白藍 UI 改版：首頁只保留「上次使用／組合／部位」，流程為預覽 → 跟練 → 完成。沒有統計、提醒、登入或購買入口。舊的 IAP 模組暫存，但不在啟動流程執行。

## 執行

```sh
npm ci
npm run content:build
npm run assets:build
npm run typecheck
npm run lint
npm test -- --runInBand
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --ios --lan --port 8085
```

這台 Mac 的 `--localhost` 曾只監聽 IPv6，但 Expo manifest 使用 IPv4；上面的啟動方式可避免這個問題。不執行 EAS build / submit。

## 當前行為

- 6 個情境組合、8 個部位入口，引用同一份 36 個動作資料；包含同一活動的姿勢變體與關節活動。
- 每動作固定 30 秒，段後含最後一段固定緩衝 3 秒。預覽的「活動時間」不包含緩衝。
- 預覽可長按動作右側把手，上下拖曳排序；靠近上下邊緣會自動捲動。跟練會使用調整後的順序。
- 按下開始跟練才持久化最後組合與順序；只查看預覽不覆寫。重開首頁仍可恢復。第一次使用不顯示空白歷史卡片。
- 白底、亮藍、Noto Sans TC 字型；首頁使用組合清單與部位標籤，跟練使用長方形人物示範與分段進度條。
- 壺鈴只作吉祥物，出現在首頁與完成頁。純色眼睛、線條嘴巴、無腮紅；動作維持靜態人物與箭頭。
- 介面移除注意事項、動作參考、底部醫療提示。資料庫保留來源與原有欄位供內容維護。
- 背景音樂採使用者提供的 `assets/music/stretch-background.mp3`，以 25% 音量循環。暫停、查看動作說明、完成或離開時停止／暫停；音樂開關會持久保存。
- App 進入背景會暫停跟練，返回後由使用者繼續。本原型尚未驗證真機音訊中斷／耳機拔除行為。
- 目前沒有語音音檔，也不呼叫 TTS；定時顯示每句講稿。未來音檔按下節流程加入，已接好本地播放介面。

## 動作與組合資料

`assets/exercises/` 是新版動作的唯一編輯來源；`assets/content/exercises.zh-Hant.json` 僅保留舊分類與規格資料，執行時動作陣列會由新版取代。

```text
assets/exercises/
  手臂/
    三頭肌/
      stand_triceps/
        exercise.json
        audio/
          stand_triceps_cue_01.mp3  # 尚未生成
          stand_triceps_cue_02.mp3
          stand_triceps_cue_03.mp3
          stand_triceps_cue_04.mp3
  sources.json
  routines.json
  動作清單.txt                     # content:build 自動產生
```

各 JSON 包含動作 ID、姿勢、部位標籤、器材、準備姿勢、中文步驟、注意事項、完整 0–30 秒時間軸、來源 ID，以及 `library` 的部位／肌群／靜態圖模板。來源英文網址與適用範圍列於 `sources.json`。首批沿用原有 30 筆中文草稿，另新增 6 筆參考英文來源的內容；30 秒編排、換側及部分姿勢變體是產品設計，不是來源原始運動處方，亦未經動作專業審核。

`routines.json` 僅保存有序 `exercise_ids`，同一動作可重複引用於不同組合。新增至上百筆時不需要增加播放器分支。現有組合避免途中切換坐／站／躺；部位集合依坐→站→躺排序，使用者可暫停準備。

## 語音檔加入流程

每個動作的 `voice_cues` 是待合成逐句講稿。例如：

```json
{
  "id": "stand_triceps_cue_01",
  "at_seconds": 0,
  "max_duration_seconds": 9,
  "text": "左手抬高彎肘，右手輕扶左肘。",
  "audio_path": "audio/stand_triceps_cue_01.mp3",
  "audio_status": "pending",
  "measured_duration_seconds": null
}
```

1. 每句個別合成，將 MP3 放進該動作的 `audio/`，路徑相對於該 `exercise.json`。
2. 量測真實長度，填入 `measured_duration_seconds`，人工檢查方向、發音與完整性，將 `audio_status` 改為 `ready`。
3. 超出 `max_duration_seconds` 請重新合成調整語速，不要截掉重要提示。下一句及 30 秒邊界不可重疊。
4. 執行 `npm run content:build`。Metro 需要靜態 `require()`，不能只把檔案丟入資料夾就自動發現。建置腳本會拒絕 ready 但缺檔、未量測或超時的音檔。
5. 執行型別、lint 與測試，再在模擬器／真機檢查。可以逐句補檔，缺檔仍使用文字提示。

生成的 `src/content/exercise-index.ts` 同時匯入 JSON 與現有音檔。執行時依 `at_seconds` 播放；暫停會暫停語音，切動作、緩衝和完成會停止原提示。語音與音樂使用不同播放器。未使用的預製舊 TTS 試聽工具位於 repo 的 `stretch-app/tts-audition`，本流程不自動執行它。

## 白藍設計與本地素材

設計稿：https://www.figma.com/design/wUNg8befHYBeTFeefkpfpk?node-id=4-139

- 首頁 `4:294`、預覽 `4:393`、跟練 `4:465`、完成 `4:534`。
- `assets/figma/kettlebell-cheer.svg`：由 Figma 完成頁正式匯出的 SVG（原始 230×253）。
- `assets/figma/kettlebell-hello.svg`：保存本對話中已確認的 Figma 原始向量繪圖資料（200×220）。因 Starter 讀取額度達上限，沿用已保留的幾何資料。
- `assets/figma/back.svg`：Figma 匯出的返回圖示（22×22）。
- `npm run assets:build` 將以上檔案封裝成 `src/components/figmaAssets.ts`，供 React Native SVG 本地讀取；不依賴暫時素材網址。
- `Mascot` 保留 SVG 原始比例，透過等比例容器縮放。
- 字型使用本地打包的 Noto Sans TC Regular / Medium / Bold；載入完成後才顯示主畫面。
