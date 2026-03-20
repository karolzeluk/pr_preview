/**
 * PR page content script.
 * Fetches the PR build's index.html from static.collibra.dev to verify
 * it exists and extract asset filenames, then shows one button per
 * configured Collibra instance.
 * Before showing buttons, checks the GitHub "Build and Publish" CI status
 * to avoid linking to stale builds when a new commit has been pushed.
 * On click, sends filenames + target infraUrl to background which installs
 * redirect rules and opens the infra page.
 * Hides the UI when user navigates away from the PR (SPA navigation).
 */
(function () {
  if (!/^\/collibra\/frontend\/pull\//.test(window.location.pathname)) return;

  const PR_PAGE_RE = /^\/collibra\/frontend\/pull\/\d+(\/|$)/;
  var CHECK_NAME = "Build and Publish";
  var POLL_INTERVAL = 15000;
  var POLL_S3_INTERVAL = 10000;
  var MAX_POLL_DURATION = 30 * 60 * 1000;

  var DEFAULT_INSTANCES = [
    { label: "infra-main", url: "https://infra-main.collibra.dev", color: "#0969da" },
  ];

  var activePollId = null;
  var pollStartTime = null;

  function cancelWatchers() {
    if (activePollId) {
      clearInterval(activePollId);
      activePollId = null;
    }
    pollStartTime = null;
  }

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

  function parseCheckStatusFromHtml(html, checkName) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var all = doc.querySelectorAll("*");
    var bestStatus = null;
    var bestLength = Infinity;

    // Find the smallest DOM element that contains both the check name
    // and a recognizable status keyword. The individual check row should
    // be smaller than any container that mixes statuses from other checks.
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var text = el.textContent || "";
      if (text.indexOf(checkName) === -1) continue;
      if (text.length > 2000) continue; // skip huge containers

      var lower = text.toLowerCase();
      var status = null;
      if (/successful|succeeded/.test(lower)) status = "success";
      else if (/\bfailed\b|\bfailure\b|\berrored\b|timed out|cancelled|canceled/.test(lower)) status = "failure";
      else if (/\bin progress\b|\bstarted\b|this check has started/.test(lower)) status = "in_progress";
      else if (/\bqueued\b|\bwaiting\b|\bexpected\b/.test(lower)) status = "pending";

      if (status && text.length < bestLength) {
        bestStatus = status;
        bestLength = text.length;
      }
    }

    return bestStatus || "not_found";
  }

  function fetchCheckStatus(prNumber, callback) {
    var url = "/collibra/frontend/pull/" + prNumber + "/checks";
    fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (html) {
        var status = parseCheckStatusFromHtml(html, CHECK_NAME);
        callback(status);
      })
      .catch(function () {
        callback("not_found");
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
      '@keyframes prSpinnerRotate { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }',
      '@keyframes prPulse { 0%,100% { opacity:0.7; } 50% { opacity:1; } }',
      '.pr-preview-spinner {',
      '  display:inline-block; width:14px; height:14px;',
      '  border:2px solid rgba(255,255,255,0.25); border-top-color:#fff;',
      '  border-radius:50%; animation:prSpinnerRotate 0.8s linear infinite;',
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

  function createStatusPanel(contentElements) {
    var id = "pr-build-hashes-ui";
    if (document.getElementById(id)) return;

    injectStyles();

    var wrap = document.createElement("div");
    wrap.id = id;
    wrap.style.cssText = [
      "position:fixed",
      "top:60px",
      "right:16px",
      "z-index:9999",
      "padding:14px 16px",
      "background:rgba(30,33,43,0.88)",
      "backdrop-filter:blur(12px)",
      "-webkit-backdrop-filter:blur(12px)",
      "border:1px solid rgba(255,255,255,0.1)",
      "border-radius:16px",
      "font-size:13px",
      "color:#fff",
      "box-shadow:0 4px 24px rgba(0,0,0,0.25)",
      "display:flex",
      "flex-direction:column",
      "gap:8px",
    ].join(";");

    for (var i = 0; i < contentElements.length; i++) {
      wrap.appendChild(contentElements[i]);
    }
    document.body.appendChild(wrap);
  }

  function showBuildingUi() {
    var id = "pr-build-hashes-ui";
    if (document.getElementById(id)) return;

    var header = document.createElement("div");
    header.textContent = "PR Build";
    header.style.cssText =
      "font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.55);padding:0 2px 2px;";

    var row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:6px 0;animation:prPulse 2s ease-in-out infinite;";

    var spinner = document.createElement("span");
    spinner.className = "pr-preview-spinner";

    var text = document.createElement("span");
    text.textContent = "Building\u2026";
    text.style.cssText =
      "font-size:13px;font-weight:500;color:rgba(255,255,255,0.8);";

    row.appendChild(spinner);
    row.appendChild(text);

    createStatusPanel([header, row]);
  }

  function showFailedUi(prNumber) {
    var id = "pr-build-hashes-ui";
    if (document.getElementById(id)) return;

    var header = document.createElement("div");
    header.textContent = "PR Build";
    header.style.cssText =
      "font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.55);padding:0 2px 2px;";

    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 0;";

    var icon = document.createElement("span");
    icon.textContent = "\u2716";
    icon.style.cssText = "color:#f85149;font-size:14px;";

    var text = document.createElement("span");
    text.textContent = "Build failed";
    text.style.cssText = "font-size:13px;font-weight:500;color:#f85149;";

    row.appendChild(icon);
    row.appendChild(text);

    var link = document.createElement("a");
    link.href = "/collibra/frontend/pull/" + prNumber + "/checks";
    link.textContent = "View checks";
    link.style.cssText =
      "font-size:12px;color:rgba(255,255,255,0.5);text-decoration:underline;padding:0 2px;";
    link.target = "_self";

    createStatusPanel([header, row, link]);
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

  function startCheckPolling(prNumber) {
    pollStartTime = Date.now();
    activePollId = setInterval(function () {
      if (!chrome.runtime.id) { cancelWatchers(); return; }
      if (Date.now() - pollStartTime > MAX_POLL_DURATION) { cancelWatchers(); removePrUi(); return; }

      fetchCheckStatus(prNumber, function (status) {
        if (status === "success") {
          cancelWatchers();
          removePrUi();
          fetchPrBuild(prNumber, function (filenames) {
            if (filenames) {
              showPrUi(prNumber, filenames);
            } else {
              // S3 upload may lag behind the check; poll S3 briefly
              startS3Polling(prNumber);
            }
          });
        } else if (status === "failure") {
          cancelWatchers();
          removePrUi();
          showFailedUi(prNumber);
        }
        // pending / in_progress: keep polling
      });
    }, POLL_INTERVAL);
  }

  function startS3Polling(prNumber) {
    var s3Attempts = 0;
    var maxS3Attempts = 12; // ~2 minutes at 10s intervals
    pollStartTime = Date.now();
    removePrUi();
    showBuildingUi();
    activePollId = setInterval(function () {
      if (!chrome.runtime.id) { cancelWatchers(); return; }
      s3Attempts++;
      if (s3Attempts >= maxS3Attempts) { cancelWatchers(); removePrUi(); return; }

      fetchPrBuild(prNumber, function (filenames) {
        if (filenames) {
          cancelWatchers();
          removePrUi();
          showPrUi(prNumber, filenames);
        }
      });
    }, POLL_S3_INTERVAL);
  }

  function run() {
    var prNumber = getPrNumberFromPathname();
    if (!prNumber) return;

    var checkResult = null;
    var buildResult = undefined; // use undefined to distinguish "not yet fetched" from null
    var resolved = false;

    function tryResolve() {
      if (resolved) return;
      if (checkResult === null || buildResult === undefined) return;
      resolved = true;

      if (checkResult === "not_found") {
        // Fallback: can't determine check status, use current behavior
        if (buildResult) showPrUi(prNumber, buildResult);
        return;
      }

      if (checkResult === "success") {
        if (buildResult) {
          showPrUi(prNumber, buildResult);
        } else {
          // Check passed but S3 not ready yet
          showBuildingUi();
          startS3Polling(prNumber);
        }
        return;
      }

      if (checkResult === "pending" || checkResult === "in_progress") {
        showBuildingUi();
        startCheckPolling(prNumber);
        return;
      }

      if (checkResult === "failure") {
        showFailedUi(prNumber);
        return;
      }

      // Unknown status: fallback
      if (buildResult) showPrUi(prNumber, buildResult);
    }

    fetchCheckStatus(prNumber, function (status) {
      checkResult = status;
      tryResolve();
    });

    fetchPrBuild(prNumber, function (filenames) {
      buildResult = filenames;
      tryResolve();
    });
  }

  var lastPathname = window.location.pathname;

  function onPrUrlChange() {
    cancelWatchers();
    removePrUi();
    if (isOnPrPage()) {
      run();
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
