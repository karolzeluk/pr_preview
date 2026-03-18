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
    var title = response.title || '';
    injectPrBadge(pr, color, title);
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

  function injectPrBadge(pr, color, prTitle) {
    function insert() {
      var id = "pr-build-hashes-badge";
      if (document.getElementById(id)) return;

      var styleEl = document.createElement("style");
      styleEl.textContent = [
        '@keyframes prBadgeGradient {',
        '  0% { background-position: 0% 50%; }',
        '  50% { background-position: 100% 50%; }',
        '  100% { background-position: 0% 50%; }',
        '}',
        '@keyframes prBadgeIn {',
        '  from { opacity:0; transform:translateX(-50%) translateY(-12px) scale(0.95); }',
        '  to   { opacity:1; transform:translateX(-50%) translateY(0)     scale(1);    }',
        '}',
        '#pr-build-hashes-badge {',
        '  animation: prBadgeIn 0.35s cubic-bezier(0.16,1,0.3,1) both, prBadgeGradient 4s ease infinite;',
        '}',
        '#pr-build-hashes-badge .pr-badge-clear {',
        '  opacity:0; transition:opacity 0.15s ease;',
        '}',
        '#pr-build-hashes-badge:hover .pr-badge-clear {',
        '  opacity:1;',
        '}',
      ].join('\n');
      (document.head || document.documentElement).appendChild(styleEl);

      var c1 = color;
      var c2 = color + "bb";
      var c3 = color + "88";

      var wrap = document.createElement("div");
      wrap.id = id;
      wrap.style.cssText = [
        "position:fixed",
        "top:12px",
        "left:50%",
        "transform:translateX(-50%)",
        "z-index:999999",
        "display:flex",
        "align-items:center",
        "gap:10px",
        "padding:10px 24px",
        "min-width:220px",
        "justify-content:center",
        "background:linear-gradient(270deg, " + c1 + ", " + c2 + ", " + c3 + ", " + c2 + ", " + c1 + ")",
        "background-size:300% 300%",
        "border-radius:10px",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "font-size:14px",
        "font-weight:700",
        "color:#fff",
        "letter-spacing:0.4px",
        "box-shadow:0 4px 20px " + color + "66,0 1px 4px rgba(0,0,0,0.2)",
        "cursor:default",
        "user-select:none",
      ].join(";");

      var label = document.createElement("a");
      label.href = "https://github.com/collibra/frontend/pull/" + pr;
      label.target = "_blank";
      label.rel = "noopener noreferrer";
      label.textContent = "PR #" + pr;
      label.style.cssText = [
        "color:#fff",
        "text-decoration:none",
        "border-bottom:1px solid rgba(255,255,255,0.5)",
        "position:relative",
      ].join(";");
      label.addEventListener("mouseenter", function () {
        label.style.borderBottomColor = "#fff";
        if (prTitle && !document.getElementById("pr-badge-tooltip")) {
          var tip = document.createElement("div");
          tip.id = "pr-badge-tooltip";
          tip.textContent = prTitle;
          tip.style.cssText = [
            "position:absolute",
            "top:calc(100% + 10px)",
            "left:50%",
            "transform:translateX(-50%)",
            "background:rgba(20,22,30,0.97)",
            "color:#fff",
            "font-size:12px",
            "font-weight:500",
            "padding:6px 12px",
            "border-radius:6px",
            "white-space:nowrap",
            "box-shadow:0 4px 16px rgba(0,0,0,0.35)",
            "border:1px solid rgba(255,255,255,0.1)",
            "pointer-events:none",
            "z-index:1000000",
            "opacity:0",
            "transition:opacity 0.15s ease",
          ].join(";");
          label.appendChild(tip);
          requestAnimationFrame(function () { tip.style.opacity = "1"; });
        }
      });
      label.addEventListener("mouseleave", function () {
        label.style.borderBottomColor = "rgba(255,255,255,0.5)";
        var tip = document.getElementById("pr-badge-tooltip");
        if (tip) tip.remove();
      });
      wrap.appendChild(label);

      var sep = document.createElement("span");
      sep.textContent = "·";
      sep.style.cssText = "opacity:0.6;font-weight:400;";
      wrap.appendChild(sep);

      var clearBtn = document.createElement("button");
      clearBtn.textContent = "Clear";
      clearBtn.className = "pr-badge-clear";
      clearBtn.style.cssText = [
        "padding:3px 10px",
        "font-size:12px",
        "font-weight:600",
        "background:rgba(255,255,255,0.25)",
        "color:#fff",
        "border:1px solid rgba(255,255,255,0.4)",
        "border-radius:5px",
        "cursor:pointer",
      ].join(";");
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: "clearPrBuild" }, function () {});
      });
      clearBtn.addEventListener("mouseenter", function () {
        clearBtn.style.background = "rgba(255,255,255,0.4)";
      });
      clearBtn.addEventListener("mouseleave", function () {
        clearBtn.style.background = "rgba(255,255,255,0.25)";
      });
      wrap.appendChild(clearBtn);

      document.body.appendChild(wrap);
    }

    if (document.body) {
      insert();
    } else {
      document.addEventListener("DOMContentLoaded", insert);
    }
  }
})();
