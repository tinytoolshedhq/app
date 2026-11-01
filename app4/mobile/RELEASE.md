# App4 iOS build numbers

Last uploaded TestFlight build: **3** (version `1.1.0`).

`eas.json` uses `cli.appVersionSource: local` and production `autoIncrement: true`. EAS bumps `ios.buildNumber` in `app.json` before a production build, so `main` must keep the last used value (`"3"`). The next production build becomes **4** and will not collide with the uploaded build 3.

## Next build (after 3) — TestFlight owner fixes

Do not change the last uploaded build number above. These land in the next EAS production build (4):

- **Crash:** start → stop → start no longer crashes. After Stop we delete the metering cache file; the next Start now always calls `prepareToRecordAsync(RECORDING_OPTIONS)` so expo-audio creates a new native `AVAudioRecorder` instead of reusing the one whose file was deleted. Start/stop/pause/resume/release share one serialized queue; AppState background/foreground pause/resume no-op if stop/release is pending or done; unmount releases once.
- **Image export:** capture a dedicated off-screen export card (full records, no sheet chrome / status bar / buttons). After save: 「已儲存到相簿」 / "Saved to Photos" when `expo-media-library` actually writes to Photos; otherwise an accurate share-sheet message. Cancel and photo-permission denial are not reported as success. `app.json` adds the `expo-media-library` config plugin (existing photo Info.plist strings reused; version / buildNumber unchanged).
- **CSV export:** short “Save to Files” hint with OK *before* the share sheet; brief success after a completed share (cancel = no success). Human-readable localized headers; duration in seconds; local `YYYY-MM-DD HH:mm:ss` dates. The file is written to the app cache, then shared — we do not claim Files → On My iPhone.
- **Records delete:** swipe left to delete, with a confirm dialog and a one-line swipe hint.
- **Notes removed:** no memo UI or writes. Old records that still have a `note` field load without crashing; CSV drops the notes column.

Do not switch to `remote` appVersionSource here (that sync needs credentials). Do not run `eas build:version:*` from this tree.

After each production iOS build, commit the bumped `ios.buildNumber` back to `main` via a PR so the next autoIncrement stays ahead of App Store Connect.

## v1.1.0 審查與測試紀錄

In-repo copy of the merge-time review notes (could not re-post as `tinytoolshedhq`). Original comments: [PR #58](https://github.com/tinytoolshedhq/app/pull/58#issuecomment-6553289604), [PR #59](https://github.com/tinytoolshedhq/app/pull/59#issuecomment-6553289606).

### [PR #58](https://github.com/tinytoolshedhq/app/pull/58) — Full Pack IAP + v1.1

**資安審查（漏洞大師）**
- 01bed84：需修正（相簿權限說明、buildNumber、隱私頁匯出說明）→ df29a93 修正後通過
- bb494f3、9ab395e：通過
- deae640（最終 head，修正 already-owned 恢復流程）：通過。確認沒有未查權限就解鎖的路徑，diff 無金鑰／token。

**使用者測試（胖嘟嘟阿姨，依 test-flows.md）**
- 第 1 輪：通過，提出文案建議（「最多 10 筆」、恢復失敗改「無法恢復」）→ 已在 9ab395e 修正
- 第 2 輪（deae640）：通過，無阻擋項；網頁版 390×844 中英文，自動測試 119 個全過
- 報告檔：`bots/user-tester/test-run-2026-11-01-pr58.md`、`test-run-2026-11-01-pr58-r2.md`（將隨下次備份 PR 進 tinytoolshed-backup）

**合併**：Chun 同意後合併為 ed9be21；gh-pages support/privacy 已重新部署（8aed6f1）並確認上線。

送審前待辦：TestFlight sandbox 實際購買一次、恢復一次。

### [PR #59](https://github.com/tinytoolshedhq/app/pull/59) — restore-again title + fail-closed already-owned

**資安審查（漏洞大師）**
- 9f50b49：通過。確認 already-owned 在各處都會失敗不解鎖（fail-closed），沒有未查權限就解鎖的路徑；diff 只動 6 個 JS 檔，無金鑰／token，app.json／Info.plist 未變。

**使用者測試（胖嘟嘟阿姨，依 test-flows.md）**
- 9f50b49：通過，無阻擋項；網頁版 390×844 中英文，自動測試 121 個全過；既有流程未退步
- 報告檔：`bots/user-tester/test-run-2026-11-01-pr59.md`（將隨下次備份 PR 進 tinytoolshed-backup）

**合併**：93b85cf。此 PR 未改 support/privacy 頁面，不需重新部署。
