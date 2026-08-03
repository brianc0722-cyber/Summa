/**
 * Page-only insight layer: derives observations from the scanned text —
 * supporting evidence per point, the numbers that anchor it, the tensions
 * and turning points, forward-looking actions, and the dominant terms.
 * Pure heuristics, fully local — the extension never imports this.
 */
import { splitSentences, tokenize, wordCount } from "./summarize";

export interface InsightSet {
  stats: { words: number; sentences: number; readMins: number };
  terms: { word: string; count: number }[];
  numbers: string[];
  tensions: string[];
  actions: string[];
  support: string[][]; // supporting sentences per main point
}

const TENSION =
  /\b(however|but|yet|although|despite|warn|warns|critics|concern|concerns|risk|risks|fail|failed|threat|challenge|challenges|oppose|opposed|dispute)\b/i;
const ACTION =
  /\b(will|must|should|plan|plans|planned|propose|proposed|proposal|recommend|recommends|expected|expects|aims|aim|seek|seeks|announce|announced|announces|intend|intends|next|future)\b/i;
const NUMBERY = /%|\$|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s*(percent|million|billion|thousand|trillion)\b|\b\d{2,}\b/i;

function overlap(a: string[], bSet: Set<string>): number {
  let n = 0;
  for (const w of a) if (bSet.has(w)) n++;
  return n;
}

export function deriveInsights(
  text: string,
  points: string[],
  details: string[]
): InsightSet {
  const all = splitSentences(text);
  const words = wordCount(text);

  // Term frequencies across the whole document.
  const freq = new Map<string, number>();
  for (const w of tokenize(text)) freq.set(w, (freq.get(w) || 0) + 1);
  const terms = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  // Evidence per point: the detail sentences that overlap it most.
  const support = points.map((p) => {
    const pSet = new Set(tokenize(p));
    return details
      .map((d) => ({ d, score: overlap(tokenize(d), pSet) }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((x) => x.d);
  });

  const pick = (re: RegExp, cap: number) =>
    all.filter((s) => re.test(s)).slice(0, cap);

  return {
    stats: {
      words,
      sentences: all.length,
      readMins: Math.max(1, Math.round(words / 220)),
    },
    terms,
    numbers: pick(NUMBERY, 4),
    tensions: pick(TENSION, 3),
    actions: pick(ACTION, 3),
    support,
  };
}
