"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const tests = fs.readdirSync(__dirname).filter((file) => /^test-.*\.js$/.test(file)).sort();

for (const [index, file] of tests.entries()) {
  process.stdout.write(`\n[${index + 1}/${tests.length}] ${file}\n`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

process.stdout.write(`\n全部 ${tests.length} 組測試通過。\n`);
