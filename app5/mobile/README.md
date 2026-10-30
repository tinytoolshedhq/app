# 伸展（app5/mobile）

離線核心切片：內容驗證、規則選課、播放器時間軸、記住上次選項、一次買斷 IAP（本機）。無後端、無 TTS、無網路呼叫。

## 執行

```bash
cd app5/mobile
npm install
npm test
npm run typecheck
npm run lint
npx expo start
```

Expo Go 可跑畫面與選課／播放器（音訊為靜音佔位）。`expo-iap` 在 Expo Go 會走模擬購買。

## 佔位

- 動畫：靜態線條佔位，尚無 MP4
- 語音：`AudioService` 靜音實作，尚無音檔
- 耳機斷線暫停：介面已留 `onRouteChange`，Expo Go 無 route-change 事件
- IAP 商品 ID：`com.tinytoolshed.stretch.fullpack`（TODO，尚未在 App Store Connect 建立）
- 不要執行 `eas build` / `eas submit`

內容 JSON 與 `stretch-app/exercises.zh-Hant.json` 相同。`review_status` 為 `source_referenced`，畫面不宣稱專業審核或治療效果。
