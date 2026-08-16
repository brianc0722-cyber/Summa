/**
 * Test suite for the scan engine. Every case here targets a real failure
 * class found across three manual audits — the goal is that the *next*
 * regression like these is caught by `npm test` in milliseconds instead of
 * requiring another full manual read-through of App.tsx / widget.js.
 */
import { describe, it, expect } from "vitest";
import {
  scanDocument,
  splitSentences,
  tokenize,
  depthFor,
  wordCount,
  readTime,
  MAX_SENTENCES,
} from "./summarize";

// A realistic multi-paragraph article — long enough to exceed the "already
// short, return everything" fast path and exercise real scoring.
const ARTICLE = `
Radiology departments around the world are facing an unprecedented workload. The number of imaging studies ordered each year has grown far faster than the supply of trained radiologists, leading to fatigue, burnout, and diagnostic delays. Into this gap stepped a new generation of machine learning models trained on millions of annotated scans. These systems do not replace radiologists; instead, they act as a tireless second reader, flagging subtle anomalies that a tired human eye might miss after a twelve-hour shift. In controlled trials, radiologists working alongside such models detected early-stage lung nodules at significantly higher rates than either the model or the physician alone. The most successful deployments treat the algorithm as a triage tool, pushing the most suspicious cases to the top of the worklist so that urgent patients are seen first. Skeptics rightly point out that models can inherit biases from their training data and may fail silently on equipment they have never seen. As a result, regulators now demand continuous monitoring and clear accountability for every automated suggestion. The emerging consensus is that the future of radiology is neither human nor machine, but a careful partnership in which each covers the other's blind spots.
`.trim();

const TITLE = "How Machine Learning Is Quietly Rewriting Radiology";

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops stopwords/short words", () => {
    const words = tokenize("The Quick, Brown Fox! Jumps over a lazy dog.");
    expect(words).not.toContain("the");
    expect(words).not.toContain("a");
    expect(words).toContain("quick");
    expect(words).toContain("brown");
  });

  it("never throws on empty or symbol-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("!!! ??? ...")).toEqual([]);
  });
});

describe("splitSentences", () => {
  it("does not fracture on common abbreviations", () => {
    const s = splitSentences(
      "Dr. Chen reported that revenue rose 3.5 percent last quarter, according to Reuters Inc. Analysts had expected a smaller gain of about 2.1 percent overall."
    );
    // Must NOT split into a fragment like "Dr." on its own.
    expect(s.some((x) => x.trim() === "Dr.")).toBe(false);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]).toMatch(/^Dr\. Chen reported/);
  });

  it("rejects boilerplate lines even when they are grammatically valid sentences", () => {
    const s = splitSentences(
      "Share this article with your friends and family today. The council approved the new zoning proposal after a lengthy debate on Tuesday evening."
    );
    expect(s.some((x) => /^share this/i.test(x))).toBe(false);
    expect(s.some((x) => /zoning proposal/i.test(x))).toBe(true);
  });

  it("rejects nav/menu dumps (mostly-capitalized short runs)", () => {
    const s = splitSentences(
      "Home About Contact Careers Press Support Legal. The committee will reconvene next month to finalize the budget after reviewing public comments."
    );
    expect(s.some((x) => /^Home About Contact/i.test(x))).toBe(false);
  });

  it("drops fragments shorter than 6 words", () => {
    const s = splitSentences("Yes. No. Maybe so. This sentence has more than six words in it.");
    expect(s.every((x) => x.split(" ").length >= 6)).toBe(true);
  });
});

describe("depthFor — adaptive report sizing", () => {
  it("scales points and tier label with document length", () => {
    expect(depthFor(100).tier).toBe("Brief");
    expect(depthFor(100).points).toBe(3);

    expect(depthFor(800).tier).toBe("Standard");
    expect(depthFor(800).points).toBe(5);

    expect(depthFor(2500).tier).toBe("Extended");
    expect(depthFor(2500).points).toBe(7);

    expect(depthFor(8000).tier).toBe("In-depth");
    expect(depthFor(8000).points).toBe(10);

    expect(depthFor(20000).tier).toBe("Full report");
    expect(depthFor(20000).points).toBe(14);
  });

  it("is monotonic — more words never means fewer points", () => {
    const sizes = [50, 300, 1500, 5000, 15000, 50000];
    let last = 0;
    for (const n of sizes) {
      const d = depthFor(n);
      expect(d.points).toBeGreaterThanOrEqual(last);
      last = d.points;
    }
  });
});

describe("scanDocument — core contract", () => {
  it("returns a tier and never throws on empty input", () => {
    const result = scanDocument("");
    expect(result.points).toEqual([]);
    expect(result.details).toEqual([]);
    expect(result.tier).toBeTruthy();
  });

  it("returns everything as points when the document is shorter than the target depth", () => {
    const short = "This is one short sentence about a topic. Here is a second short sentence too.";
    const result = scanDocument(short, "auto", "Topic");
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.details).toEqual([]);
  });

  it("honors an explicit point count instead of silently falling back to auto", () => {
    // Regression test: a real bug found in audit #3 — five of six call
    // sites in the Workbench silently ignored the user's dropdown choice
    // and always ran at "auto" depth.
    //
    // IMPORTANT: two earlier versions of this test used "realistic" sentences
    // that turned out to still share enough vocabulary for the (correct)
    // redundancy filter to collapse them — that was a flawed test, not an
    // engine bug, but it was flawed on eyeballing alone, twice.
    //
    // This version removes all ambiguity: every sentence is built from
    // per-index tokens ("alpha0 beta0 gamma0..." for sentence 0, "alpha1
    // beta1 gamma1..." for sentence 1, etc.). Because the numeric suffix
    // differs, NO token can ever appear in more than one sentence — overlap
    // between any two sentences is exactly 0 by construction, not by
    // estimation, so the redundancy filter can never reject a candidate and
    // the test is verifying only the thing it's meant to verify: whether
    // the requested point count is honored.
    const sentences = Array.from(
      { length: 30 },
      (_, i) => `Alpha${i} beta${i} gamma${i} delta${i} epsilon${i} zeta${i} eta${i}.`
    );
    const long = sentences.join(" ");
    const auto = scanDocument(long, "auto", "Numbered test fixture");
    const forced = scanDocument(long, 12, "Numbered test fixture");
    expect(forced.points.length).toBe(12);
    expect(forced.points.length).not.toBe(auto.points.length);
  });

  it("produces distinct main points with no pair sharing >55% of vocabulary", () => {
    const result = scanDocument(ARTICLE, 5, TITLE);
    for (let i = 0; i < result.points.length; i++) {
      for (let j = i + 1; j < result.points.length; j++) {
        const a = new Set(tokenize(result.points[i]));
        const b = new Set(tokenize(result.points[j]));
        const shared = [...a].filter((w) => b.has(w)).length;
        const ratio = shared / Math.min(a.size, b.size || 1);
        expect(ratio).toBeLessThanOrEqual(0.55);
      }
    }
  });

  it("keeps points in original reading order, not score order", () => {
    const result = scanDocument(ARTICLE, 5, TITLE);
    const indices = result.points.map((p) => ARTICLE.indexOf(p.slice(0, 30)));
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });

  it("never lets details duplicate a main point", () => {
    const result = scanDocument(ARTICLE, 5, TITLE);
    for (const d of result.details) {
      expect(result.points).not.toContain(d);
    }
  });

  it("flags capped=true only when the sentence count exceeds MAX_SENTENCES", () => {
    const sentence = "The quarterly report showed steady growth across every major business segment. ";
    const huge = sentence.repeat(MAX_SENTENCES + 50);
    const result = scanDocument(huge, 10, "Report");
    expect(result.capped).toBe(true);
  });

  it("does not flag capped for a normal-length article", () => {
    const result = scanDocument(ARTICLE, 5, TITLE);
    expect(result.capped).toBe(false);
  });
});

describe("scanDocument — variance / Shuffle safety", () => {
  it("clamps variance so scores can never go non-positive or unstable", () => {
    // Regression test: audit #3 found unbounded Shuffle-click growth could
    // eventually swing scores negative. Even an absurdly large variance
    // must not break the contract — it should still return valid points.
    for (const v of [0, 1, 3.5, 10, 1000, -5]) {
      const result = scanDocument(ARTICLE, 5, TITLE, 14, v);
      expect(result.points.length).toBeGreaterThan(0);
      expect(result.points.every((p) => typeof p === "string" && p.length > 0)).toBe(true);
    }
  });

  it("with variance=0, results are fully deterministic across repeated runs", () => {
    const a = scanDocument(ARTICLE, 5, TITLE, 14, 0);
    const b = scanDocument(ARTICLE, 5, TITLE, 14, 0);
    expect(a.points).toEqual(b.points);
    expect(a.details).toEqual(b.details);
  });
});

describe("wordCount / readTime", () => {
  it("counts words and estimates a sane reading time", () => {
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("")).toBe(0);
    expect(readTime("word ".repeat(220))).toBe(1);
    expect(readTime("word ".repeat(440))).toBe(2);
  });
});
