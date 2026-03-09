/**
 * Content script for Collibra infra pages.
 * Runs at document_start. Asks background whether this tab has a PR build
 * associated with it. If so, shows a "PR <number>" badge with a Clear button.
 * Asset redirects are handled entirely by DNR rules in the background.
 */
(function () {
  if (window.location.host === "static.collibra.dev") return;

  chrome.runtime.sendMessage({ type: "getPrForTab" }, function (response) {
    if (chrome.runtime.lastError || !response || !response.pr) return;
    var pr = response.pr;
    var color = response.color || "#0969da";
    injectPrBadge(pr, color);
    maintainTitlePrefix(pr);
  });

  function maintainTitlePrefix(pr) {
    var prefix = "[PR-" + pr + "] ";

    function ensurePrefix() {
      if (document.title && document.title.indexOf(prefix) !== 0) {
        document.title = prefix + document.title;
      }
    }

    if (document.title) ensurePrefix();

    new MutationObserver(ensurePrefix).observe(
      document.querySelector("title") || document.head || document.documentElement,
      { childList: true, subtree: true, characterData: true },
    );
  }

  function injectPrBadge(pr, color) {
    function insert() {
      var id = "pr-build-hashes-badge";
      if (document.getElementById(id)) return;
      var wrap = document.createElement("div");
      wrap.id = id;
      wrap.style.cssText =
        "position:fixed;bottom:16px;right:16px;z-index:999999;font-family:system-ui,sans-serif;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border:1px solid #d0d7de;border-radius:6px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.1);";
      var badge = document.createElement("span");
      badge.style.cssText =
        "font-size:13px;font-weight:500;color:#1d2227;border-left:3px solid " + color + ";padding-left:8px;";
      badge.textContent = "PR " + pr;
      wrap.appendChild(badge);
      var clearBtn = document.createElement("button");
      clearBtn.textContent = "Clear";
      clearBtn.style.cssText =
        "padding:4px 10px;font-size:12px;background:#0969da;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500;display:none;";
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        chrome.runtime.sendMessage(
          { type: "clearPrBuild" },
          function () {},
        );
      });
      clearBtn.addEventListener("mouseenter", function () {
        clearBtn.style.background = "#0550ae";
      });
      clearBtn.addEventListener("mouseleave", function () {
        clearBtn.style.background = "#0969da";
      });
      wrap.appendChild(clearBtn);
      wrap.addEventListener("mouseenter", function () {
        clearBtn.style.display = "block";
      });
      wrap.addEventListener("mouseleave", function () {
        clearBtn.style.display = "none";
      });
      document.body.appendChild(wrap);
    }

    if (document.body) {
      insert();
    } else {
      document.addEventListener("DOMContentLoaded", insert);
    }
  }
})();
