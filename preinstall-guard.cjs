// Cross-platform preinstall guard. This used to be a `sh -c '...'` one-liner
// in package.json's "preinstall" script, which works fine on Linux/macOS/
// Replit but fails on plain Windows PowerShell/cmd — there's no `sh` binary
// on PATH there by default (ERR: "'sh' is not recognized..."), so `pnpm
// install` couldn't get past preinstall on a native Windows checkout. Node
// itself is guaranteed to be on PATH (it's the whole reason pnpm works at
// all), so doing this in plain Node instead makes it work identically on
// every platform.
//
// What it does (unchanged behavior from the old shell one-liner):
//  1. Deletes package-lock.json / yarn.lock if either exists — this repo is
//     pnpm-only, and a stray lockfile from an accidental `npm install` or
//     `yarn install` causes confusing, inconsistent installs.
//  2. Refuses to continue if the install wasn't invoked via pnpm (checked
//     via the npm_config_user_agent env var every package manager sets).
const fs = require("fs");

for (const file of ["package-lock.json", "yarn.lock"]) {
  try {
    fs.unlinkSync(file);
  } catch {
    // doesn't exist — nothing to do
  }
}

const userAgent = process.env.npm_config_user_agent || "";
if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
