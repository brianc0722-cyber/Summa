#!/usr/bin/env node
/**
 * Parity checker for Summa's three scanner copies.
 *
 * The scan engine intentionally exists in three places — the website's
 * TypeScript module, the bookmarklet source, and the Chrome extension's
 * plain-JS widget — because each has different runtime constraints (no
 * bundler for the injected copies, TypeScript for the site). That
 * duplication is exactly what let real bugs slip through three separate
 * manual audits: the bookmarklet's Shuffle button silently did nothing for
 * a while because its `scan()` never received a `variance` parameter at
 * all, and that only surfaced because someone happened to read the file.
 *
 * This script extracts a set of "fingerprints" — key constants, magic
 * numbers, and structural markers that MUST match across all three copies
 * — and fails with a clear diff if any of them drift. Run it as part of
 * `npm run build` so a mismatch blocks a bad deploy instead of shipping
 * silently, the same way a broken bookmarklet did before.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const FILES = {
  site: join(root, "src/lib/summarize.ts"),
  bookmarklet: join(root, "src/lib/bookmarkletSource.ts"),
  extension: join(root, "extension/widget.js"),
};

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const contents = Object.fromEntries(
  Object.entries(FILES).map(([k, p]) => [k, read(p)])
);

let failed = false;
const problems = [];

function requireAll(label, pattern, { in: which = ["bookmarklet", "extension"] } = {}) {
  for (const key of which) {
    const text = contents[key];
    if (text == null) {
      problems.push(`[${label}] could not read the "${key}" file`);
      failed = true;
      continue;
    }
    if (!pattern.test(text)) {
      problems.push(`[${label}] missing/changed in "${key}" (${FILES[key]})`);
      failed = true;
    }
  }
}

function extractNumbers(label, pattern) {
  const found = {};
  for (const [key, text] of Object.entries(contents)) {
    if (text == null) continue;
    const m = text.match(pattern);
    if (m) found[key] = m[1];
  }
  const values = Object.values(found);
  const unique = new Set(values);
  if (unique.size > 1) {
    problems.push(
      `[${label}] values disagree across copies: ${JSON.stringify(found)}`
    );
    failed = true;
  }
  return found;
}

// --- Structural markers that must exist in both hand-shipped copies ---
requireAll("boilerplate filter", /BOILERPLATE\s*=/);
requireAll("abbreviation-safe splitting", /ABBREV\s*=/);
requireAll("Object.create(null) hardening", /Object\.create\(null\)/);
requireAll("sentence cap guard", /list\.length > 4000/);
requireAll("variance clamp", /Math\.min\(variance(?:\s*\|\|\s*0)?,\s*3\.5\)/);
requireAll("Shuffle cancels in-flight speech", /speechSynthesis[\s\S]{0,40}cancel/, {
  in: ["bookmarklet", "extension"],
});
requireAll("points dropdown wiring", /psum-pts/);

// --- Numeric constants that must agree everywhere they appear ---
extractNumbers("sentence cap", /list\.length > (\d+)/);
extractNumbers("variance ceiling", /variance(?:\s*\|\|\s*0)?,\s*(\d+\.?\d*)\)/);

// --- The TypeScript engine's own internal contract ---
if (contents.site && !/export const MAX_SENTENCES = 4000/.test(contents.site)) {
  problems.push("[site] MAX_SENTENCES constant changed — update the mirrored 4000 cap in the other two copies too");
  failed = true;
}

console.log("Summa scanner parity check");
console.log("──────────────────────────");
for (const [key, path] of Object.entries(FILES)) {
  console.log(`  ${contents[key] ? "✓" : "✗"} ${key.padEnd(11)} ${path}`);
}
console.log("");

if (failed) {
  console.error("✗ Parity check FAILED — the scanner copies have drifted:\n");
  for (const p of problems) console.error("  - " + p);
  console.error(
    "\nWhen you change scoring, filtering, or UI wiring in one scanner copy,\n" +
      "make the same change in all three: src/lib/summarize.ts,\n" +
      "src/lib/bookmarkletSource.ts, and extension/widget.js.\n"
  );
  process.exit(1);
} else {
  console.log("✓ All three scanner copies agree on every checked marker.\n");
}
