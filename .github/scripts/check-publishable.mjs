#!/usr/bin/env node
/**
 * Fails when a package's dependencies can't be installed from npm, such as
 * `workspace:` or `github:` specifiers. `npm publish` keeps them as written,
 * which breaks installs of the published package.
 *
 * Usage: node .github/scripts/check-publishable.mjs <package directory>
 */

import fs from "fs";
import path from "path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: check-publishable.mjs <package directory>");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
const unpublishable = /^(workspace:|github:|git\+|git:|file:|link:)/;
const problems = [];
for (const field of [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
]) {
  for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
    if (unpublishable.test(spec)) problems.push(`${field}: ${name}@${spec}`);
  }
}

if (problems.length) {
  console.error(
    `${pkg.name} can't be published: these dependencies won't install from npm. Use published versions.`,
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`${pkg.name}: all dependencies install from npm`);
