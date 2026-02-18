/**
 * PR page content script.
 * Runs only when the PR has the label "PR Published on S3".
 * Finds "Build and publish" run link and shows a button/link that opens it in a new tab.
 * Hides the UI when user navigates away from the PR (SPA navigation).
 */
(function () {
  if (!/^\/collibra\/frontend\/pull\//.test(window.location.pathname)) return;

  const REQUIRED_LABEL = "PR Published on S3";
  const PR_PAGE_RE = /^\/collibra\/frontend\/pull\/\d+(\/|$)/;

  function isOnPrPage() {
    return PR_PAGE_RE.test(window.location.pathname);
  }

  function removePrUi() {
    var el = document.getElementById("pr-build-hashes-ui");
    if (el) el.remove();
  }

  function hasPrPublishedOnS3Label() {
    var labelEls = document.querySelectorAll('[class*="Label"], [data-name]');
    for (var i = 0; i < labelEls.length; i++) {
      var text = (labelEls[i].textContent || "").trim();
      if (text === REQUIRED_LABEL) return true;
    }
    return false;
  }

  function getRunUrlFromDom() {
    const links = document.querySelectorAll(
      'a[href*="/collibra/frontend/actions/runs/"]',
    );
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      const href = (a.getAttribute("href") || "").trim();
      const text = (a.textContent || "").trim();
      if (
        text.indexOf("Build and Publish") !== -1 ||
        (href.match(/\/actions\/runs\/\d+/) &&
          text.toLowerCase().indexOf("build and publish") !== -1)
      ) {
        if (href.startsWith("http")) return href;
        return (
          "https://github.com" + (href.startsWith("/") ? href : "/" + href)
        );
      }
    }
    return null;
  }

  function getPrNumberFromPathname() {
    const m = window.location.pathname.match(
      /\/collibra\/frontend\/pull\/(\d+)/,
    );
    return m ? m[1] : null;
  }

  const DEFAULT_INFRA_URL = "https://infra-main.collibra.dev";

  function showPrUi(runUrl, hasRequiredLabel, defaultInfraUrl) {
    defaultInfraUrl =
      (defaultInfraUrl && defaultInfraUrl.trim()) || DEFAULT_INFRA_URL;
    var infraBase = defaultInfraUrl.replace(/\/?$/, "");
    const id = "pr-build-hashes-ui";
    if (document.getElementById(id)) return;
    const wrap = document.createElement("div");
    wrap.id = id;
    wrap.style.cssText =
      "position:fixed;top:60px;right:16px;z-index:9999;padding:10px 14px;background:#fff;border:1px solid #d0d7de;border-radius:6px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.1);";
    const linkStyle =
      "display:inline-block;padding:6px 12px;background:#0969da;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;margin-right:8px;margin-bottom:6px;";
    if (runUrl) {
      const link = document.createElement("a");
      link.href = runUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open Build and publish logs";
      link.style.cssText = linkStyle;
      link.addEventListener("mouseenter", function () {
        link.style.background = "#0550ae";
      });
      link.addEventListener("mouseleave", function () {
        link.style.background = "#0969da";
      });
      wrap.appendChild(link);
    }
    const prNumber = getPrNumberFromPathname();
    if (prNumber && hasRequiredLabel) {
      const infraLink = document.createElement("a");
      infraLink.href = infraBase + "/?pr=" + prNumber;
      infraLink.target = "_blank";
      infraLink.rel = "noopener";
      infraLink.textContent = "Open Infra with PR build";
      infraLink.style.cssText = linkStyle;
      infraLink.addEventListener("click", function (e) {
        e.preventDefault();
        var currentRunUrl = getRunUrlFromDom();
        if (currentRunUrl) {
          chrome.storage.local.set(
            { openInfraAfterRun: prNumber },
            function () {
              window.open(currentRunUrl, "_blank", "noopener");
            },
          );
          return;
        }
        chrome.storage.local.get(
          ["prBuilds", "currentPrBuild"],
          function (data) {
            var prBuilds = (data && data.prBuilds) || {};
            var currentPrBuild = (data && data.currentPrBuild) || null;
            var build =
              prBuilds[prNumber] ||
              (currentPrBuild && currentPrBuild.pr === prNumber
                ? currentPrBuild
                : null);
            var msg = { type: "preparePrRedirects", pr: prNumber };
            if (build && (build.runtimeJs || build.mainJs || build.mainCss)) {
              msg.runtimeJs = build.runtimeJs;
              msg.mainJs = build.mainJs;
              msg.mainCss = build.mainCss;
            }
            chrome.runtime.sendMessage(msg, function () {
              window.open(infraLink.href, "_blank", "noopener");
            });
          },
        );
      });
      infraLink.addEventListener("mouseenter", function () {
        infraLink.style.background = "#0550ae";
      });
      infraLink.addEventListener("mouseleave", function () {
        infraLink.style.background = "#0969da";
      });
      wrap.appendChild(infraLink);
    }
    if (!runUrl && !prNumber) {
      wrap.textContent = "Build and publish run not found";
      wrap.style.color = "#57606a";
    }
    document.body.appendChild(wrap);
  }

  function run(retryCount) {
    retryCount = retryCount || 0;
    if (!hasPrPublishedOnS3Label()) {
      if (retryCount < 2) {
        setTimeout(function () {
          run(retryCount + 1);
        }, 2000);
      }
      return;
    }
    var runUrl = getRunUrlFromDom();
    chrome.storage.local.get("defaultInfraUrl", function (data) {
      var defaultInfraUrl =
        (data.defaultInfraUrl && data.defaultInfraUrl.trim()) ||
        DEFAULT_INFRA_URL;
      showPrUi(runUrl, true, defaultInfraUrl);
    });
    if (!runUrl) {
      setTimeout(function () {
        if (document.getElementById("pr-build-hashes-ui")) return;
        if (!hasPrPublishedOnS3Label()) return;
        runUrl = getRunUrlFromDom();
        chrome.storage.local.get("defaultInfraUrl", function (data) {
          var defaultInfraUrl =
            (data.defaultInfraUrl && data.defaultInfraUrl.trim()) ||
            DEFAULT_INFRA_URL;
          showPrUi(runUrl, true, defaultInfraUrl);
        });
      }, 2000);
    }
  }

  var lastPathname = window.location.pathname;

  function onPrUrlChange() {
    console.log("onPrUrlChange");
    if (isOnPrPage()) {
      run();
    } else {
      removePrUi();
    }
  }

  function checkPathnameChange() {
    var current = window.location.pathname;
    if (current !== lastPathname) {
      lastPathname = current;
      onPrUrlChange();
    }
  }

  function setupSpaNavListeners() {
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      lastPathname = window.location.pathname;
      onPrUrlChange();
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      lastPathname = window.location.pathname;
      onPrUrlChange();
    };
    window.addEventListener("popstate", function () {
      lastPathname = window.location.pathname;
      onPrUrlChange();
    });
    setInterval(checkPathnameChange, 400);
  }

  setupSpaNavListeners();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (isOnPrPage()) run();
      else removePrUi();
    });
  } else {
    if (isOnPrPage()) run();
    else removePrUi();
  }
})();
