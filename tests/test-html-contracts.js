"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cases = [
  {
    html: "遊戲Demo.html",
    js: "src/game/boss-duel-demo.js",
    redirectPath: "/%E9%81%8A%E6%88%B2Demo.html",
    expectedVersion: "frontend-v88"
  },
  {
    html: "機率工具.html",
    js: "src/probability/boss-duel-action-tree-lab.js",
    redirectPath: "/%E6%A9%9F%E7%8E%87%E5%B7%A5%E5%85%B7.html",
    expectedVersion: "action-tree-v32"
  }
];

const report = [];
for (const item of cases) {
  const html = fs.readFileSync(path.join(root, item.html), "utf8");
  const js = fs.readFileSync(path.join(root, item.js), "utf8");
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const duplicateIds = [...ids].filter((id) => (html.match(new RegExp(`id="${id}"`, "g")) || []).length > 1);
  const idRefs = [
    ...[...js.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]),
    ...[...js.matchAll(/\bels\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1])
  ];
  const missingIds = [...new Set(idRefs.filter((id) => !ids.has(id)))];
  const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((url) => !/^(?:https?:|data:|#)/.test(url))
    .map((url) => decodeURIComponent(url.split(/[?#]/)[0]));
  const missingResources = resources.filter((resource) => !fs.existsSync(path.join(root, resource)));
  const cssAssets = resources.filter((resource) => /\.css$/i.test(resource)).flatMap((resource) => {
    const cssPath = path.join(root, resource);
    if (!fs.existsSync(cssPath)) return [];
    return [...fs.readFileSync(cssPath, "utf8").matchAll(/url\(["']?([^"')]+)["']?\)/g)]
      .map((match) => match[1].trim())
      .filter((url) => !/^(?:https?:|data:|#)/.test(url))
      .map((url) => ({ owner: resource, target: path.resolve(path.dirname(cssPath), decodeURIComponent(url.split(/[?#]/)[0])) }));
  });
  const missingCssAssets = cssAssets.filter(({ target }) => !fs.existsSync(target));
  const versionedCode = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))\?([^"#]+)"/g)].length;
  const localCode = resources.filter((resource) => /\.(?:js|css)$/i.test(resource)).length;
  const redirectScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

  assert.ok(redirectScript, `${item.html} is missing its file-protocol redirect`);
  const executeRedirect = (protocol, search) => {
    let replacedWith = "";
    const location = {
      protocol,
      search,
      replace(url) {
        replacedWith = String(url);
      }
    };
    new Function("location", "URLSearchParams", redirectScript)(location, URLSearchParams);
    return replacedWith;
  };
  const fileRedirect = executeRedirect("file:", "?embed=1&seed=contract");
  const redirectUrl = new URL(fileRedirect);

  assert.deepEqual(duplicateIds, [], `${item.html} contains duplicate ids`);
  assert.deepEqual(missingIds, [], `${item.js} references missing elements`);
  assert.deepEqual(missingResources, [], `${item.html} references missing local files`);
  assert.deepEqual(missingCssAssets, [], `${item.html} CSS references missing local files`);
  assert.equal(versionedCode, localCode, `${item.html} has unversioned JS/CSS resources`);
  assert.equal(redirectUrl.origin, "http://127.0.0.1:4173", `${item.html} redirects to the wrong origin`);
  assert.equal(redirectUrl.pathname, item.redirectPath, `${item.html} redirects to the wrong page`);
  assert.equal(redirectUrl.searchParams.get("embed"), "1", `${item.html} did not preserve its query`);
  assert.equal(redirectUrl.searchParams.get("seed"), "contract", `${item.html} did not preserve all query values`);
  assert.equal(redirectUrl.searchParams.get("v"), item.expectedVersion, `${item.html} has the wrong redirect cache key`);
  assert.equal(executeRedirect("http:", "?embed=1"), "", `${item.html} redirects even when already on HTTP`);

  report.push({
    page: item.html,
    ids: ids.size,
    scriptRefs: idRefs.length,
    localResources: resources.length,
    cssAssets: cssAssets.length,
    versionedCode,
    fileRedirect: redirectUrl.pathname
  });
}

console.log(JSON.stringify({ status: "ok", pages: report }, null, 2));
