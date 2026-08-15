/**
 * Summa website scanner — the readable TypeScript twin of the extension's
 * widget.js. Both do the same job; this module is used by the React site
 * (Workbench, demo, install page). The extension carries its own self-
 * contained copy so it never depends on a build step.
 *
 * Improvements over the previous version:
 *   1. TF-IDF normalization — scores are relative to document size, so
 *      a word appearing 50x in 10,000 words scores the same as one
 *      appearing 5x in 1,000 words.
 *   2. Proportional output — points and summary length scale with the
 *      document word count, not a fixed constant.
 *   3. Adaptive redundancy threshold — tightens on short documents
 *      (where false positives are expensive) and loosens on long ones
 *      (where coverage matters more than precision).
 *   4. Content-type profiles — same five profiles as the extension:
 *      article, email, visual, docs, thread.
 *   5. Conclusion-signal detection expanded.
 */

const STOPWORDS = new Set(
  "a an and are as at be been being but by could did do does for from had has have he her him his i if in into is it its just me might my no not of on or our s shall she should so some such than that the their them then there they this to up us very was we were what when which while who will with would you your".split(" ")
);

export type ContentType = "article" | "email" | "visual" | "docs" | "thread";

interface Profile {
  minWords: number;
  lead: number;
  end: number;
  action: number;
  maxSupport: number;
}

const PROFILES: Record<ContentType, Profile> = {
  article: { minWords: 6, lead: 0.50, end: 0.00, action: 1.00, maxSupport: 14 },
  email:   { minWords: 4, lead: 0.25, end: 0.35, action: 1.20, maxSupport: 8  },
  visual:  { minWords: 4, lead: 0.20, end: 0.00, action: 1.00, maxSupport: 10 },
  docs:    { minWords: 6, lead: 0.45, end: 0.00, action: 1.00, maxSupport: 16 },
  thread:  { minWords: 4, lead: 0.15, end: 0.10, action: 1.00, maxSupport: 12 },
};

const ACTION_RE =
  /(please|kindly|attached|attachment|let me know|deadline|asap|regards|thank you|thanks|schedule|confirm|review|approve|reply|respond|by (monday|tuesday|wednesday|thursday|friday|tomorrow|eod|cob))/i;

const CONCLUSION_RE =
  /^(however|therefore|overall|in short|in conclusion|to summarize|as a result|the study|researchers|scientists|the report|in summary|the data|findings suggest|results show|evidence indicates|the analysis)/i;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function splitSentences(text: string, minWords = 6): string[] {
  const matches =
    text.replace(/\s+/g, " ").trim().match(/[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [];
  return matches
    .map((s) => s.trim())
    .filter((s) => s.split(" ").filter(Boolean).length >= minWords);
}

function buildTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const total = tokens.length || 1;
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  for (const [k, v] of tf) tf.set(k, v / total);
  return tf;
}

function buildIDF(sentences: string[]): Map<string, number> {
  const N = sentences.length || 1;
  const df = new Map<string, number>();
  for (const sent of sentences) {
    const seen = new Set(tokenize(sent));
    for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [w, d] of df) {
    idf.set(w, Math.min(6, Math.max(0.1, Math.log(N / d))));
  }
  return idf;
}

export function pointCount(wordCount: number): number {
  if (wordCount < 500)   return 3;
  if (wordCount < 1500)  return 5;
  if (wordCount < 4000)  return 7;
  if (wordCount < 10000) return 9;
  return 10;
}

function redundancyThreshold(wordCount: number): number {
  if (wordCount < 500)   return 0.45;
  if (wordCount < 2000)  return 0.55;
  if (wordCount < 8000)  return 0.60;
  return 0.65;
}

export interface ScanResult {
  points: string[];
  details: string[];
  folded: number;
}

const toSet = (words: string[]) => new Set(words);

function overlapRatio(a: string[], other: Set<string>, otherLen: number): number {
  let shared = 0;
  for (const w of a) if (other.has(w)) shared++;
  return shared / (Math.min(a.length, otherLen) || 1);
}

export function scanDocument(
  text: string,
  n?: number,
  title = "",
  contentType: ContentType = "article"
): ScanResult {
  const profile = PROFILES[contentType] ?? PROFILES.article;
  const list = splitSentences(text, profile.minWords);
  const wc = wordCount(text);
  const nPoints = n ?? pointCount(wc);
  const dupThresh = redundancyThreshold(wc);

  if (list.length === 0) return { points: [], details: [], folded: 0 };
  if (list.length <= nPoints) return { points: list, details: [], folded: 0 };

  const tf = buildTF(tokenize(text));
  const idf = buildIDF(list);
  const titleWords = toSet(tokenize(title));
  const total = list.length;
  let maxScore = 1;

  const scored = list.map((sentence, index) => {
    const tokens = tokenize(sentence);
    const unique = [...new Set(tokens)];
    let tfidfSum = 0;
    let titleHits = 0;
    for (const w of unique) {
      tfidfSum += (tf.get(w) || 0) * (idf.get(w) || 1);
      if (titleWords.has(w)) titleHits++;
    }
    let score = tfidfSum / Math.sqrt(Math.max(unique.length, 1));
    if (profile.lead) score *= 1 + profile.lead * Math.max(0, 1 - index / 10);
    if (profile.end)  score *= 1 + profile.end  * Math.max(0, 1 - (total - 1 - index) / 6);
    if (/\d/.test(sentence)) score *= 1.14;
    if (CONCLUSION_RE.test(sentence)) score *= 1.10;
    if (profile.action !== 1 && ACTION_RE.test(sentence)) score *= profile.action;
    score *= 1 + Math.min(0.4, titleHits * 0.12);
    if (score > maxScore) maxScore = score;
    return { sentence, index, score, words: unique, set: toSet(unique) };
  });

  const byScore = [...scored].sort((a, b) => b.score - a.score);

  const points: typeof scored = [];
  for (const cand of byScore) {
    if (points.length >= nPoints) break;
    const dup = points.some((p) => overlapRatio(cand.words, p.set, p.words.length) > dupThresh);
    if (!dup) points.push(cand);
  }
  if (points.length === 0) points.push(...byScore.slice(0, nPoints));

  const pickedIdx = new Set(points.map((p) => p.index));
  const detailThresh = Math.min(0.7, dupThresh + 0.08);

  let rest = byScore.filter((c) => {
    if (pickedIdx.has(c.index)) return false;
    if (c.words.length < 3) return false;
    if (c.score < maxScore * 0.22) return false;
    if (points.some((p) => overlapRatio(c.words, p.set, p.words.length) > dupThresh)) return false;
    return true;
  });

  const details: typeof rest = [];
  for (const cand of rest) {
    const dup = details.some((d) => overlapRatio(cand.words, d.set, d.words.length) > detailThresh);
    if (!dup) details.push(cand);
  }
  rest = details;

  const cap = wc > 10000
    ? Math.min(30, profile.maxSupport * 2)
    : wc > 4000
    ? Math.min(22, Math.round(profile.maxSupport * 1.5))
    : profile.maxSupport;

  let folded = 0;
  if (rest.length > cap) {
    folded = rest.length - cap;
    rest = rest.slice(0, cap);
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

export function docLengthLabel(wc: number): string {
  if (wc < 300)   return "Very short";
  if (wc < 800)   return "Short";
  if (wc < 2000)  return "Medium";
  if (wc < 6000)  return "Long";
  if (wc < 15000) return "Very long";
  return "Book-length";
}