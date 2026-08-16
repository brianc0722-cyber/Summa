#!/usr/bin/env node
/**
 * Idempotent, safe injector for the npm scripts that keep getting lost
 * every time this project folder is re-synced from a fresh download
 * (package.json isn't part of what gets hand-edited elsewhere, so a
 * fresh copy always resets it back to the original 3-script version).
 *
 * This reads package.json with a real JSON parser, adds the three
 * scripts only if they're missing, and writes it back out with
 * JSON.stringify — which makes a malformed file (stray brace, missing
 * comma, duplicate key) structurally impossible. Safe to run as many
 * times as you like; it never duplicates or corrupts anything.
 *
 * Usage:  node scripts/setup-scripts.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");

let raw;
try {
  raw = readFileSync(pkgPath, "utf8");
} catch (err) {
  console.error("✗ Could not read package.json at " + pkgPath);
  console.error("  " + err.message);
  process.exit(1);
}

let pkg;
try {
  pkg = JSON.parse(raw);
} catch (err) {
  console.error("✗ package.json is not valid JSON right now, so it can't be safely edited.");
  console.error("  " + err.message);
  console.error(
    "  Fix: re-download a fresh copy of the project (which has a valid\n" +
      "  package.json) and run this script again before hand-editing anything."
  );
  process.exit(1);
}

const wanted = {
  test: "vitest run",
  "check:parity": "node scripts/check-parity.mjs",
  prebuild: "npm run check:parity",
};

pkg.scripts = pkg.scripts || {};
let changed = false;
for (const [key, value] of Object.entries(wanted)) {
  if (pkg.scripts[key] !== value) {
    pkg.scripts[key] = value;
    changed = true;
  }
}

if (!changed) {
  console.log("✓ package.json already has test, check:parity, and prebuild — nothing to do.");
  process.exit(0);
}

// JSON.stringify guarantees valid, correctly-bracketed output — the class
// of error from manual Notepad edits (stray "}", missing comma) cannot
// happen with this approach.
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log("✓ Added missing scripts to package.json:");
for (const key of Object.keys(wanted)) console.log("    " + key);
console.log("\nRun `npm test` now.");
