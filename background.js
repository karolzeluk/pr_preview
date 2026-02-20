/**
 * Background service worker.
 * Manages per-tab PR associations (persisted in chrome.storage.session so
 * they survive service worker restarts and tab refreshes) and exact-target
 * redirect rules scoped to specific tabs via tabIds condition.
 *
 * Uses session-scoped rules (updateSessionRules) because tabIds is only
 * supported on session rules, not dynamic rules.
 */
(function () {
  var STORAGE_KEY = "prTabs";

  function getActiveTabs(callback) {
    chrome.storage.session.get(STORAGE_KEY, function (data) {
      callback((data && data[STORAGE_KEY]) || {});
    });
  }

  function setActiveTabs(tabs, callback) {
    var obj = {};
    obj[STORAGE_KEY] = tabs;
    chrome.storage.session.set(obj, callback || function () {});
  }

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

  function rebuildAllRules(callback) {
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
            priority: 1,
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
            priority: 1,
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
            priority: 1,
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
      }
      getSessionRuleIds(function (existingIds) {
        chrome.declarativeNetRequest.updateSessionRules(
          { removeRuleIds: existingIds, addRules: allRules },
          callback || function () {},
        );
      });
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === "openPrBuild") {
      var pr = msg.pr;
      if (!pr || (!msg.runtimeJs && !msg.mainJs && !msg.mainCss)) {
        sendResponse({ ok: false });
        return true;
      }
      chrome.storage.local.get("defaultInfraUrl", function (data) {
        var infraUrl =
          (data.defaultInfraUrl && data.defaultInfraUrl.trim()) ||
          "https://infra-main.collibra.dev";
        infraUrl = infraUrl.replace(/\/?$/, "");
        chrome.tabs.create({ url: "about:blank" }, function (tab) {
          if (tab && tab.id) {
            var tabId = tab.id;
            getActiveTabs(function (tabs) {
              tabs[tabId] = {
                pr: pr,
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
          sendResponse({ pr: entry.pr });
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

  chrome.tabs.onRemoved.addListener(function (tabId) {
    getActiveTabs(function (tabs) {
      if (tabs[tabId]) {
        delete tabs[tabId];
        setActiveTabs(tabs);
        rebuildAllRules();
      }
    });
  });

  chrome.runtime.onInstalled.addListener(function () {
    removeAllSessionRules();
    setActiveTabs({});
  });
})();
