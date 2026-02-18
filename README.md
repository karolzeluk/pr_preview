# PR Build Hashes – Chrome extension

Chrome extension for [collibra/frontend](https://github.com/collibra/frontend) that reads the **Build and publish** GitHub Action logs and prints the **runtime** and **main** JS filenames (with hashes) to the console.

## What it does

- On a **PR page** (`github.com/collibra/frontend/pull/*`): a button/link appears that opens the “Build and publish” run in a new tab. If the run isn’t found yet (e.g. checks still loading), it retries once after a short delay.
- In the **new tab** (Actions run page): the extension scans the visible log DOM for the webpack “Entrypoint main” line and logs `runtime.<hash>.js` and `main.<hash>.js` to that tab’s console.

**Flow:** PR page → click the button → new tab opens run page → open DevTools console on that tab to see the hashes.

## Install

1. In Chrome: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder.
2. No build step required.

## Development

- **PR page:** edit `content-pr.js` (run URL detection and button/link UI).
- **Run page:** edit `content-run.js` and/or `parser.js` (log scanning and hash parsing).

## Files

- `manifest.json` – extension manifest (Manifest V3).
- `content-pr.js` – PR page: finds “Build and publish” run link and shows a button that opens it in a new tab.
- `parser.js` – shared parser for the “Entrypoint main” line (used on the run page).
- `content-run.js` – run page: scans log DOM and logs runtime/main JS to the console.
- `background.js` – minimal service worker (reserved for future use).
