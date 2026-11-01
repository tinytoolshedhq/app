# App4 iOS build numbers

Last uploaded TestFlight build: **3** (version `1.1.0`).

`eas.json` uses `cli.appVersionSource: local` and production `autoIncrement: true`. EAS bumps `ios.buildNumber` in `app.json` before a production build, so `main` must keep the last used value (`"3"`). The next production build becomes **4** and will not collide with the uploaded build 3.

Do not switch to `remote` appVersionSource here (that sync needs credentials). Do not run `eas build:version:*` from this tree.

After each production iOS build, commit the bumped `ios.buildNumber` back to `main` via a PR so the next autoIncrement stays ahead of App Store Connect.
