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
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Lookbehind-free sentence splitter — runs on every browser. */
function splitSentences(text: string): string[] {
  const matches =
    text.replace(/\s+/g, " ").trim().match(/[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [];
  return matches.map((s) => s.trim()).filter((s) => s.split(" ").length >= 6);
}

const toSet = (words: string[]) => new Set(words);

function overlapRatio(words: string[], other: Set<string>, otherLen: number): number {
  let shared = 0;
  for (const w of words) if (other.has(w)) shared++;
  return shared / (Math.min(words.length, otherLen) || 1);
}

export function scanDocument(text: string, n = 5, title = ""): ScanResult {
  const list = splitSentences(text);
  if (list.length === 0) return { points: [], details: [], folded: 0 };
  if (list.length <= n) return { points: list, details: [], folded: 0 };

  const freq = new Map<string, number>();
  for (const w of tokenize(text)) freq.set(w, (freq.get(w) || 0) + 1);
  const titleWords = toSet(tokenize(title));

  let maxScore = 1;
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

  const byScore = [...scored].sort((a, b) => b.score - a.score);

  // Layer 1 — main points.
  const points: typeof scored = [];
  for (const cand of byScore) {
    if (points.length >= n) break;
    const dup = points.some(
      (p) => overlapRatio(cand.words, p.set, p.words.length) > 0.55
    );
    if (!dup) points.push(cand);
  }
  if (points.length === 0) points.push(...byScore.slice(0, n));

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
  if (rest.length > 14) {
    folded = rest.length - 14;
    rest = rest.slice(0, 14);
  }
  rest.sort((a, b) => a.index - b.index);
  points.sort((a, b) => a.index - b.index);

  return {
    points: points.map((p) => p.sentence),
    details: rest.map((d) => d.sentence),
    folded,
  };
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function readTime(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 220));
}
