#!/usr/bin/env node
// Bump @r4pm/components version. Tag `components-v<x.y.z>` must match; it triggers publish CI.
//   pnpm components:version 0.1.0          # edit package.json, print git commands
//   pnpm components:version 0.1.0 --tag    # commit + tag + push (fires publish CI)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkgPath = `${root}packages/components/package.json`;

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("-"));
const doTag = args.includes("--tag");

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm components:version <x.y.z[-pre]> [--tag]");
  process.exit(1);
}

// Targeted replace of the top-level "version" field (no nested version keys in this package.json),
// so the diff is a single line and formatting is untouched.
const pkg = readFileSync(pkgPath, "utf8");
const prev = pkg.match(/"version":\s*"([^"]*)"/)?.[1];
if (prev === undefined) {
  console.error(`Could not find a "version" field in ${pkgPath}`);
  process.exit(1);
}
writeFileSync(pkgPath, pkg.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`));

console.log(`@r4pm/components ${prev} -> ${version}`);
console.log("  updated packages/components/package.json");

const tag = `components-v${version}`;
if (doTag) {
  tagAndPush(tag);
} else {
  console.log("\nnext, to publish:");
  console.log(`  git commit -am "release: ${tag}"`);
  console.log(`  git tag ${tag}`);
  console.log(`  git push && git push origin ${tag}`);
}

// --tag: commit any tracked changes (else tag HEAD as-is), (re)use tag, push it (fires publish CI).
function tagAndPush(tag) {
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"]).toString().trim();
  if (dirty) {
    execFileSync("git", ["commit", "-am", `release: ${tag}`], { stdio: "inherit" });
  } else {
    console.log("working tree clean - nothing to commit, tagging current HEAD");
  }
  if (execFileSync("git", ["tag", "-l", tag]).toString().trim()) {
    console.log(`tag ${tag} already exists, reusing it`);
  } else {
    execFileSync("git", ["tag", tag], { stdio: "inherit" });
  }
  execFileSync("git", ["push", "origin", tag], { stdio: "inherit" });
  console.log(`\npushed ${tag} - the release workflow will run.`);
}
