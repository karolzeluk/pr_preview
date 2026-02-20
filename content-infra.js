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
    injectPrBadge(pr);
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

  function injectPrBadge(pr) {
    function insert() {
      var id = "pr-build-hashes-badge";
      if (document.getElementById(id)) return;
      var wrap = document.createElement("div");
      wrap.id = id;
      wrap.style.cssText =
        "position:fixed;bottom:8px;right:8px;z-index:999999;font-family:system-ui,sans-serif;display:flex;align-items:center;gap:6px;";
      var badge = document.createElement("span");
      badge.style.cssText =
        "border:2px solid red;padding:4px 8px;font-size:12px;background:white;color:#1d2227;";
      badge.textContent = "PR " + pr;
      wrap.appendChild(badge);
      var clearBtn = document.createElement("button");
      clearBtn.textContent = "Clear";
      clearBtn.style.cssText =
        "padding:4px 8px;font-size:12px;background:#cf2222;color:white;border:none;border-radius:4px;cursor:pointer;display:none;";
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        chrome.runtime.sendMessage(
          { type: "clearPrBuild" },
          function () {},
        );
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
