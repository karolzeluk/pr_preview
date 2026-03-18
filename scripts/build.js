#!/usr/bin/env node
/**
 * Build script for PR Preview extension.
 * Produces dist/chrome/ and dist/firefox/ with merged manifests.
 *
 * Usage:
 *   node scripts/build.js           # build both
 *   node scripts/build.js chrome    # build Chrome only
 *   node scripts/build.js firefox   # build Firefox only
 */
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var SRC = path.join(ROOT, "src");
var MANIFESTS = path.join(ROOT, "manifests");
var DIST = path.join(ROOT, "dist");

var target = process.argv[2]; // "chrome", "firefox", or undefined (both)
var targets = target ? [target] : ["chrome", "firefox"];

function clean(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  var entries = fs.readdirSync(src);
  for (var i = 0; i < entries.length; i++) {
    var srcPath = path.join(src, entries[i]);
    var destPath = path.join(dest, entries[i]);
    if (fs.statSync(srcPath).isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function mergeManifests(base, override) {
  var merged = JSON.parse(JSON.stringify(base));
  var keys = Object.keys(override);
  for (var i = 0; i < keys.length; i++) {
    merged[keys[i]] = override[keys[i]];
  }
  return merged;
}

function build(browserName) {
  var outDir = path.join(DIST, browserName);
  clean(outDir);

  // Copy all source files
  copyDir(SRC, outDir);

  // Merge manifests
  var base = JSON.parse(fs.readFileSync(path.join(MANIFESTS, "base.json"), "utf8"));
  var override = JSON.parse(fs.readFileSync(path.join(MANIFESTS, browserName + ".json"), "utf8"));
  var manifest = mergeManifests(base, override);
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Chrome: service workers can only be a single file, so prepend browser-compat.js into background.js
  if (browserName === "chrome") {
    var compatPath = path.join(outDir, "browser-compat.js");
    var bgPath = path.join(outDir, "background.js");
    var compatContent = fs.readFileSync(compatPath, "utf8");
    var bgContent = fs.readFileSync(bgPath, "utf8");
    fs.writeFileSync(bgPath, compatContent + bgContent);
    // Remove standalone browser-compat.js (not needed for Chrome)
    fs.unlinkSync(compatPath);
  }

  console.log("Built " + browserName + " -> " + outDir);
}

for (var i = 0; i < targets.length; i++) {
  build(targets[i]);
}
