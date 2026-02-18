/**
 * Content script for infra-main.collibra.dev.
 * Reads PR number and asset filenames from extension storage (currentPrBuild or prBuilds).
 * Asks the background to redirect script/stylesheet requests to pr-releases/<pr>/ so the
 * page loads PR build assets. No document rewrite = no CSP/nonce issues. Shows a PR badge.
 */
(function () {
  if (
    !/^https:\/\/infra-main\.collibra\.dev\//.test(window.location.origin + "/")
  )
    return;

  const SESSION_KEY = "pr-build-hashes-pr";

  function getPrFromUrlOrSession() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("pr");
    if (fromUrl) return fromUrl;
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
  }

  function setSessionPr(pr) {
    try {
      sessionStorage.setItem(SESSION_KEY, String(pr));
    } catch (e) {}
  }

  function injectPrBadge(pr) {
    const id = "pr-build-hashes-badge";
    if (document.getElementById(id)) return;
    const badge = document.createElement("div");
    badge.id = id;
    badge.setAttribute("data-pr-badge", "1");
    badge.style.cssText =
      "position:fixed;bottom:8px;right:8px;border:2px solid red;padding:4px 8px;font-size:12px;z-index:999999;background:white;color:#1d2227;font-family:system-ui,sans-serif;";
    badge.textContent = "PR " + pr;
    document.body.appendChild(badge);
  }

  function applyBuild(pr, build) {
    if (!build || (!build.runtimeJs && !build.mainJs && !build.mainCss)) {
      return;
    }
    setSessionPr(pr);
    chrome.runtime.sendMessage(
      {
        type: "preparePrRedirects",
        pr: pr,
        runtimeJs: build.runtimeJs,
        mainJs: build.mainJs,
        mainCss: build.mainCss,
      },
      function () {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () {
            injectPrBadge(pr);
          });
        } else {
          injectPrBadge(pr);
        }
      },
    );
  }

  function run() {
    const prFromUrlOrSession = getPrFromUrlOrSession();

    chrome.storage.local.get(["prBuilds", "currentPrBuild"], function (data) {
      var prBuilds = (data && data.prBuilds) || {};
      var currentPrBuild = data.currentPrBuild || null;

      if (prFromUrlOrSession) {
        var build = prBuilds[prFromUrlOrSession];
        if (build) {
          var current = {
            pr: prFromUrlOrSession,
            runtimeJs: build.runtimeJs,
            mainJs: build.mainJs,
            mainCss: build.mainCss,
          };
          chrome.storage.local.set({ currentPrBuild: current });
          applyBuild(prFromUrlOrSession, build);
        }
        return;
      }

      if (currentPrBuild && currentPrBuild.pr) {
        applyBuild(currentPrBuild.pr, currentPrBuild);
      }
    });
  }

  run();
})();
