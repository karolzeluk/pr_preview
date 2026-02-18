/**
 * Content script for GitHub Actions run page (collibra/frontend/actions/runs/*).
 * Scans visible log DOM for "Entrypoint main" line and logs runtime/main JS and main CSS hashes.
 */
(function () {
  if (
    !/^\/collibra\/frontend\/actions\/runs\/\d+/.test(window.location.pathname)
  ) {
    return;
  }

  const parser =
    window.PR_BUILD_PARSER && window.PR_BUILD_PARSER.parseEntrypointLine;
  if (!parser) return;

  var hasLogged = false;

  /** Get PR number from run page DOM (e.g. "Pull request #18337" or link to pull/18337). */
  function getPrNumberFromRunPage() {
    const pullLinkRe = /collibra\/frontend\/pull\/(\d+)/;
    const links = document.querySelectorAll('a[href*="collibra/frontend/pull"]');
    for (let i = 0; i < links.length; i++) {
      const href = links[i].getAttribute("href") || "";
      const m = pullLinkRe.exec(href);
      if (m) return m[1];
    }
    const bodyText = document.body.innerText || document.body.textContent || "";
    const hashMatch = bodyText.match(/#(\d+)/);
    if (hashMatch) return hashMatch[1];
    const pullMatch = bodyText.match(/pull\/(\d+)/);
    if (pullMatch) return pullMatch[1];
    return null;
  }

  function savePrBuildToStorage(prNumber, runtimeJs, mainJs, mainCss) {
    if (!prNumber || (!runtimeJs && !mainJs && !mainCss)) return;
    chrome.storage.local.get("prBuilds", function (data) {
      const prBuilds = data.prBuilds || {};
      prBuilds[prNumber] = {
        runtimeJs: runtimeJs || prBuilds[prNumber]?.runtimeJs,
        mainJs: mainJs || prBuilds[prNumber]?.mainJs,
        mainCss: mainCss || prBuilds[prNumber]?.mainCss,
      };
      const currentPrBuild = {
        pr: prNumber,
        runtimeJs: prBuilds[prNumber].runtimeJs,
        mainJs: prBuilds[prNumber].mainJs,
        mainCss: prBuilds[prNumber].mainCss,
      };
      chrome.storage.local.set({ prBuilds, currentPrBuild }, function () {
        console.log("[PR Build Hashes] Saved build for PR", prNumber, prBuilds[prNumber]);
        chrome.storage.local.get("openInfraAfterRun", function (openData) {
          if (String(openData.openInfraAfterRun) === String(prNumber)) {
            chrome.storage.local.remove("openInfraAfterRun");
            var build = prBuilds[prNumber];
            chrome.runtime.sendMessage({
              type: "openInfraWithPr",
              pr: prNumber,
              runtimeJs: build.runtimeJs,
              mainJs: build.mainJs,
              mainCss: build.mainCss,
            });
          }
        });
      });
    });
  }

  document.addEventListener("pr-build-hashes-result", function (e) {
    if (hasLogged) return;
    var d = e.detail;
    if (d && (d.runtimeJs || d.mainJs || d.mainCss)) {
      hasLogged = true;
      console.log(
        "[PR Build Hashes] Runtime, main JS and main CSS from Build and publish logs:",
      );
      if (d.runtimeJs) console.log(d.runtimeJs);
      if (d.mainJs) console.log(d.mainJs);
      if (d.mainCss) console.log(d.mainCss);
      showBanner("PR build hashes logged to console (open DevTools).");
      const prNumber = getPrNumberFromRunPage();
      if (prNumber) savePrBuildToStorage(prNumber, d.runtimeJs, d.mainJs, d.mainCss);
    }
  });

  function showBanner(msg) {
    var id = "pr-build-hashes-banner";
    if (document.getElementById(id)) return;
    var banner = document.createElement("div");
    banner.id = id;
    banner.style.cssText =
      "position:fixed;top:12px;right:12px;padding:8px 12px;background:#0969da;color:#fff;font-size:12px;z-index:99999;border-radius:6px;";
    banner.textContent = msg;
    document.body.appendChild(banner);
    setTimeout(function () {
      banner.remove();
    }, 6000);
  }

  function getFullLogText() {
    const selectors = [
      "[data-hpc]", // GitHub log container
      ".log-line",
      '[class*="log"]',
      '[class*="Line"]',
      "pre",
      ".js-log-line-content",
      "[data-line-number]",
    ];
    let text = "";
    const walk = function (root) {
      const nodes = root.querySelectorAll("*");
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (
          el.childNodes.length === 1 &&
          el.firstChild.nodeType === Node.TEXT_NODE
        ) {
          const t = (el.textContent || "").trim();
          if (t && t.indexOf("Entrypoint") !== -1) text += t + "\n";
        }
      }
    };
    walk(document.body);
    if (text) return text;
    text = document.body.innerText || document.body.textContent || "";
    return text;
  }

  function tryExpandBuildStep() {
    var summaries = document.querySelectorAll(
      'summary.js-check-step-summary, summary.CheckStep-header, summary[class*="CheckStep-header"]',
    );
    for (var i = 0; i < summaries.length; i++) {
      var s = summaries[i];
      var label = (s.textContent || "").toLowerCase();
      if (label.indexOf("build") !== -1 && label.indexOf("publish") === -1) {
        var details = s.closest("details");
        if (details && !details.hasAttribute("open")) {
          s.click();
          return true;
        }
      }
    }
    var buttons = document.querySelectorAll(
      'button, [role="button"], .js-details-target',
    );
    for (var j = 0; j < buttons.length; j++) {
      var b = buttons[j];
      var btnLabel = (b.textContent || "").toLowerCase();
      if (
        (btnLabel.indexOf("build") !== -1 &&
          btnLabel.indexOf("publish") === -1) ||
        btnLabel.indexOf("webpack") !== -1
      ) {
        if (b.getAttribute("aria-expanded") === "false") {
          b.click();
          return true;
        }
      }
    }
    return false;
  }

  function scanAndLog() {
    if (hasLogged) return true;
    const fullText = getFullLogText();
    const result = parser(fullText);
    if (result.runtimeJs || result.mainJs || result.mainCss) {
      hasLogged = true;
      console.log(
        "[PR Build Hashes] Runtime, main JS and main CSS from Build and publish logs:",
      );
      if (result.runtimeJs) console.log(result.runtimeJs);
      if (result.mainJs) console.log(result.mainJs);
      if (result.mainCss) console.log(result.mainCss);
      showBanner("PR build hashes logged to console (open DevTools).");
      const prNumber = getPrNumberFromRunPage();
      if (prNumber) savePrBuildToStorage(prNumber, result.runtimeJs, result.mainJs, result.mainCss);
      return true;
    }
    return false;
  }

  function run() {
    tryExpandBuildStep();
    if (scanAndLog()) return;
    setTimeout(function () {
      if (hasLogged) return;
      tryExpandBuildStep();
      if (!scanAndLog()) {
        console.log(
          "[PR Build Hashes] Expand the build step if the Entrypoint line is not visible.",
        );
      }
    }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  // Re-scan when new content appears (e.g. log loaded after navigation)
  const observer = new MutationObserver(function () {
    if (hasLogged) return;
    scanAndLog();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
