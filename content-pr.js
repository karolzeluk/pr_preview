/**
 * PR page content script.
 * Fetches the PR build's index.html from static.collibra.dev to verify
 * it exists and extract asset filenames, then shows one button per
 * configured Collibra instance.
 * On click, sends filenames + target infraUrl to background which installs
 * redirect rules and opens the infra page.
 * Hides the UI when user navigates away from the PR (SPA navigation).
 */
(function () {
  if (!/^\/collibra\/frontend\/pull\//.test(window.location.pathname)) return;

  const PR_PAGE_RE = /^\/collibra\/frontend\/pull\/\d+(\/|$)/;

  var DEFAULT_INSTANCES = [
    { label: "infra-main", url: "https://infra-main.collibra.dev", color: "#0969da" },
  ];

  function isOnPrPage() {
    return PR_PAGE_RE.test(window.location.pathname);
  }

  function removePrUi() {
    var el = document.getElementById("pr-build-hashes-ui");
    if (el) el.remove();
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

  function getInstances(callback) {
    chrome.storage.local.get("instances", function (data) {
      var instances = data.instances;
      if (!instances || !instances.length) {
        instances = DEFAULT_INSTANCES;
      }
      callback(instances);
    });
  }

  function injectStyles() {
    if (document.getElementById('pr-preview-styles')) return;
    var style = document.createElement('style');
    style.id = 'pr-preview-styles';
    style.textContent = [
      '@keyframes prPanelIn { from { opacity:0; transform:translateY(-8px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }',
      '@keyframes prBtnShimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }',
      '@keyframes prSubtleGlow { 0%,100% { box-shadow:0 4px 24px rgba(0,0,0,0.25); } 50% { box-shadow:0 4px 32px rgba(0,0,0,0.35); } }',
      '#pr-build-hashes-ui {',
      '  animation: prPanelIn 0.35s cubic-bezier(0.16,1,0.3,1) both, prSubtleGlow 4s ease-in-out infinite;',
      '}',
      '#pr-build-hashes-ui .pr-preview-btn {',
      '  position:relative; overflow:hidden;',
      '  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;',
      '}',
      '#pr-build-hashes-ui .pr-preview-btn:hover {',
      '  transform: translateY(-1px);',
      '  filter: brightness(1.1);',
      '}',
      '#pr-build-hashes-ui .pr-preview-btn:active {',
      '  transform: translateY(0px);',
      '}',
      '#pr-build-hashes-ui .pr-preview-btn::after {',
      '  content:""; position:absolute; top:0; left:0; right:0; bottom:0;',
      '  background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);',
      '  background-size:200% 100%; animation:prBtnShimmer 3s ease-in-out infinite;',
      '  border-radius:inherit; pointer-events:none;',
      '}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function createButton(label, color, onClick) {
    var bg = color || '#0969da';

    var btn = document.createElement('a');
    btn.className = 'pr-preview-btn';
    btn.textContent = 'Open in ' + label;
    btn.style.cssText = [
      'display:block',
      'padding:10px 18px',
      'background:linear-gradient(135deg, ' + bg + ', ' + bg + 'dd)',
      'color:#fff',
      'border-radius:12px',
      'text-decoration:none',
      'font-weight:600',
      'cursor:pointer',
      'font-size:13px',
      'font-family:system-ui,-apple-system,sans-serif',
      'letter-spacing:0.2px',
      'text-align:left',
      'box-shadow:0 2px 8px ' + bg + '44',
    ].join(';');

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!chrome.runtime.id) {
        window.location.reload();
        return;
      }
      onClick();
    });
    return btn;
  }

  function showPrUi(prNumber, filenames) {
    const id = "pr-build-hashes-ui";
    if (document.getElementById(id)) return;

    getInstances(function (instances) {
      // Guard: may have been removed while waiting for storage
      if (document.getElementById(id)) return;

      injectStyles();

      const wrap = document.createElement('div');
      wrap.id = id;
      wrap.style.cssText = [
        'position:fixed',
        'top:60px',
        'right:16px',
        'z-index:9999',
        'padding:14px 16px',
        'background:rgba(30,33,43,0.88)',
        'backdrop-filter:blur(12px)',
        '-webkit-backdrop-filter:blur(12px)',
        'border:1px solid rgba(255,255,255,0.1)',
        'border-radius:16px',
        'font-size:13px',
        'color:#fff',
        'box-shadow:0 4px 24px rgba(0,0,0,0.25)',
        'display:flex',
        'flex-direction:column',
        'gap:8px',
      ].join(';');

      // Header text
      var header = document.createElement('div');
      header.textContent = 'View PR on';
      header.style.cssText = [
        'font-size:12px',
        'font-weight:600',
        'text-transform:uppercase',
        'letter-spacing:0.5px',
        'color:rgba(255,255,255,0.55)',
        'padding:0 2px 2px',
      ].join(';');
      wrap.appendChild(header);

      for (var i = 0; i < instances.length; i++) {
        (function (instance) {
          var btn = createButton(instance.label, instance.color, function () {
            chrome.runtime.sendMessage(
              {
                type: "openPrBuild",
                pr: prNumber,
                infraUrl: instance.url,
                color: instance.color || "#0969da",
                runtimeJs: filenames.runtimeJs,
                mainJs: filenames.mainJs,
                mainCss: filenames.mainCss,
              },
              function () {},
            );
          });
          wrap.appendChild(btn);
        })(instances[i]);
      }

      document.body.appendChild(wrap);
    });
  }

  function run() {
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
