/**
 * Prepares PR build redirect rules and cleans them up when the tab is closed.
 * Avoids document.write and CSP by redirecting script/stylesheet requests instead.
 */
(function () {
  const RULE_IDS = { RUNTIME_JS: 1001, MAIN_JS: 1002, MAIN_CSS: 1003 };
  const RULE_IDS_LIST = [
    RULE_IDS.RUNTIME_JS,
    RULE_IDS.MAIN_JS,
    RULE_IDS.MAIN_CSS,
  ];
  var activeTabId = null;

  function makeRedirectRules(pr, runtimeJs, mainJs, mainCss) {
    const base = "https://static.collibra.com/pr-releases/" + pr + "/";
    var rules = [];
    if (runtimeJs) {
      rules.push({
        id: RULE_IDS.RUNTIME_JS,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: base + runtimeJs },
        },
        condition: {
          regexFilter:
            "^https://static\\.collibra\\.dev/releases/[^/]+/runtime\\.[a-f0-9]+\\.js$",
          resourceTypes: ["script"],
        },
      });
    }
    if (mainJs) {
      rules.push({
        id: RULE_IDS.MAIN_JS,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: base + mainJs },
        },
        condition: {
          regexFilter:
            "^https://static\\.collibra\\.dev/releases/[^/]+/main\\.[a-f0-9]+\\.js$",
          resourceTypes: ["script"],
        },
      });
    }
    if (mainCss) {
      rules.push({
        id: RULE_IDS.MAIN_CSS,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: base + mainCss },
        },
        condition: {
          regexFilter:
            "^https://static\\.collibra\\.dev/releases/[^/]+/main\\.[a-f0-9]+\\.css$",
          resourceTypes: ["stylesheet"],
        },
      });
    }
    return rules;
  }

  function removeRedirectRules() {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: RULE_IDS_LIST,
    });
    activeTabId = null;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === "openInfraWithPr") {
      var pr = msg.pr;
      if (!pr || (!msg.runtimeJs && !msg.mainJs && !msg.mainCss)) {
        sendResponse({ ok: false });
        return true;
      }
      var rules = makeRedirectRules(pr, msg.runtimeJs, msg.mainJs, msg.mainCss);
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: RULE_IDS_LIST,
        addRules: rules,
      });
      chrome.tabs.create(
        { url: "https://infra-main.collibra.dev/?pr=" + pr },
        function (tab) {
          if (tab && tab.id) activeTabId = tab.id;
        },
      );
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type !== "preparePrRedirects") return;
    var pr = msg.pr;
    if (!pr) {
      sendResponse({ ok: false });
      return;
    }
    var runtimeJs = msg.runtimeJs;
    var mainJs = msg.mainJs;
    var mainCss = msg.mainCss;
    if (runtimeJs || mainJs || mainCss) {
      var rules = makeRedirectRules(pr, runtimeJs, mainJs, mainCss);
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: RULE_IDS_LIST,
        addRules: rules,
      });
      activeTabId = sender.tab ? sender.tab.id : null;
      sendResponse({ ok: true });
      return true;
    }
    chrome.storage.local.get("prBuilds", function (data) {
      var prBuilds = (data && data.prBuilds) || {};
      var build = prBuilds[pr];
      if (!build || (!build.runtimeJs && !build.mainJs && !build.mainCss)) {
        sendResponse({ ok: false });
        return;
      }
      var rules = makeRedirectRules(
        pr,
        build.runtimeJs,
        build.mainJs,
        build.mainCss,
      );
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: RULE_IDS_LIST,
        addRules: rules,
      });
      activeTabId = sender.tab ? sender.tab.id : null;
      sendResponse({ ok: true });
    });
    return true;
  });

  chrome.tabs.onRemoved.addListener(function (tabId) {
    if (tabId === activeTabId) removeRedirectRules();
  });

  chrome.runtime.onInstalled.addListener(function () {});
})();
