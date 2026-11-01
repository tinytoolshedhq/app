# app4 v1.1.0 App Store screenshots

Store sizes only. Caption band (when present) sits above the real UI and is included in the pixel size.

| Size | Pixels | Path |
| --- | --- | --- |
| iPhone 6.7" / 6.9" | 1290×2796 | `iphone/<locale>/` |
| iPad 13" | 2048×2732 | `ipad/<locale>/` |
| IAP review (uncaptioned paywall) | 1290×2796 | `iap-review/<locale>-paywall.png` |

Locales: `en-US`, `zh-Hant`.

## Order

1. `01-meter.png` — live meter. Caption: “Open and measure. One-time unlock. No subscription.” / 「打開就量・一次買斷・沒有訂閱」
2. `02-levels.png` — everyday level reference on the meter
3. `03-records.png` — history list
4. `04-export.png` — CSV / image / PDF export UI
5. `05-paywall.png` — Full Pack, US$2.99 one-time

`iap-review/<locale>-paywall.png` is the same paywall at iPhone size with no caption band.

## Copy

On-screen and caption copy says estimate / for reference only where relevant. None of these files use `dB(A)`, “professional”, “medical”, “hearing”, or accuracy claims.

## Capture notes

- UI is the real v1.1 screens (`MeterScreen`, `RecordsSheet`, `PaywallSheet`) from commit `93b85cf`.
- This environment has no Xcode / iOS Simulator. Frames were captured from Expo web at the store CSS sizes, with a 9:41 status bar drawn in the safe-area inset.
- Demo meter values and five history rows were local uncommitted tweaks (not in this PR).
- StoreKit cannot return a price on web. `US$2.99` was injected only for these shots (the app has no hardcoded store fallback).
- Redeem Code is hidden on web (`canPresentRedeemCode()` is false), so it does not appear.

## Files

```
iphone/en-US/01-meter.png          1290×2796
iphone/en-US/02-levels.png         1290×2796
iphone/en-US/03-records.png        1290×2796
iphone/en-US/04-export.png         1290×2796
iphone/en-US/05-paywall.png        1290×2796
iphone/zh-Hant/01-meter.png        1290×2796
iphone/zh-Hant/02-levels.png       1290×2796
iphone/zh-Hant/03-records.png      1290×2796
iphone/zh-Hant/04-export.png       1290×2796
iphone/zh-Hant/05-paywall.png      1290×2796
ipad/en-US/01-meter.png            2048×2732
ipad/en-US/02-levels.png           2048×2732
ipad/en-US/03-records.png          2048×2732
ipad/en-US/04-export.png           2048×2732
ipad/en-US/05-paywall.png          2048×2732
ipad/zh-Hant/01-meter.png          2048×2732
ipad/zh-Hant/02-levels.png         2048×2732
ipad/zh-Hant/03-records.png        2048×2732
ipad/zh-Hant/04-export.png         2048×2732
ipad/zh-Hant/05-paywall.png        2048×2732
iap-review/en-US-paywall.png       1290×2796
iap-review/zh-Hant-paywall.png     1290×2796
```
