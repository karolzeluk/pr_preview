/**
 * Runs in the page (main) world. Wraps fetch to capture step-logs responses
 * and extract runtime/main JS and main CSS filenames via regex; dispatches result to content script.
 */
(function () {
  /** Match Azure Actions step-log URLs: .../logs/steps/step-logs-<uuid>.txt */
  const STEP_LOGS_PATTERN = /\/logs\/[0-9]+/;
  const RUNTIME_JS_RE = /runtime\.([a-f0-9]+)\.js/;
  const MAIN_JS_RE = /main\.([a-f0-9]+)\.js/;
  const MAIN_CSS_RE = /main\.([a-f0-9]+)\.css/;

  function parseHashes(text) {
    if (!text || typeof text !== "string")
      return { runtimeJs: null, mainJs: null, mainCss: null };
    var runtimeJs = null;
    var mainJs = null;
    var mainCss = null;
    var m = RUNTIME_JS_RE.exec(text);
    if (m) runtimeJs = "runtime." + m[1] + ".js";
    m = MAIN_JS_RE.exec(text);
    if (m) mainJs = "main." + m[1] + ".js";
    m = MAIN_CSS_RE.exec(text);
    if (m) mainCss = "main." + m[1] + ".css";
    return { runtimeJs: runtimeJs, mainJs: mainJs, mainCss: mainCss };
  }

  var originalFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    return originalFetch.apply(this, arguments).then(function (response) {
      if (url && STEP_LOGS_PATTERN.test(url)) {
        response
          .clone()
          .text()
          .then(function (body) {
            var result = parseHashes(body);
            if (result.runtimeJs || result.mainJs || result.mainCss) {
              document.dispatchEvent(
                new CustomEvent("pr-build-hashes-result", {
                  detail: {
                    runtimeJs: result.runtimeJs,
                    mainJs: result.mainJs,
                    mainCss: result.mainCss,
                  },
                }),
              );
            }
          })
          .catch(function () {});
      }
      return response;
    });
  };
})();
