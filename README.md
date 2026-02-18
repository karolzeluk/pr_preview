# PR Preview – Chrome extension

**Preview your frontend PR on any Collibra instance in seconds.** No local builds, no staging deploy—just open the PR on GitHub, click once, and see your changes running on infra-main (or your own instance). Review UI and behaviour in a real environment before merge, and get faster feedback without leaving the browser.

---

Chrome extension for [collibra/frontend](https://github.com/collibra/frontend) that lets you **preview a PR’s build** on a Collibra instance. It reads the **Build and publish** GitHub Action logs to get `runtime.<hash>.js`, `main.<hash>.js`, and `main.<hash>.css`, then either redirects or rewrites requests so the Collibra app loads those assets from the PR’s S3 release (`static.collibra.dev/pr-releases/<pr>/`).

## Install

1. Clone or download this repository
2. In Chrome: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder.
3. No build step required.

## Options

- **Default URL to open (Collibra instance)** – base URL used for “Open Collibra with PR build” (default: `https://infra-main.collibra.dev`). Set in the extension’s options page (right‑click extension icon → Options, or open `options.html` from the extension folder).

- **PR build timeout** – how long the PR build stays active on a Collibra instance before it expires (5 min, 15 min, 1 hour, or forever). Default is **15 minutes**. After the timeout, opening (or refreshing) Collibra shows the original page instead of the PR build. You can still click **Clear** at any time to reset immediately.

## What it does

## Flow (summary)

1. **PR page** → ensure PR has “PR Published on S3” → click **Open Collibra with PR build**.
2. **Run page** → extension parses logs (fetch intercept or DOM), saves hashes for the PR, optionally auto-opens Collibra with hashes.
3. **Collibra tab** → either URL already has hashes (rewrite) or only `pr` (redirect rules + storage). Use **Clear** to stop using the PR build and reload clean.

### On a PR page (`github.com/collibra/frontend/pull/*`)

- **Only when the PR has the label “PR Published on S3”**, a small fixed panel appears (top-right) with:
  - **Open Collibra with PR build** – opens your configured Collibra URL (see Options) with `?pr=<number>`, so the Collibra app loads that PR’s JS/CSS instead of the default release.
- If the “Build and publish” run link isn’t in the DOM yet (e.g. checks still loading), the extension retries after a short delay.
- If you click **Open Collibra with PR build** and the run link is available, it opens the run page first and, once hashes are parsed, automatically opens Collibra with the correct build filenames. Otherwise it uses a previously stored build for that PR or applies redirects from storage.
- The panel is removed when you navigate away from the PR (including SPA navigation).

### On the Actions run page (`github.com/collibra/frontend/actions/runs/*`)

- A **main-world script** (`inject-fetch-intercept.js`) wraps `fetch` and intercepts step-log responses. When the response body contains the webpack “Entrypoint main” output, it extracts `runtime.<hash>.js`, `main.<hash>.js`, and `main.<hash>.css` and dispatches the result to the content script.
- The **content script** (`content-run.js`) plus **parser** (`parser.js`) also scan the visible log DOM for the “Entrypoint main” line and extract the same filenames (fallback when logs are in the page).
- The extension then:
  - Logs the three filenames to that tab’s console and shows a short banner.
  - Saves the build for the run’s PR number in `chrome.storage.local` (`prBuilds`, `currentPrBuild`).
  - If you had clicked “Open Collibra with PR build” from the PR page, it opens a new tab to Collibra with `?pr=...&runtimeJs=...&mainJs=...&mainCss=...` and tells the background to install redirect rules for that PR.

### On Collibra (`infra-main.collibra.dev`, `*.collibra-ops.com`)

- **When the URL has `pr` and at least one of `runtimeJs`, `mainJs`, `mainCss`:**  
  A main-world script is injected that rewrites `script`/`link` URLs so requests go directly to `https://static.collibra.dev/pr-releases/<pr>/<filename>`. The page then loads the PR build without relying on redirects (CORS works).
- **When the URL has only `?pr=<number>` (or PR comes from session):**  
  The extension looks up the build in storage and sends **preparePrRedirects** to the background. The background adds `declarativeNetRequest` rules that redirect:
  - `static.collibra.dev/releases/*/runtime.<hash>.js` → `static.collibra.dev/pr-releases/<pr>/runtime.<hash>.js`
  - same for `main.<hash>.js` and `main.<hash>.css`
    so the existing Collibra page loads the PR build. A **“PR &lt;number&gt;”** badge appears (bottom-right); hovering shows a **Clear** button that removes redirects, clears session/current build, and reloads the page with a clean URL.

- **Timeout:** On every Collibra page load, the extension checks whether the configured **PR build timeout** (see Options) has elapsed since the build was first applied. If expired, the PR build is cleared automatically and the page reloads with the original Collibra assets. The user can also click **Clear** to reset at any time.

### Background (service worker)

- **Redirect rules:** Installed when you open Collibra with a PR build (either via **openInfraWithPr** or **preparePrRedirects**). Rules are removed when the Collibra tab that triggered them is closed.
- **Messages:**
  - `preparePrRedirects` – add redirect rules for a PR (filenames from message or from `prBuilds` in storage).
  - `openInfraWithPr` – add redirect rules and open a new tab to Collibra with `?pr=...&runtimeJs=...&mainJs=...&mainCss=...`.
  - `clearPrRedirectsAndReload` – remove redirect rules and reload the sender tab with the given clean URL (used by Collibra “Clear”).
