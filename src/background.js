/**
 * Background script (Chrome service worker / Firefox persistent background).
 * Manages per-tab PR associations and redirect rules.
 *
 * Chrome: uses chrome.storage.session + declarativeNetRequest session rules.
 * Firefox: uses in-memory state + webRequest blocking listener.
 */
/* global IS_FIREFOX */
(function () {
  var STORAGE_KEY = "prTabs";

  // ---------------------------------------------------------------------------
  // Firefox in-memory tab state (safe because Firefox background is persistent)
  // ---------------------------------------------------------------------------
  var _memoryTabs = {};

  function getActiveTabs(callback) {
    if (IS_FIREFOX) {
      callback(_memoryTabs);
      return;
    }
    chrome.storage.session.get(STORAGE_KEY, function (data) {
      callback((data && data[STORAGE_KEY]) || {});
    });
  }

  function setActiveTabs(tabs, callback) {
    if (IS_FIREFOX) {
      _memoryTabs = tabs;
      if (callback) callback();
      return;
    }
    var obj = {};
    obj[STORAGE_KEY] = tabs;
    chrome.storage.session.set(obj, callback || function () {});
  }

  // ---------------------------------------------------------------------------
  // Chrome-only: declarativeNetRequest helpers
  // ---------------------------------------------------------------------------
  function getSessionRuleIds(callback) {
    chrome.declarativeNetRequest.getSessionRules(function (rules) {
      callback(rules.map(function (r) { return r.id; }));
    });
  }

  function removeAllSessionRules(callback) {
    getSessionRuleIds(function (ids) {
      if (ids.length === 0) {
        (callback || function () {})();
        return;
      }
      chrome.declarativeNetRequest.updateSessionRules(
        { removeRuleIds: ids },
        callback || function () {},
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Redirect rule management
  // ---------------------------------------------------------------------------
  function rebuildAllRules(callback) {
    // Firefox: webRequest listener reads _memoryTabs live — nothing to rebuild.
    if (IS_FIREFOX) {
      if (callback) callback();
      return;
    }

    // Chrome: rebuild declarativeNetRequest session rules.
    getActiveTabs(function (tabs) {
      var allRules = [];
      var ruleId = 1;
      var tabIdKeys = Object.keys(tabs);
      for (var i = 0; i < tabIdKeys.length; i++) {
        var tid = parseInt(tabIdKeys[i], 10);
        var entry = tabs[tabIdKeys[i]];
        if (!entry || !entry.pr) continue;
        var base =
          "https://static.collibra.dev/pr-releases/" + entry.pr + "/";
        var tabIds = [tid];
        if (entry.runtimeJs) {
          allRules.push({
            id: ruleId++,
            priority: 2,
            action: {
              type: "redirect",
              redirect: { url: base + entry.runtimeJs },
            },
            condition: {
              regexFilter:
                "^https://static\\.collibra\\.dev/releases/[^/]+/runtime\\.\\w+\\.js$",
              resourceTypes: ["script"],
              tabIds: tabIds,
            },
          });
        }
        if (entry.mainJs) {
          allRules.push({
            id: ruleId++,
            priority: 2,
            action: {
              type: "redirect",
              redirect: { url: base + entry.mainJs },
            },
            condition: {
              regexFilter:
                "^https://static\\.collibra\\.dev/releases/[^/]+/main\\.\\w+\\.js$",
              resourceTypes: ["script"],
              tabIds: tabIds,
            },
          });
        }
        if (entry.mainCss) {
          allRules.push({
            id: ruleId++,
            priority: 2,
            action: {
              type: "redirect",
              redirect: { url: base + entry.mainCss },
            },
            condition: {
              regexFilter:
                "^https://static\\.collibra\\.dev/releases/[^/]+/main\\.\\w+\\.css$",
              resourceTypes: ["stylesheet"],
              tabIds: tabIds,
            },
          });
        }
        allRules.push({
          id: ruleId++,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              regexSubstitution: base + "\\1",
            },
          },
          condition: {
            regexFilter:
              "^https://static\\.collibra\\.dev/releases/[^/]+/(.*)$",
            resourceTypes: ["script", "stylesheet"],
            tabIds: tabIds,
          },
        });
      }
      getSessionRuleIds(function (existingIds) {
        chrome.declarativeNetRequest.updateSessionRules(
          { removeRuleIds: existingIds, addRules: allRules },
          callback || function () {},
        );
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Firefox-only: webRequest redirect listener
  // ---------------------------------------------------------------------------
  if (IS_FIREFOX) {
    var RELEASE_RE = /^https:\/\/static\.collibra\.dev\/releases\/[^/]+\/(.+)$/;
    var RUNTIME_RE = /^https:\/\/static\.collibra\.dev\/releases\/[^/]+\/runtime\.\w+\.js$/;
    var MAIN_JS_RE = /^https:\/\/static\.collibra\.dev\/releases\/[^/]+\/main\.\w+\.js$/;
    var MAIN_CSS_RE = /^https:\/\/static\.collibra\.dev\/releases\/[^/]+\/main\.\w+\.css$/;

    browser.webRequest.onBeforeRequest.addListener(
      function (details) {
        var tabId = details.tabId;
        if (tabId < 0) return {};
        var entry = _memoryTabs[tabId];
        if (!entry || !entry.pr) return {};

        var url = details.url;
        var base = "https://static.collibra.dev/pr-releases/" + entry.pr + "/";

        // High-priority exact-filename redirects
        if (entry.runtimeJs && RUNTIME_RE.test(url)) {
          return { redirectUrl: base + entry.runtimeJs };
        }
        if (entry.mainJs && MAIN_JS_RE.test(url)) {
          return { redirectUrl: base + entry.mainJs };
        }
        if (entry.mainCss && MAIN_CSS_RE.test(url)) {
          return { redirectUrl: base + entry.mainCss };
        }

        // Low-priority catch-all for other release assets
        var m = url.match(RELEASE_RE);
        if (m) {
          return { redirectUrl: base + m[1] };
        }

        return {};
      },
      { urls: ["https://static.collibra.dev/releases/*"] },
      ["blocking"],
    );
  }

  // ---------------------------------------------------------------------------
  // Fetch PR build index.html (runs in background to avoid page CSP)
  // ---------------------------------------------------------------------------
  function parseFilenamesFromHtml(html) {
    var runtimeJs = null;
    var mainJs = null;
    var mainCss = null;

    var scriptRe = /<script[^>]+src=["']([^"']+)["']/g;
    var m;
    while ((m = scriptRe.exec(html)) !== null) {
      var filename = m[1].split("/").pop();
      if (/^runtime\.\w+\.js$/.test(filename)) runtimeJs = filename;
      else if (/^main\.\w+\.js$/.test(filename)) mainJs = filename;
    }

    var cssRe = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']|<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g;
    while ((m = cssRe.exec(html)) !== null) {
      var href = m[1] || m[2];
      var cssFilename = href.split("/").pop();
      if (/^main\.\w+\.css$/.test(cssFilename)) mainCss = cssFilename;
    }

    return { runtimeJs: runtimeJs, mainJs: mainJs, mainCss: mainCss };
  }

  // ---------------------------------------------------------------------------
  // Message handling (shared)
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === "fetchPrBuild") {
      var prNum = msg.pr;
      if (!prNum) {
        sendResponse({ filenames: null });
        return true;
      }
      var url = "https://static.collibra.dev/pr-releases/" + prNum + "/index.html";
      fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(function (html) {
          var filenames = parseFilenamesFromHtml(html);
          if (filenames.runtimeJs || filenames.mainJs || filenames.mainCss) {
            sendResponse({ filenames: filenames });
          } else {
            sendResponse({ filenames: null });
          }
        })
        .catch(function () {
          sendResponse({ filenames: null });
        });
      return true;
    }

    if (msg.type === "openPrBuild") {
      var pr = msg.pr;
      if (!pr || (!msg.runtimeJs && !msg.mainJs && !msg.mainCss)) {
        sendResponse({ ok: false });
        return true;
      }
      var infraUrl = (msg.infraUrl && msg.infraUrl.trim()) || "https://infra-main.collibra.dev";
      infraUrl = infraUrl.replace(/\/?$/, "");
      chrome.tabs.create({ url: "about:blank" }, function (tab) {
        if (tab && tab.id) {
          var tabId = tab.id;
          getActiveTabs(function (tabs) {
            tabs[tabId] = {
              pr: pr,
              title: msg.title || '',
              color: msg.color || "#0969da",
              runtimeJs: msg.runtimeJs,
              mainJs: msg.mainJs,
              mainCss: msg.mainCss,
            };
            setActiveTabs(tabs, function () {
              rebuildAllRules(function () {
                chrome.tabs.update(tabId, { url: infraUrl + "/" }, function () {
                  sendResponse({ ok: true });
                });
              });
            });
          });
        } else {
          sendResponse({ ok: true });
        }
      });
      return true;
    }

    if (msg.type === "getPrForTab") {
      var tabId = sender.tab && sender.tab.id;
      if (!tabId) {
        sendResponse({ pr: null });
        return false;
      }
      getActiveTabs(function (tabs) {
        var entry = tabs[tabId];
        if (entry && entry.pr) {
          sendResponse({ pr: entry.pr, title: entry.title || '', color: entry.color || null });
        } else {
          sendResponse({ pr: null });
        }
      });
      return true;
    }

    if (msg.type === "clearPrBuild") {
      var tabId = sender.tab && sender.tab.id;
      getActiveTabs(function (tabs) {
        if (tabId) {
          delete tabs[tabId];
          setActiveTabs(tabs);
        }
        rebuildAllRules(function () {
          if (tabId) {
            chrome.tabs.reload(tabId, { bypassCache: true }, function () {
              sendResponse({ ok: true });
            });
          } else {
            sendResponse({ ok: true });
          }
        });
      });
      return true;
    }

    return false;
  });

  // ---------------------------------------------------------------------------
  // Tab cleanup
  // ---------------------------------------------------------------------------
  chrome.tabs.onRemoved.addListener(function (tabId) {
    getActiveTabs(function (tabs) {
      if (tabs[tabId]) {
        delete tabs[tabId];
        setActiveTabs(tabs);
        rebuildAllRules();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  chrome.runtime.onInstalled.addListener(function () {
    if (IS_FIREFOX) {
      _memoryTabs = {};
    } else {
      removeAllSessionRules();
      setActiveTabs({});
    }
  });
})();
