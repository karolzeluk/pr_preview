# PR Preview – Chrome extension

**Preview your frontend PR on any Collibra instance in seconds.** No local builds, no staging deploy—just open the PR on GitHub, click once, and see your changes running on infra-main (or your own instance). Review UI and behaviour in a real environment before merge, and get faster feedback without leaving the browser.

---

Chrome extension for [collibra/frontend](https://github.com/collibra/frontend) that lets you **preview a PR's build** on a Collibra instance. When you click **Open Collibra with PR build**, the extension opens your configured Collibra instance and replaces its document with the PR build's `index.html` from `static.collibra.dev/pr-releases/<pr>/`. Asset requests (JS/CSS) are automatically redirected to the PR build via pattern-based redirect rules. No GitHub Action log parsing or hash extraction needed.

## Install

1. Clone or download this repository.
2. In Chrome: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder.
3. No build step required.

## Options

- **Default URL to open (Collibra instance)** – base URL used for "Open Collibra with PR build" (default: `https://infra-main.collibra.dev`). Set in the extension's options page (right-click extension icon → Options).

## How it works

### Flow

1. **PR page** → ensure PR has the label **"PR Published on S3"** → click **Open Collibra with PR build**.
2. The extension tells the background to install redirect rules and open the Collibra instance in a new tab.
3. When the infra page loads, the content script fetches `https://static.collibra.dev/pr-releases/<pr>/index.html` and replaces the document in-place. The address bar and origin stay on the infra host (so API calls, cookies, and auth keep working).
4. Script/stylesheet requests from the replaced document are redirected by `declarativeNetRequest` rules to `static.collibra.dev/pr-releases/<pr>/` so the PR build's assets load.

### On a PR page (`github.com/collibra/frontend/pull/*`)

- **Only when the PR has the label "PR Published on S3"**, a small fixed panel appears (top-right) with the **Open Collibra with PR build** button.
- Clicking the button sends a message to the background service worker, which installs redirect rules and opens the Collibra tab.
- The panel is removed when you navigate away from the PR (including SPA navigation).

### On Collibra (`infra-main.collibra.dev`, `*.collibra-ops.com`)

- The content script runs at `document_start` and asks the background whether this tab has a PR build. If yes, it fetches the PR build's `index.html` and replaces the document.
- A **"PR <number>"** badge appears (bottom-right); hovering shows a **Clear** button that removes the PR build, clears redirect rules, and reloads the page with the original Collibra app.

### Background (service worker)

- Maintains an in-memory `tabId → prNumber` map.
- **Messages:**
  - `openPrBuild` – install pattern-based redirect rules for the PR and open the Collibra instance in a new tab.
  - `getPrForTab` – returns the PR number associated with the sender tab (or null).
  - `clearPrBuild` – remove redirect rules, remove tab from the map, and reload the tab.
- Redirect rules use `regexFilter` + `regexSubstitution` to redirect `runtime.*.js`, `main.*.js`, and `main.*.css` from the infra host to `static.collibra.dev/pr-releases/<pr>/`.
- Rules are cleaned up when the PR tab is closed.
