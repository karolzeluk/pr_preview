/**
 * PR page content script.
 * Runs only when the PR has the label "PR Published on S3".
 * Fetches the PR build's index.html to verify it exists and extract
 * asset filenames, then shows "Open Collibra with PR build" button.
 * On click, sends filenames to background which installs redirect rules
 * and opens the infra page.
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

  function getPrNumberFromPathname() {
    const m = window.location.pathname.match(
      /\/collibra\/frontend\/pull\/(\d+)/,
    );
    return m ? m[1] : null;
  }

  function parseFilenamesFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var runtimeJs = null;
    var mainJs = null;
    var mainCss = null;

    doc.querySelectorAll("script[src]").forEach(function (el) {
      var src = el.getAttribute("src") || "";
      var filename = src.split("/").pop();
      if (/^runtime\.\w+\.js$/.test(filename)) runtimeJs = filename;
      else if (/^main\.\w+\.js$/.test(filename)) mainJs = filename;
    });

    doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(function (el) {
      var href = el.getAttribute("href") || "";
      var filename = href.split("/").pop();
      if (/^main\.\w+\.css$/.test(filename)) mainCss = filename;
    });

    return { runtimeJs: runtimeJs, mainJs: mainJs, mainCss: mainCss };
  }

  function fetchPrBuild(prNumber, callback) {
    var url =
      "https://static.collibra.dev/pr-releases/" + prNumber + "/index.html";
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (html) {
        var filenames = parseFilenamesFromHtml(html);
        if (filenames.runtimeJs || filenames.mainJs || filenames.mainCss) {
          callback(filenames);
        } else {
          callback(null);
        }
      })
      .catch(function () {
        callback(null);
      });
  }

  function showPrUi(prNumber, filenames) {
    const id = "pr-build-hashes-ui";
    if (document.getElementById(id)) return;

    const wrap = document.createElement("div");
    wrap.id = id;
    wrap.style.cssText =
      "position:fixed;top:60px;right:16px;z-index:9999;padding:10px 14px;background:#fff;border:1px solid #d0d7de;border-radius:6px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.1);";

    const linkStyle =
      "display:inline-block;padding:6px 12px;background:#0969da;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;cursor:pointer;";

    const btn = document.createElement("a");
    btn.textContent = "Open Collibra with PR build";
    btn.style.cssText = linkStyle;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!chrome.runtime.id) {
        window.location.reload();
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "openPrBuild",
          pr: prNumber,
          runtimeJs: filenames.runtimeJs,
          mainJs: filenames.mainJs,
          mainCss: filenames.mainCss,
        },
        function () {},
      );
    });
    btn.addEventListener("mouseenter", function () {
      btn.style.background = "#0550ae";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.background = "#0969da";
    });

    wrap.appendChild(btn);
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

    var prNumber = getPrNumberFromPathname();
    if (!prNumber) return;

    fetchPrBuild(prNumber, function (filenames) {
      if (filenames) {
        showPrUi(prNumber, filenames);
      }
    });
  }

  var lastPathname = window.location.pathname;

  function onPrUrlChange() {
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
