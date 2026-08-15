/**
 * Readable twin of the bookmarklet's scanner. The widget ships its own
 * copy (see bookmarkletSource.ts); this module lets the site itself show
 * what the scanner will extract, before you install anything.
 *
 * Two-layer output:
 *  - points:  the n main points (distinct, on-subject, fact-aware)
 *  - details: a full summary of every other informative sentence that is
 *             NOT redundant with the points — the rest of the article's
 *             substance, in reading order.
 */

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have had he her his i if in into is it its of on or that the their there these they this to was we were what when which while who will with you your our us not no can could would should may might about over under after before between during".split(
    " "
  )
);

export interface ScanResult {
  points: string[];
  details: string[];
  folded: number;
  /** True when the document exceeded MAX_SENTENCES and was analysed in part. */
  capped: boolean;
  /** Human label for how deep the report went, e.g. "In-depth". */
  tier: string;
  /** Where each point sits in the document, 0–1 — powers the coverage map. */
  positions: number[];
}

/* ---------------- Rephrasing ----------------
 * Deterministic, local rewriting: it compresses wordy constructions and
 * strips throat-clearing openers so a regenerated point reads differently
 * while stating the same thing. Not generative AI — no invention, so the
 * meaning can't drift.
 */

const OPENERS =
  /^(however|moreover|furthermore|in addition|additionally|that said|nevertheless|nonetheless|indeed|notably|importantly|of course|in fact|meanwhile|similarly|consequently|therefore|thus|as a result|for example|for instance|in other words|on the other hand|at the same time|in particular|ultimately|overall|finally|first|second|third)\b[,:]?\s+/i;

const PHRASES: [RegExp, string][] = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bowing to the fact that\b/gi, "because"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bin the event that\b/gi, "if"],
  [/\bwith regard to\b/gi, "about"],
  [/\bwith respect to\b/gi, "about"],
  [/\bin terms of\b/gi, "in"],
  [/\ba large number of\b/gi, "many"],
  [/\ba small number of\b/gi, "a few"],
  [/\bthe majority of\b/gi, "most"],
  [/\ba significant proportion of\b/gi, "much of"],
  [/\bat this point in time\b/gi, "now"],
  [/\bat the present time\b/gi, "now"],
  [/\bin the near future\b/gi, "soon"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\bdespite the fact that\b/gi, "although"],
  [/\bit is important to note that\b/gi, ""],
  [/\bit should be noted that\b/gi, ""],
  [/\bit is worth noting that\b/gi, ""],
  [/\bthere is no doubt that\b/gi, ""],
  [/\bis able to\b/gi, "can"],
  [/\bare able to\b/gi, "can"],
  [/\bhas the ability to\b/gi, "can"],
  [/\bmake a decision\b/gi, "decide"],
  [/\bconduct an investigation\b/gi, "investigate"],
  [/\bprovide assistance\b/gi, "help"],
  [/\bin close proximity to\b/gi, "near"],
  [/\bon a regular basis\b/gi, "regularly"],
  [/\bin the majority of cases\b/gi, "usually"],
  [/\bwhether or not\b/gi, "whether"],
  [/\beach and every\b/gi, "every"],
  [/\bcompletely eliminate\b/gi, "eliminate"],
  [/\bfuture plans?\b/gi, "plans"],
  [/\bpast history\b/gi, "history"],
  [/\bend result\b/gi, "result"],
  [/\bbasic fundamentals\b/gi, "fundamentals"],
];

/**
 * Rewrite a sentence into tighter language without changing its claims.
 * Idempotent-ish: running it twice yields the same text, so a second
 * regenerate relies on variant selection rather than further mangling.
 */
export function paraphrase(sentence: string): string {
  let s = sentence.trim();
  // Drop up to two stacked openers ("However, in addition, ...").
  for (let i = 0; i < 2; i++) s = s.replace(OPENERS, "");
  // Remove parenthetical asides that aren't load-bearing.
  s = s.replace(/\s*\([^)]{0,80}\)\s*/g, " ");
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}

/**
 * Report depth scales with the material: a short post gets a tight summary,
 * a long report gets a proportionally fuller one.
 */
export function depthFor(words: number, baseSupport = 14) {
  if (words < 250) return { points: 3, support: Math.min(baseSupport, 5), tier: "Brief" };
  if (words < 1200) return { points: 5, support: baseSupport, tier: "Standard" };
  if (words < 4000) return { points: 7, support: Math.round(baseSupport * 1.7), tier: "Extended" };
  if (words < 12000) return { points: 10, support: Math.round(baseSupport * 2.6), tier: "In-depth" };
  return { points: 14, support: Math.round(baseSupport * 3.5), tier: "Full report" };
}

/** Redundancy filtering is O(n²); this ceiling keeps the tab responsive. */
export const MAX_SENTENCES = 4000;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Boilerplate that scores well on frequency but says nothing: nav labels,
 * cookie notices, share prompts, bylines, subscription nags.
 */
const BOILERPLATE =
  /^(share this|read more|click here|sign up|subscribe|log ?in|sign ?in|advertisement|sponsored|cookie|we use cookies|accept all|privacy policy|terms of|all rights reserved|copyright|follow us|related articles?|you might also like|trending now|most popular|photo|image|getty|reuters|associated press|published|updated|posted on|by [A-Z][a-z]+ [A-Z][a-z]+$|comments?$|tags?:|filed under|skip to)/i;

/** Sentence fragments that indicate a bad extraction rather than a real point. */
function isUsableSentence(s: string): boolean {
  if (BOILERPLATE.test(s.trim())) return false;
  // Needs at least one verb-ish word and a reasonable letter ratio — filters
  // out menu dumps like "Home About Contact Careers Press".
  const letters = (s.match(/[a-z]/gi) || []).length;
  if (letters / Math.max(s.length, 1) < 0.55) return false;
  // Reject ALL-CAPS banners and title-case link lists.
  const words = s.split(/\s+/);
  const capped = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (words.length >= 5 && capped / words.length > 0.8) return false;
  return true;
}

/** Abbreviations that must not end a sentence. */
const ABBREV =
  /\b(?:[A-Z]|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|e\.g|i\.e|approx|Inc|Ltd|Corp|Co|Dept|Est|Fig|No|Vol|pp|al)\.$/i;

/** Lookbehind-free sentence splitter — runs on every browser. */
export function splitSentences(text: string): string[] {
  const raw =
    text.replace(/\s+/g, " ").trim().match(/[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [];

  // Re-join fragments split on abbreviations or decimals ("Dr. Chen said…",
  // "rose 3.5 percent") so points don't arrive truncated mid-thought.
  const merged: string[] = [];
  for (const piece of raw) {
    const prev = merged[merged.length - 1];
    if (prev && (ABBREV.test(prev.trim()) || /\d\.$/.test(prev.trim()))) {
      merged[merged.length - 1] = prev + piece;
    } else {
      merged.push(piece);
    }
  }
  const matches = merged;
  return matches
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 6 && isUsableSentence(s));
}

const toSet = (words: string[]) => new Set(words);

function overlapRatio(words: string[], other: Set<string>, otherLen: number): number {
  let shared = 0;
  for (const w of words) if (other.has(w)) shared++;
  return shared / (Math.min(words.length, otherLen) || 1);
}

/**
 * @param n number of main points, or 0 / "auto" to scale with document length
 */
export interface ScanOptions {
  /** Bump to re-select alternate wording for the same ideas. */
  variant?: number;
  /** Compress wordy phrasing so regenerated points read freshly. */
  rephrase?: boolean;
}

export function scanDocument(
  text: string,
  n: number | "auto" = "auto",
  title = "",
  baseSupport = 14,
  opts: ScanOptions = {}
): ScanResult {
  const { variant = 0, rephrase = false } = opts;
  const all = splitSentences(text);
  const totalWords = wordCount(text);
  const depth = depthFor(totalWords, baseSupport);
  const points_n = !n || n === "auto" ? depth.points : n;
  const maxSupport = depth.support;
  const tier = depth.tier;
  const finish = (arr: string[]) => (rephrase ? arr.map(paraphrase) : arr);

  if (all.length === 0)
    return { points: [], details: [], folded: 0, capped: false, tier, positions: [] };
  if (all.length <= points_n)
    return {
      points: finish(all),
      details: [],
      folded: 0,
      capped: false,
      tier,
      positions: all.map((_, i) => i / Math.max(all.length - 1, 1)),
    };

  const capped = all.length > MAX_SENTENCES;
  const list = capped ? all.slice(0, MAX_SENTENCES) : all;

  const freq = new Map<string, number>();
  for (const w of tokenize(text)) freq.set(w, (freq.get(w) || 0) + 1);
  const titleWords = toSet(tokenize(title));

  let maxScore = 0;
  const scored = list.map((sentence, index) => {
    const words = tokenize(sentence);
    const unique = [...new Set(words)];
    let sum = 0;
    let titleHits = 0;
    for (const w of unique) {
      sum += freq.get(w) || 0;
      if (titleWords.has(w)) titleHits++;
    }
    let score = sum / Math.sqrt(Math.max(unique.length, 1));
    score *= 1 + 0.5 * Math.max(0, 1 - index / 10); // lead bias
    if (/\d/.test(sentence)) score *= 1.12; // concrete facts
    if (
      /^(however|therefore|overall|in short|in conclusion|as a result|the study|researchers|scientists|the report)/i.test(
        sentence
      )
    )
      score *= 1.08;
    score *= 1 + Math.min(0.4, titleHits * 0.1); // stay on subject
    if (score > maxScore) maxScore = score;
    return { sentence, index, score, words: unique, set: toSet(unique) };
  });
  // Relative threshold: short documents scored below 1 previously disabled
  // the filler filter entirely.
  if (maxScore <= 0) maxScore = 1;

  const byScore = [...scored].sort((a, b) => b.score - a.score);

  // Layer 1 — main points.
  // Collect a deeper pool than needed so "regenerate" can pick different
  // sentences that cover the same ground.
  const pool: typeof scored = [];
  for (const cand of byScore) {
    if (pool.length >= points_n + 6) break;
    const dup = pool.some(
      (p) => overlapRatio(cand.words, p.set, p.words.length) > 0.55
    );
    if (!dup) pool.push(cand);
  }
  if (pool.length === 0) pool.push(...byScore.slice(0, points_n));

  let points: typeof scored;
  if (variant === 0 || pool.length <= points_n) {
    points = pool.slice(0, points_n);
  } else {
    // Keep the strongest point anchored; rotate the remainder.
    const spare = pool.length - points_n;
    const offset = ((variant - 1) % spare) + 1;
    const rest = pool.slice(1);
    points = [pool[0], ...rest.slice(offset), ...rest.slice(0, offset)].slice(0, points_n);
  }

  // Layer 2 — full summary: informative, non-redundant leftovers.
  const pickedIdx = new Set(points.map((p) => p.index));
  let rest = byScore.filter((c) => {
    if (pickedIdx.has(c.index)) return false;
    if (c.words.length < 3 || c.score < maxScore * 0.28) return false; // filler
    if (points.some((p) => overlapRatio(c.words, p.set, p.words.length) > 0.55))
      return false;
    return true;
  });

  // De-duplicate the leftovers against each other (keep the stronger).
  const details: typeof rest = [];
  for (const cand of rest) {
    const dup = details.some(
      (d) => overlapRatio(cand.words, d.set, d.words.length) > 0.6
    );
    if (!dup) details.push(cand);
  }
  rest = details;

  let folded = 0;
  if (rest.length > maxSupport) {
    folded = rest.length - maxSupport;
    rest = rest.slice(0, maxSupport);
  }
  rest.sort((a, b) => a.index - b.index);
  points.sort((a, b) => a.index - b.index);

  const lastIdx = Math.max(list.length - 1, 1);
  return {
    capped,
    tier,
    positions: points.map((p) => p.index / lastIdx),
    points: finish(points.map((p) => p.sentence)),
    details: finish(rest.map((d) => d.sentence)),
    folded,
  };
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function readTime(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 220));
}
