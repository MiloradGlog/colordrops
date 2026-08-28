# ColorFall — Expo shell

The game itself lives at the repo root (TypeScript + Canvas, built with
Vite). This directory is the thin native wrapper: a WebView rendering the
self-contained game bundle, with expo-haptics wired to the game's bridge
(catch = light impact, lock snaps = selection ticks, win = success).

## Build & run

```sh
# 1. from the REPO ROOT: build the game and generate expo/game-html.ts
npm run build:expo

# 2. in this directory
npm install            # or: npx expo install --fix  (aligns native versions)
npx expo start         # dev on device via Expo Go / dev client

# 3. store builds — your usual EAS flow
npx eas build -p ios --profile production
npx eas build -p android --profile production
npx eas submit ...
```

## Before submitting

- Change `com.CHANGE_ME.colorfall` (both platforms) in `app.json` to your
  reverse-DNS id.
- Drop real art into `assets/`: `icon.png` (1024×1024), `splash.png`,
  `adaptive-icon.png` — until then create the folder with placeholders or
  remove those keys from `app.json` to use Expo defaults.
- Re-run `npm run build:expo` after ANY game change — the wrapper embeds a
  snapshot of the bundle.

## Notes

- Fonts: the embedded page uses the system mono stack (no network fetch in
  the app). If you want IBM Plex Mono pixel-exact on device, we can inline
  the woff2 as base64 later.
- iOS WKWebView has no canvas filters — the liquid uses its non-goo
  fallback there (still liquid-shaped, less gooey). Android WebView gets
  the full goo.
- localStorage persists via `domStorageEnabled`; if you ever see saves
  vanish on iOS, we'll bridge saves to AsyncStorage.
