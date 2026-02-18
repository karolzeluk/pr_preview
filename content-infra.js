/**
 * Content script for infra-main.collibra.dev.
 * When build filenames are in the URL (from openInfraWithPr), injects a main-world script
 * that rewrites script/link URLs to static.collibra.com so requests are direct (no redirect)
 * and CORS works. Otherwise reads from storage and uses redirect; shows a PR badge.
 */
(function () {
  if (
    !/^https:\/\/infra-main\.collibra\.dev\//.test(window.location.origin + "/")
  )
    return;

  var params = new URLSearchParams(window.location.search);
  var pr = params.get("pr");
  var runtimeJs = params.get("runtimeJs");
  var mainJs = params.get("mainJs");
  var mainCss = params.get("mainCss");
  if (pr && (runtimeJs || mainJs || mainCss)) {
    var base = "https://static.collibra.dev/pr-releases/" + pr + "/";
    var script = document.createElement("script");
    script.textContent =
      "(function(){var base=" +
      JSON.stringify(base) +
      ";var runtimeJs=" +
      JSON.stringify(runtimeJs || "") +
      ";var mainJs=" +
      JSON.stringify(mainJs || "") +
      ";var mainCss=" +
      JSON.stringify(mainCss || "") +
      ";var re=/^https:\\/\\/static\\.collibra\\.dev\\/releases\\/[^/]+\\/(runtime\\.\\w+\\.js|main\\.\\w+\\.js|main\\.\\w+\\.css)$/;function rewrite(url){var m=url.match(re);if(!m)return url;if(m[1].indexOf('runtime.')===0)return runtimeJs?base+runtimeJs:url;if(m[1].indexOf('main.')===0){var ext=m[1].slice(-3);return ext==='.js'&&mainJs?base+mainJs:ext==='.css'&&mainCss?base+mainCss:url;}return url;}var origSetAttr=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,val){if((this.tagName==='SCRIPT'&&name==='src')||(this.tagName==='LINK'&&name==='href'))val=rewrite(val);return origSetAttr.call(this,name,val);};var d=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');if(d&&d.set){var orig=d.set;Object.defineProperty(HTMLScriptElement.prototype,'src',{set:function(v){return orig.call(this,rewrite(v));},get:d.get,configurable:true,enumerable:true});}var d2=Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype,'href');if(d2&&d2.set){var orig2=d2.set;Object.defineProperty(HTMLLinkElement.prototype,'href',{set:function(v){return orig2.call(this,rewrite(v));},get:d2.get,configurable:true,enumerable:true});}})();";
    (document.head || document.documentElement).prepend(script);
    script.remove();
  }

  const SESSION_KEY = "pr-build-hashes-pr";

  function getPrFromUrlOrSession() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("pr");
    if (fromUrl) return fromUrl;
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
  }

  function setSessionPr(pr) {
    try {
      sessionStorage.setItem(SESSION_KEY, String(pr));
    } catch (e) {}
  }

  function injectPrBadge(pr) {
    const id = "pr-build-hashes-badge";
    if (document.getElementById(id)) return;
    const badge = document.createElement("div");
    badge.id = id;
    badge.setAttribute("data-pr-badge", "1");
    badge.style.cssText =
      "position:fixed;bottom:8px;right:8px;border:2px solid red;padding:4px 8px;font-size:12px;z-index:999999;background:white;color:#1d2227;font-family:system-ui,sans-serif;";
    badge.textContent = "PR " + pr;
    document.body.appendChild(badge);
  }

  function applyBuild(pr, build) {
    if (!build || (!build.runtimeJs && !build.mainJs && !build.mainCss)) {
      return;
    }
    setSessionPr(pr);
    chrome.runtime.sendMessage(
      {
        type: "preparePrRedirects",
        pr: pr,
        runtimeJs: build.runtimeJs,
        mainJs: build.mainJs,
        mainCss: build.mainCss,
      },
      function () {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () {
            injectPrBadge(pr);
          });
        } else {
          injectPrBadge(pr);
        }
      },
    );
  }

  function run() {
    const prFromUrlOrSession = getPrFromUrlOrSession();

    chrome.storage.local.get(["prBuilds", "currentPrBuild"], function (data) {
      var prBuilds = (data && data.prBuilds) || {};
      var currentPrBuild = data.currentPrBuild || null;

      if (prFromUrlOrSession) {
        var build = prBuilds[prFromUrlOrSession];
        if (build) {
          var current = {
            pr: prFromUrlOrSession,
            runtimeJs: build.runtimeJs,
            mainJs: build.mainJs,
            mainCss: build.mainCss,
          };
          chrome.storage.local.set({ currentPrBuild: current });
          applyBuild(prFromUrlOrSession, build);
        }
        return;
      }

      if (currentPrBuild && currentPrBuild.pr) {
        applyBuild(currentPrBuild.pr, currentPrBuild);
      }
    });
  }

  run();
})();
