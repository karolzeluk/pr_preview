/**
 * Shared parser for webpack "Entrypoint main" log line.
 * Extracts runtime.<hash>.js, main.<hash>.js and main.<hash>.css filenames.
 * Exposed on window for content scripts that load after this file.
 */
(function () {
  const RUNTIME_JS_RE = /runtime\.([a-f0-9]+)\.js/g;
  const MAIN_JS_RE = /main\.([a-f0-9]+)\.js/g;
  const MAIN_CSS_RE = /main\.([a-f0-9]+)\.css/g;

  /**
   * Find a line containing "Entrypoint main" in the given text and extract JS/CSS filenames.
   * @param {string} text - Full log text (may contain many lines)
   * @returns {{ runtimeJs: string | null, mainJs: string | null, mainCss: string | null }} Extracted filenames or null if not found
   */
  function parseEntrypointLine(text) {
    if (!text || typeof text !== "string") {
      return { runtimeJs: null, mainJs: null, mainCss: null };
    }
    const lines = text.split(/\r?\n/);
    const entrypointLine = lines.find(function (line) {
      return line.indexOf("Entrypoint main") !== -1;
    });
    if (!entrypointLine) {
      return { runtimeJs: null, mainJs: null, mainCss: null };
    }
    let runtimeJs = null;
    let mainJs = null;
    let mainCss = null;
    let m;
    RUNTIME_JS_RE.lastIndex = 0;
    m = RUNTIME_JS_RE.exec(entrypointLine);
    if (m) runtimeJs = "runtime." + m[1] + ".js";
    MAIN_JS_RE.lastIndex = 0;
    m = MAIN_JS_RE.exec(entrypointLine);
    if (m) mainJs = "main." + m[1] + ".js";
    MAIN_CSS_RE.lastIndex = 0;
    m = MAIN_CSS_RE.exec(entrypointLine);
    if (m) mainCss = "main." + m[1] + ".css";
    return { runtimeJs, mainJs, mainCss };
  }

  window.PR_BUILD_PARSER = { parseEntrypointLine };
})();
