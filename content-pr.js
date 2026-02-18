/**
 * PR page content script.
 * Finds "Build and publish" run link and shows a button/link that opens it in a new tab.
 */
(function () {
  if (!/^\/collibra\/frontend\/pull\/\d+/.test(window.location.pathname))
    return;

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

  function showPrUi(runUrl) {
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
    if (prNumber) {
      const infraLink = document.createElement("a");
      infraLink.href = "https://infra-main.collibra.dev/?pr=" + prNumber;
      infraLink.target = "_blank";
      infraLink.rel = "noopener";
      infraLink.textContent = "Open Infra with PR build";
      infraLink.style.cssText = linkStyle;
      infraLink.addEventListener("click", function (e) {
        e.preventDefault();
        var currentRunUrl = getRunUrlFromDom();
        if (currentRunUrl) {
          chrome.storage.local.set({ openInfraAfterRun: prNumber }, function () {
            window.open(currentRunUrl, "_blank", "noopener");
          });
          return;
        }
        chrome.storage.local.get(["prBuilds", "currentPrBuild"], function (data) {
          var prBuilds = (data && data.prBuilds) || {};
          var currentPrBuild = (data && data.currentPrBuild) || null;
          var build = prBuilds[prNumber] || (currentPrBuild && currentPrBuild.pr === prNumber ? currentPrBuild : null);
          var msg = { type: "preparePrRedirects", pr: prNumber };
          if (build && (build.runtimeJs || build.mainJs || build.mainCss)) {
            msg.runtimeJs = build.runtimeJs;
            msg.mainJs = build.mainJs;
            msg.mainCss = build.mainCss;
          }
          chrome.runtime.sendMessage(msg, function () {
            window.open(infraLink.href, "_blank", "noopener");
          });
        });
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
    setTimeout(function () {
      wrap.remove();
    }, 15000);
  }

  function run() {
    var runUrl = getRunUrlFromDom();
    showPrUi(runUrl);
    if (!runUrl) {
      setTimeout(function () {
        if (document.getElementById("pr-build-hashes-ui")) return;
        runUrl = getRunUrlFromDom();
        showPrUi(runUrl);
      }, 2000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
