#!/usr/bin/env node
/**
 * Syncs growthbook-proxy to growthbook-proxy-cloud:
 * 1. Patches app.js to inject version (removes package.json require)
 * 2. Runs pnpm add for each proxy dependency to sync package.json
 *
 * Run from proxy-cloud directory. Expects growthbook-proxy repo at ../ (parent).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const proxyCloudDir = process.cwd();
// In CI: proxy-cloud is inside growthbook-proxy, so .. = proxy repo
// Locally: proxy-cloud and growthbook-proxy are siblings under growthbook/
const parentDir = path.resolve(proxyCloudDir, "..");
const proxyRepoDir = fs.existsSync(path.join(parentDir, "packages/apps/proxy/package.json"))
  ? parentDir
  : path.join(parentDir, "growthbook-proxy");

const proxyPkg = JSON.parse(
  fs.readFileSync(path.join(proxyRepoDir, "packages/apps/proxy/package.json"), "utf8")
);
const evalPkg = JSON.parse(
  fs.readFileSync(path.join(proxyRepoDir, "packages/lib/eval/package.json"), "utf8")
);

const version = proxyPkg.version ?? "unknown";
console.log("Proxy version:", version);

// 1. Patch app.js
const appPath = path.join(proxyCloudDir, "src/proxy-app/app.js");
let content = fs.readFileSync(appPath, "utf8");

// Replace the packageJson read + version assignment with a hardcoded version string
content = content.replace(
  /const packageJson = JSON\.parse\(.*?package\.json.*?\);\s*\n\s*exports\.version = .*? \+ "";/s,
  `exports.version = "${version}" + "";`
);

fs.writeFileSync(appPath, content);
console.log("Patched app.js");

// 2. Sync dependencies
const depsToAdd = [];
for (const [name, range] of Object.entries(proxyPkg.dependencies || {})) {
  if (range === "workspace:*") {
    if (name === "@growthbook/proxy-eval") {
      depsToAdd.push(`${name}@^${evalPkg.version}`);
    }
  } else if (name !== "pm2") {
    depsToAdd.push(`${name}@${range}`);
  }
}

if (depsToAdd.length > 0) {
  console.log("Adding dependencies:", depsToAdd.join(", "));
  execSync(`pnpm add ${depsToAdd.join(" ")}`, {
    cwd: proxyCloudDir,
    stdio: "inherit",
  });
}
