#!/usr/bin/env node
// Bump the app version (tauri.conf.json is source of truth; Cargo.toml mirrored). Tag must match.
//   pnpm app:version 0.2.0          # edit files, print git commands
//   pnpm app:version 0.2.0 --tag    # commit + tag + push (fires release CI)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const confPath = `${root}engine/app/tauri.conf.json`;
const cargoPath = `${root}engine/app/Cargo.toml`;
const lockPath = `${root}engine/Cargo.lock`;

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("-"));
const doTag = args.includes("--tag");

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm app:version <x.y.z[-pre]> [--tag]");
  process.exit(1);
}

// tauri.conf.json: source of truth for the bundle, updater, and the app's getVersion()/__APP_VERSION__.
const conf = JSON.parse(readFileSync(confPath, "utf8"));
const prev = conf.version;
conf.version = version;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);

// Cargo.toml: replace only the [package] version line (line-anchored; leaves dependency versions alone).
const cargo = readFileSync(cargoPath, "utf8");
if (!/^version = "[^"]*"$/m.test(cargo)) {
  console.error(`Could not find a [package] version line in ${cargoPath}`);
  process.exit(1);
}
writeFileSync(cargoPath, cargo.replace(/^version = "[^"]*"$/m, `version = "${version}"`));

// Cargo.lock: bump the propel-tauri entry so cargo doesn't rewrite it separately later.
const lock = readFileSync(lockPath, "utf8");
const lockRe = /(\[\[package\]\]\nname = "propel-tauri"\nversion = ")[^"]*(")/;
if (!lockRe.test(lock)) {
  console.error(`Could not find the propel-tauri entry in ${lockPath}`);
  process.exit(1);
}
writeFileSync(lockPath, lock.replace(lockRe, `$1${version}$2`));

console.log(`app version ${prev} -> ${version}`);
console.log("  updated engine/app/tauri.conf.json");
console.log("  updated engine/app/Cargo.toml");
console.log("  updated engine/Cargo.lock");

const tag = `v${version}`;
if (doTag) {
  tagAndPush(tag);
} else {
  console.log("\nnext, to cut the release:");
  console.log(`  git commit -am "release: ${tag}"`);
  console.log(`  git tag ${tag}`);
  console.log(`  git push && git push origin ${tag}`);
}

// --tag: commit any tracked changes (else tag HEAD as-is), (re)use tag, push it (fires release CI).
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
