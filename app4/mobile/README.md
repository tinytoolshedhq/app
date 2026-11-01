# Decibel Meter (app4/mobile)

Minimal on-device sound level estimate for Expo Go (SDK 57) and production native builds. v1.1 adds records, calibrations, export, and a one-time Full Pack unlock.

```bash
cd app4/mobile && npm install && npm start
```

Open in Expo Go. Grant the microphone when you tap Start.

## How the number is computed

`expo-audio` recorder metering is **dBFS** (about -160 silence to 0 near clipping), not A-weighted SPL.

```
display dB = clamp(dBFS + 100 + offset, 0, 140)
```

At offset 0, 0 dBFS maps to 100 dB. The calibration adjust is -20…+20 dB (step 1), saved locally with AsyncStorage. Smoothing and session max/avg/min run on the pre-offset base (`dBFS + 100`); the offset is applied only when rendering current / max / avg / min. Changing calibration mid-session remaps those numbers and does **not** reset the session. Avg is the arithmetic mean of the remapped smoothed values, not an energy average. Native -160 dBFS silence sentinels are ignored. The reading is an **estimate**, for reference only.

Metering pauses when the app backgrounds. After Stop, the last **smoothed** reading stays frozen (it does not snap to the last raw sample); before the first usable sample after Start, the UI shows "—". Audio is processed on-device for the level reading only. `expo-audio` writes a short-lived cache file while metering; the app deletes `recorder.uri` (via `expo-file-system`) on stop, on unmount, and before the next start, and never saves, plays, or sends the cache file. If a delete fails, the URI is kept in a bounded in-memory retry list of 20 (oldest dropped; paths are not logged) and retried on the next stop/unmount/start cleanup. No account, network, analytics, waveform, or spectrum.

`expo-audio` also adds the Android `MODIFY_AUDIO_SETTINGS` permission (needed later for the Play Data safety / privacy label). It is not a microphone permission; it lets the OS session change things like silent-mode playback while recording.

## Free vs Full Pack

One-time non-consumable IAP. Price is set in App Store Connect (US$2.99), never hardcoded.

**Product id:** `com.tinytoolshed.decibelmeter.fullpack`

| | Free | Full Pack |
| --- | --- | --- |
| Estimated current / max / avg / min | Yes | Yes |
| Everyday level hint (e.g. ~60 dB ≈ conversation) | Yes | Yes |
| Calibration | One | Named profiles |
| Session length | Auto-stop at 5:00, data kept | Unlimited |
| Records | Up to 10, view-only | Unlimited + notes |
| Export CSV / image / PDF | — | Yes |
| Vibration over a set threshold | — | Yes |

The paywall appears only when: saving the 11th record, tapping export, reaching 5:00 (stop first, then prompt), or adding a second calibration. It is dismissible. Restore Purchases is on Settings and the paywall.

`IAP_SIMULATE` is for preview / `__DEV__` / Expo Go only. The production EAS profile must not set it.

Purchases use `expo-iap`. After a successful buy the app grants Pro and then `finishTransaction({ isConsumable: false })`. Launch and Restore finish leftover Full Pack transactions. `E_ALREADY_OWNED` runs restore, grants Pro, finishes, and shows the localized restored message. Pending Ask-to-Buy does not unlock. A pending-verification unlock expires after 14 days if StoreKit never confirms. Web / Expo Go / missing native IAP use a shim and a 15s timeout so the UI never hangs.

## v1.1 notes

- iPad: content max width 600, centered
- Warning when the estimate is above 95 or below 40
- Tip: remove the phone case; don’t use AirPods or an external mic
- Copy says estimate / for reference only. Never dB(A). Never professional, medical, or hearing-related use.

## iOS measurement mode (native builds only)

`expo-audio` `setAudioModeAsync` configures `AVAudioSession` with **mode `.default`**. The local Expo module `audio-measurement-session` sets category `.playAndRecord` or `.record` and **mode `.measurement`**. JS calls it **after** `setAudioModeAsync` and **after** `recorder.record()`. Expo Go does not include the native code: the JS wrapper feature-detects and no-ops.

## EAS

- `ios.bundleIdentifier` / `android.package`: `com.tinytoolshed.decibelmeter`
- Full Pack product id: `com.tinytoolshed.decibelmeter.fullpack`
- `owner`: `leowang1105`; `extra.eas.projectId`: `117e579d-6aec-40ea-8e97-19bc314debcb`
- `ios.buildNumber`: `"3"`; `version`: `1.1.0`. Production `autoIncrement` is on.
- `eas.json` profiles: `development` (dev client), `preview` (iOS simulator, `IAP_SIMULATE=1`), `production` (`autoIncrement: true`, no simulate)
- Do not put Apple team IDs, ASC app IDs, or credential paths in the repo. Do not run `eas build` / `eas submit` from this tree unless asked.

## What needs a dev / production build

- **Purchases (`expo-iap`)** — not in Expo Go. Expo Go / web use the shim + 15s timeout.
- **iOS measurement mode** — local native module; Expo Go no-ops.
- Export (CSV / PDF / image), haptics, and sharing are Expo-managed and work in Expo Go when the OS supports them. Image export uses `react-native-view-shot` (works in Expo Go; not on web).

## Tests

```bash
npm test
npm run typecheck
npm run lint
npx expo-doctor
```
