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
    var styles = document.getElementById("pr-preview-styles");
    if (styles) styles.remove();
  }

  function getPrTitle() {
    var el = document.querySelector('.js-issue-title');
    if (el) return el.textContent.trim();
    var m = document.title.match(/^(.+?)(?:\s+by .+?)?\s+·\s+Pull Request/);
    return m ? m[1].trim() : '';
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
    var isFirefox = typeof browser !== 'undefined' && !!browser.runtime;
    if (isFirefox) {
      // Firefox content script fetches are subject to page CSP, so delegate to background
      chrome.runtime.sendMessage(
        { type: "fetchPrBuild", pr: prNumber },
        function (response) {
          if (chrome.runtime.lastError || !response || !response.filenames) {
            callback(null);
          } else {
            callback(response.filenames);
          }
        },
      );
      return;
    }
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
      '@keyframes prBtnShimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }',
      '#pr-build-hashes-ui .pr-preview-btn {',
      '  position:relative; overflow:hidden;',
      '  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;',
      '}',
      '#pr-build-hashes-ui .pr-preview-btn:hover {',
      '  transform: translateY(-1px);',
      '  filter: brightness(1.12);',
      '}',
      '#pr-build-hashes-ui .pr-preview-btn:active {',
      '  transform: translateY(0px);',
      '}',
      '#pr-build-hashes-ui .pr-preview-btn::after {',
      '  content:""; position:absolute; top:0; left:0; right:0; bottom:0;',
      '  background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);',
      '  background-size:200% 100%; animation:prBtnShimmer 3s ease-in-out infinite;',
      '  border-radius:inherit; pointer-events:none;',
      '}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function createButton(label, color, onClick) {
    var bg = color || '#0969da';

    var btn = document.createElement('button');
    btn.className = 'pr-preview-btn';
    btn.textContent = 'Open in ' + label;
    btn.style.cssText = [
      'display:inline-block',
      'padding:5px 12px',
      'background:linear-gradient(135deg, ' + bg + ', ' + bg + 'dd)',
      'color:#fff',
      'border:none',
      'border-radius:6px',
      'font-weight:600',
      'cursor:pointer',
      'font-size:12px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif',
      'letter-spacing:0.2px',
      'line-height:20px',
      'white-space:nowrap',
      'box-shadow:0 1px 3px ' + bg + '33',
    ].join(';');

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!chrome.runtime.id) {
        window.location.reload();
        return;
      }
      onClick();
    });
    return btn;
  }

  function findTabNavAnchor() {
    var nav = document.querySelector('[class*="PageHeader-Navigation"]');
    if (nav) return nav;

    var tabnavs = document.querySelectorAll('.tabnav, .UnderlineNav');
    for (var i = 0; i < tabnavs.length; i++) {
      if (tabnavs[i].textContent.indexOf('Conversation') !== -1) {
        return tabnavs[i];
      }
    }
    return null;
  }

  function showPrUi(prNumber, filenames) {
    const id = "pr-build-hashes-ui";
    if (document.getElementById(id)) return;

    getInstances(function (instances) {
      // Guard: may have been removed while waiting for storage
      if (document.getElementById(id)) return;

      injectStyles();

      var anchor = findTabNavAnchor();
      if (!anchor) {
        waitForTabNav(function () {
          showPrUi(prNumber, filenames);
        });
        return;
      }

      const wrap = document.createElement('div');
      wrap.id = id;
      wrap.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:flex-end',
        'gap:8px',
        'padding:8px 0',
      ].join(';');

      var label = document.createElement('span');
      label.textContent = 'View PR on:';
      label.style.cssText = [
        'font-size:12px',
        'font-weight:600',
        'color:var(--fgColor-muted, #656d76)',
        'margin-right:4px',
      ].join(';');
      wrap.appendChild(label);

      for (var i = 0; i < instances.length; i++) {
        (function (instance) {
          var btn = createButton(instance.label, instance.color, function () {
            chrome.runtime.sendMessage(
              {
                type: "openPrBuild",
                pr: prNumber,
                title: getPrTitle(),
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

      anchor.insertBefore(wrap, anchor.firstChild);
    });
  }

  function waitForTabNav(callback) {
    var called = false;
    var observer = new MutationObserver(function () {
      if (called) return;
      if (findTabNavAnchor()) {
        called = true;
        observer.disconnect();
        callback();
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(function () {
      if (!called) {
        observer.disconnect();
      }
    }, 15000);
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
