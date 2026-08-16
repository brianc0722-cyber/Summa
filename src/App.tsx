import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bolt,
  Check,
  Copy,
  Download,
  ExternalLink,
  MonitorDown,
  ShieldCheck,
  Globe,
  GitBranch,
  Package,
  FolderOpen,
  Upload,
  Link2,
  FileUp,
  Sparkles,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Compass,
  ChevronDown,
  Newspaper,
  Mail,
  RefreshCw,
  PenLine,
  ArrowLeftRight,
} from "lucide-react";
// ?raw gives us the exact file contents at build time — byte-for-byte,
// so users can download engine source instead of hand-copying it.
import summarizeSrc from "./lib/summarize.ts?raw";
import bookmarkletSrc from "./lib/bookmarkletSource.ts?raw";
import { WIDGET_SOURCE, buildBookmarkletHref } from "./lib/bookmarkletSource";
import { buildExtensionZip } from "./lib/extensionBundle";
import { readTime, scanDocument, wordCount } from "./lib/summarize";
import JSZip from "jszip";

/* ---------------- Reveal-on-scroll (failsafe) ---------------- */

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const showAll = () => els.forEach((el) => el.classList.add("is-visible"));
    if (typeof IntersectionObserver === "undefined") {
      showAll();
      return;
    }
    try {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
              io.unobserve(e.target);
            }
          }),
        { threshold: 0.05, rootMargin: "0px 0px -32px 0px" }
      );
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("is-visible");
        else io.observe(el);
      });
      const failsafe = window.setTimeout(showAll, 3000);
      return () => {
        window.clearTimeout(failsafe);
        io.disconnect();
      };
    } catch {
      showAll();
    }
  }, []);
}

/* ---------------- Error boundary ---------------- */

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f1f3ee] p-6">
          <div className="max-w-md rounded-2xl border-2 border-[#0c1a16] bg-white p-8 text-center shadow-[10px_10px_0_#0c1a16]">
            <h1 className="font-display text-2xl font-extrabold">Something broke</h1>
            <p className="mt-2 text-sm text-[#0c1a16]/65">A reload usually clears it.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full bg-[#0f8a6d] px-5 py-2.5 font-semibold text-white hover:bg-[#0a5c49]"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Collapsible section wrapper ---------------- */

/**
 * Purely additive: wraps a section in a header bar that toggles visibility.
 * Nothing inside is modified, and state persists per-section across visits.
 */
function Collapsible({
  id,
  title,
  hint,
  tone = "light",
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  tone?: "light" | "dark";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`summa:sec:${id}`);
      if (saved !== null) setOpen(saved === "1");
    } catch {
      /* private mode — keep the default */
    }
    // Respond to the page-wide expand/collapse control.
    const onAll = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("summa:sections", onAll);
    return () => window.removeEventListener("summa:sections", onAll);
  }, [id]);

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(`summa:sec:${id}`, o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  };

  const dark = tone === "dark";

  return (
    <div className="mb-3">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className={`group flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
          dark
            ? "border-[#0c1a16] bg-[#0c1a16] text-[#f1f3ee] hover:bg-[#16302a]"
            : "border-[#0c1a16]/15 bg-white text-[#0c1a16] hover:border-[#0f8a6d]/60"
        }`}
      >
        <ChevronDown
          size={16}
          className={`flex-none transition-transform duration-200 ${open ? "" : "-rotate-90"} ${
            dark ? "text-[#e8a33d]" : "text-[#0f8a6d]"
          }`}
        />
        <span className="font-display text-sm font-extrabold tracking-tight sm:text-base">
          {title}
        </span>
        {hint && (
          <span
            className={`ml-auto hidden text-xs font-semibold sm:block ${
              dark ? "text-[#f1f3ee]/45" : "text-[#0c1a16]/45"
            }`}
          >
            {open ? hint : "click to expand"}
          </span>
        )}
      </button>
      <div id={`${id}-body`} hidden={!open} className={open ? "mt-4" : ""}>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Small copy button ---------------- */

function CopyButton({ text, label, dark }: { text: string; label: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
        dark
          ? "border border-[#f1f3ee]/25 text-[#f1f3ee]/70 hover:bg-[#f1f3ee]/10 hover:text-white"
          : "border border-[#0c1a16]/20 bg-white text-[#0c1a16] hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
      }`}
    >
      {copied ? <Check size={11} className="text-[#7fd4bd]" /> : <Copy size={11} />}
      {copied ? "Copied" : label}
    </button>
  );
}

/* ---------------- PWA install (advanced) ---------------- */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    if (window.matchMedia("(display-mode: standalone)").matches || nav.standalone) setInstalled(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onDone = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onDone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onDone);
    };
  }, []);

  const onClick = async () => {
    if (installed || !deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* dismissed */
    }
    setDeferred(null);
  };

  if (installed)
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0a5c49]">
        <ShieldCheck size={14} /> Installed
      </span>
    );
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0c1a16] px-3.5 py-1.5 text-xs font-bold transition-colors hover:bg-[#0c1a16] hover:text-[#f1f3ee]"
    >
      <MonitorDown size={13} /> {deferred ? "Install app" : "Install as app (Chrome/Edge menu)"}
    </button>
  );
}

/* ---------------- Sample article for the live test ---------------- */

const INITIAL_SAMPLE = {
  title: "How Machine Learning Is Quietly Rewriting Radiology",
  body: `Radiology departments around the world are facing an unprecedented workload. The number of imaging studies ordered each year has grown far faster than the supply of trained radiologists, leading to fatigue, burnout, and diagnostic delays. Into this gap stepped a new generation of machine learning models trained on millions of annotated scans. These systems do not replace radiologists; instead, they act as a tireless second reader, flagging subtle anomalies that a tired human eye might miss after a twelve-hour shift. In controlled trials, radiologists working alongside such models detected early-stage lung nodules at significantly higher rates than either the model or the physician alone. The most successful deployments treat the algorithm as a triage tool, pushing the most suspicious cases to the top of the worklist so that urgent patients are seen first. Skeptics rightly point out that models can inherit biases from their training data and may fail silently on equipment they have never seen. As a result, regulators now demand continuous monitoring and clear accountability for every automated suggestion. The emerging consensus is that the future of radiology is neither human nor machine, but a careful partnership in which each covers the other's blind spots.`,
};

/**
 * Every network call in Summa gets a hard deadline — an unresponsive
 * endpoint (Wikipedia, a reader proxy, an arbitrary URL the user pasted)
 * should never be able to leave a button spinning forever with no way out.
 * Hoisted to module scope so every fetch site shares one implementation
 * instead of each call site inventing its own (or, as found in a build
 * audit, some call sites having no timeout at all).
 */
function fetchWithTimeout(url: string, ms = 8000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    window.clearTimeout(timer)
  );
}

/* ---------------- Document extractors (loaded on demand from CDN) ---------------- */

const PASTE_WORD_CAP = 7500;
const scriptCache: Record<string, Promise<void>> = {};

function loadScript(src: string): Promise<void> {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Couldn't reach the parser CDN"));
      document.head.appendChild(s);
    }).catch((err) => {
      // Never cache a rejection — a flaky network would block every retry.
      delete scriptCache[src];
      throw err;
    });
  }
  return scriptCache[src];
}

async function extractPdf(file: File): Promise<string> {
  await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = (window as any).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text += content.items.map((it: any) => it.str || "").join(" ") + "\n";
  }
  return text;
}

async function extractDocx(file: File): Promise<string> {
  await loadScript("https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js");
  const mammoth = (window as unknown as { mammoth: { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } }).mammoth;
  const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return res.value;
}

/* ---------------- Insight layer (self-contained — no extra files to deploy) ---------------- */

export interface InsightSet {
  stats: { words: number; sentences: number; readMins: number };
  terms: { word: string; count: number }[];
  numbers: string[];
  tensions: string[];
  actions: string[];
  support: string[][];
}

const INS_STOP = new Set(
  "a an and are as at be but by for from has have had he her his i if in into is it its of on or that the their there these they this to was we were what when which while who will with you your our us not no can could would should may might about over under after before between during".split(" ")
);
const insTokenize = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !INS_STOP.has(w));
const insSentences = (t: string) =>
  (t.replace(/\s+/g, " ").trim().match(/[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 6);

const TENSION_RE =
  /\b(however|but|yet|although|despite|warn|warns|critics|concern|concerns|risk|risks|fail|failed|threat|challenge|challenges|oppose|opposed|dispute)\b/i;
const ACTION_RE =
  /\b(will|must|should|plan|plans|planned|propose|proposed|proposal|recommend|recommends|expected|expects|aims|aim|seek|seeks|announce|announced|announces|intend|intends|next|future)\b/i;
const NUMBER_RE = /%|\$|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s*(percent|million|billion|thousand|trillion)\b|\b\d{2,}\b/i;

function deriveInsights(text: string, points: string[], details: string[]): InsightSet {
  const all = insSentences(text);
  const words = wordCount(text);

  const freq = new Map<string, number>();
  for (const w of insTokenize(text)) freq.set(w, (freq.get(w) || 0) + 1);
  const terms = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  const support = points.map((p) => {
    const pSet = new Set(insTokenize(p));
    return details
      .map((d) => {
        let n = 0;
        for (const w of insTokenize(d)) if (pSet.has(w)) n++;
        return { d, n };
      })
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2)
      .map((x) => x.d);
  });

  const pick = (re: RegExp, cap: number) => all.filter((s) => re.test(s)).slice(0, cap);

  return {
    stats: { words, sentences: all.length, readMins: Math.max(1, Math.round(words / 220)) },
    terms,
    numbers: pick(NUMBER_RE, 4),
    tensions: pick(TENSION_RE, 3),
    actions: pick(ACTION_RE, 3),
    support,
  };
}

/* ---------------- Workbench samples ---------------- */

const WB_SAMPLES: Record<string, { label: string; icon: typeof Newspaper; title: string; body: string }> = {
  news: { label: "News article", icon: Newspaper, title: INITIAL_SAMPLE.title, body: INITIAL_SAMPLE.body },
  report: {
    label: "Data report",
    icon: BarChart3,
    title: "Q3 Infrastructure Report",
    body: `The regional transit authority closed the third quarter with 41.2 million boardings, a 6.8 percent increase over the same period last year and the strongest result since 2019. Farebox recovery reached 54 percent, up from 47 percent, driven primarily by the return of weekday commuters to the downtown core. On-time performance, however, declined to 82.4 percent, the lowest figure in nine quarters. The deterioration concentrated on the two busiest rail lines, where aging signal equipment caused 312 separate delays totaling 1,840 minutes of lost service time. Maintenance spending rose 18 percent to $96 million, yet the backlog of deferred repairs grew to $1.4 billion, up from $1.2 billion at the start of the year. Ridership surveys show 68 percent of passengers rate cleanliness as good or excellent, while only 41 percent say the same about reliability. The board will consider a fare adjustment of between 3 and 5 percent at its December meeting, though three members have publicly opposed any increase before service quality improves. A federal grant of $220 million for signal modernization remains pending, with a decision expected before the end of the fiscal year. Without it, officials warn that on-time performance could fall below 80 percent by next summer.`,
  },
  email: {
    label: "Email thread",
    icon: Mail,
    title: "Re: Launch timeline",
    body: `Thanks for the update, team. I want to flag a few things before we commit to the March 14 launch. The payments integration is still failing intermittently in staging — roughly 1 in 40 transactions — and the vendor says a fix is at least two weeks out. Marketing has already scheduled the announcement email for March 12, so slipping means re-coordinating with three external partners. That said, the beta cohort of 240 users gave the new onboarding flow a 4.6 out of 5 satisfaction score, and support tickets from beta dropped 30 percent week over week, which tells me the core product is genuinely ready. My recommendation: keep the March 14 date for the product launch, but gate payments behind a waitlist for the first two weeks and offer those users three months free as compensation. Please review the attached risk table and reply with your vote by Thursday at 5pm so we can brief leadership on Friday. Thanks, Dana`,
  },
};

/* ---------------- Workbench ---------------- */

type WbMode = "paste" | "url" | "file";

/** NaturalWrite is a separate app — we only ever link out to it. */
const NATURALWRITE_URL = "https://naturalwrite-nu.vercel.app";

interface WbResult {
  title: string;
  points: string[];
  details: string[];
  folded: number;
  tier: string;
  insights: InsightSet;
}

/** Structured Markdown export — good for notes apps, docs, and drafting. */
function toMarkdown(r: WbResult, source?: string | null): string {
  const L: string[] = [`# ${r.title}`, ""];
  if (source) L.push(`*Source: ${source}*`, "");
  L.push(
    `*${r.tier} · ${r.insights.stats.words.toLocaleString()} words · ${r.insights.stats.readMins} min read*`,
    "",
    "## Main points",
    ""
  );
  r.points.forEach((p, i) => L.push(`${i + 1}. ${p}`));
  if (r.details.length) {
    L.push("", "## Full summary", "", r.details.join(" "));
    if (r.folded) L.push("", `*(+${r.folded} more supporting sentences folded in.)*`);
  }
  if (r.insights.numbers.length) {
    L.push("", "## By the numbers", "");
    r.insights.numbers.forEach((s) => L.push(`- ${s}`));
  }
  if (r.insights.tensions.length) {
    L.push("", "## Tensions & turning points", "");
    r.insights.tensions.forEach((s) => L.push(`- ${s}`));
  }
  if (r.insights.actions.length) {
    L.push("", "## What comes next", "");
    r.insights.actions.forEach((s) => L.push(`- ${s}`));
  }
  if (r.insights.terms.length) {
    L.push("", "## Themes", "", r.insights.terms.map((t) => t.word).join(" · "));
  }
  return L.join("\n");
}

/** A drafting brief — phrased for writing from, not just reading. */
function toDraftBrief(r: WbResult, source?: string | null): string {
  const L: string[] = [`Topic: ${r.title}`];
  if (source) L.push(`Source: ${source}`);
  L.push("", "Key points to cover:");
  r.points.forEach((p, i) => L.push(`${i + 1}. ${p}`));
  if (r.insights.numbers.length) {
    L.push("", "Supporting facts and figures:");
    r.insights.numbers.forEach((s) => L.push(`- ${s}`));
  }
  if (r.insights.tensions.length) {
    L.push("", "Counterpoints to address:");
    r.insights.tensions.forEach((s) => L.push(`- ${s}`));
  }
  if (r.insights.terms.length) {
    L.push("", `Themes: ${r.insights.terms.slice(0, 6).map((t) => t.word).join(", ")}`);
  }
  return L.join("\n");
}

function Workbench() {
  const [mode, setMode] = useState<WbMode>("paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [urlState, setUrlState] = useState<"idle" | "loading" | "error">("idle");
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [targetPoints, setTargetPoints] = useState<number | "auto">("auto");
  const [variance, setVariance] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [result, setResult] = useState<WbResult | null>(null);
  const [history, setHistory] = useState<{ title: string; tier: string; words: number; text: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("summa:wb:history");
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const pushHistory = (title: string, tier: string, words: number, text: string) => {
    setHistory((prev) => {
      const next = [{ title, tier, words, text: text.slice(0, 20000) }, ...prev.filter((h) => h.title !== title)].slice(0, 5);
      try {
        localStorage.setItem("summa:wb:history", JSON.stringify(next));
      } catch {
        /* quota or private mode — history is best-effort */
      }
      return next;
    });
  };

  const flash = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const [speaking, setSpeaking] = useState(false);
  const speechKeepAlive = useRef<number | null>(null);

  const stopReading = () => {
    if (speechKeepAlive.current !== null) {
      window.clearInterval(speechKeepAlive.current);
      speechKeepAlive.current = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const readAloud = (points: string[], details: string[]) => {
    if (!("speechSynthesis" in window)) {
      alert("Your browser does not support text-to-speech.");
      return;
    }
    // Acts as a toggle: clicking Listen again while it's already reading
    // should stop it, not stack a second utterance on top.
    if (speaking) {
      stopReading();
      return;
    }

    window.speechSynthesis.cancel();

    let t = "Main points. " + points.join(" ");
    if (details.length > 0) t += " Full summary. " + details.join(" ");
    const u = new SpeechSynthesisUtterance(t);
    u.onend = stopReading;
    u.onerror = stopReading;

    // Chrome bug #1: calling speak() in the same tick as cancel() can be a
    // silent no-op — especially right after a page refresh, before the
    // speech engine has actually reset. A short delay makes it reliable.
    window.setTimeout(() => {
      window.speechSynthesis.speak(u);
      setSpeaking(true);
      // Chrome bug #2: utterances longer than ~15s get silently cut off
      // unless something keeps nudging the engine. Pausing/resuming on an
      // interval is the standard workaround for long text like a summary.
      speechKeepAlive.current = window.setInterval(() => {
        if (!window.speechSynthesis.speaking) return;
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }, 10000);
    }, 60);
  };

  // Never leave the browser talking after the Workbench itself goes away.
  useEffect(() => stopReading, []);

  const runAnalysis = (t: string, label: string, currentTarget: number | "auto" = "auto", currentVar = 0) => {
    setBusy(true);
    setExpanded(null);
    // Any re-analysis (Shuffle, points-count change, a new document) should
    // never leave narration of the previous result talking over new points
    // — routed through stopReading() so the Listen/Stop button state and
    // the keep-alive interval both stay in sync with reality.
    stopReading();
    // A fresh document should always start from a clean baseline — only the
    // explicit Shuffle button should accumulate variance from here on.
    setVariance(currentVar);
    window.setTimeout(() => {
      const scan = scanDocument(t, currentTarget, label, 14, currentVar);
      const ins = deriveInsights(t, scan.points, scan.details);
      setResult({
        title: label,
        points: scan.points,
        details: scan.details,
        folded: scan.folded,
        tier: scan.tier,
        insights: ins,
      });
      pushHistory(label, scan.tier, ins.stats.words, t);
      setRunKey((k) => k + 1);
      setBusy(false);
    }, 650);
  };

  const runFromText = () => {
    if (text.trim().length < 120) return;
    setSource(null);
    runAnalysis(text, "Pasted material", targetPoints, 0);
  };

  const runFromUrl = async (targetUrl?: string) => {
    let u = (targetUrl ?? url).trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    if (targetUrl) setUrl(u);
    setUrlState("loading");
    setProxyUrl(null);
    setErrMsg(null);
    try {
      // Wikipedia gets first-class treatment: pull the full plain-text
      // article through the open MediaWiki API (CORS-enabled) for a
      // clean, complete read instead of scraping page chrome.
      const parsed = new URL(u);
      const parts = parsed.hostname.split(".");
      const isWiki =
        parts.length >= 3 &&
        parts[parts.length - 2] === "wikipedia" &&
        parts[parts.length - 1] === "org" &&
        parsed.pathname.startsWith("/wiki/");
      if (isWiki) {
        const first = parts[0];
        const lang = parts.length >= 4 && first !== "m" && first !== "www" ? first : "en";
        const title = decodeURIComponent(parsed.pathname.slice("/wiki/".length));
        const api =
          `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts` +
          `&explaintext=1&redirects=1&format=json&origin=*` +
          `&titles=${encodeURIComponent(title)}`;
        const wr = await fetchWithTimeout(api);
        if (!wr.ok) throw new Error("http");
        const json = (await wr.json()) as {
          query?: { pages?: Record<string, { extract?: string; title?: string }> };
        };
        const page = Object.values(json.query?.pages ?? {})[0];
        let t = (page?.extract || "").replace(/\s+/g, " ").trim();
        let outTitle = (page?.title || title).replace(/_/g, " ");
        if (t.length < 200) {
          // Fallback: the REST summary endpoint (also CORS-open).
          const rr = await fetchWithTimeout(
            `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          );
          if (rr.ok) {
            const rj = (await rr.json()) as { extract?: string; title?: string };
            t = (rj.extract || "").replace(/\s+/g, " ").trim();
            outTitle = rj.title || outTitle;
          }
        }
        if (t.length < 200)
          throw new Error("Wikipedia returned almost no text — check that the article title exists.");
        setText(t);
        setSource(u);
        setUrlState("idle");
        runAnalysis(t, outTitle, targetPoints, 0);
        return;
      }
      const res = await fetchWithTimeout(u);
      if (!res.ok) throw new Error("http");
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,style,noscript,nav,footer,aside").forEach((n) => n.remove());
      const t = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 200) throw new Error("thin");
      setText(t);
      setSource(u);
      setUrlState("idle");
      runAnalysis(t, parsed.hostname.replace(/^www\./, ""), targetPoints, 0);
    } catch (e) {
      setErrMsg(e instanceof Error && e.message ? e.message : "fetch failed");
      setProxyUrl(u);
      setUrlState("error");
    }
  };

  // Opt-in fallback for sites that block browser-only fetching: a public
  // reader proxy. Explicitly consented because the URL leaves the machine.
  const runViaProxy = async () => {
    if (!proxyUrl) return;
    setUrlState("loading");
    try {
      const res = await fetchWithTimeout(`https://r.jina.ai/${proxyUrl}`, 12000);
      if (!res.ok) throw new Error("http");
      let t = await res.text();
      t = t
        .replace(/^Title:.*$/im, "")
        .replace(/^URL Source:.*$/im, "")
        .replace(/^Markdown Content:/im, "")
        .replace(/[#>*`[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (t.length < 200) throw new Error("thin");
      setText(t);
      setSource(proxyUrl + " (via reader)");
      setUrlState("idle");
      setProxyUrl(null);
      runAnalysis(t, new URL(proxyUrl).hostname.replace(/^www\./, ""), targetPoints, 0);
    } catch (e) {
      setErrMsg(e instanceof Error && e.message ? e.message : "reader failed");
      setUrlState("error");
      setProxyUrl(null);
    }
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setErrMsg(null);
    try {
      let t: string;
      // Route binary formats through the real parsers — readAsText on a PDF
      // produces binary noise that looks like a valid (but nonsense) summary.
      if (/\.pdf$/i.test(f.name)) t = await extractPdf(f);
      else if (/\.docx$/i.test(f.name)) t = await extractDocx(f);
      else if (/\.(txt|md|markdown|text|html?|csv|json)$/i.test(f.name)) {
        t = await f.text();
        if (/\.html?$/i.test(f.name)) {
          t = t
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ");
        }
      } else {
        throw new Error(
          "Unsupported file type — use .txt, .md, .html, .pdf, or .docx."
        );
      }
      t = t.replace(/\s+/g, " ").trim();
      if (t.length < 120)
        throw new Error("No readable text found (a scanned-image PDF has none).");
      setText(t);
      setSource(f.name);
      runAnalysis(t, f.name, targetPoints, 0);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const ins = result?.insights;

  const insightCards = ins
    ? [
        {
          icon: BarChart3,
          tone: "text-[#0a5c49] bg-[#0f8a6d]/12 border-[#0f8a6d]/40",
          title: "By the numbers",
          sub: "The figures that anchor this material",
          items: ins.numbers,
          empty: "No concrete figures detected.",
        },
        {
          icon: AlertTriangle,
          tone: "text-[#a86f1a] bg-[#e8a33d]/12 border-[#e8a33d]/50",
          title: "Tensions & turning points",
          sub: "Where the story pushes back on itself",
          items: ins.tensions,
          empty: "No competing forces flagged.",
        },
        {
          icon: TrendingUp,
          tone: "text-[#2f5fb8] bg-[#4a90e0]/10 border-[#4a90e0]/40",
          title: "What comes next",
          sub: "Forward-looking moves and intentions",
          items: ins.actions,
          empty: "No forward-looking statements found.",
        },
      ]
    : [];

  return (
    <section id="workbench" className="reveal pb-20">
      <Collapsible
        id="workbench"
        tone="dark"
        title="The Workbench — analyze your own material"
        hint="paste · URL · upload"
      >
      <div className="overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-white shadow-[10px_10px_0_#0c1a16]">
        {/* Console header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#0c1a16] bg-[#0c1a16] px-6 py-5 sm:px-8">
          <div>
            <p className="mb-1 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#e8a33d]">
              <Sparkles size={12} fill="currentColor" /> The Workbench
            </p>
            <h2 className="font-display text-2xl font-extrabold text-[#f1f3ee] sm:text-3xl">
              Bring your own material
            </h2>
          </div>
          <p className="max-w-xs text-xs leading-relaxed text-[#f1f3ee]/60">
            Paste a report, drop a transcript, or feed a URL — Summa returns the points, the full
            summary, and derived insights. All on this page; the extension is untouched.
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_1.15fr]">
          {/* Input side */}
          <div className="border-b-2 border-[#0c1a16] p-6 sm:p-7 lg:border-b-0 lg:border-r-2">
            <div className="mb-4 flex gap-1.5">
              {(
                [
                  { id: "paste", label: "Paste text", icon: Upload },
                  { id: "url", label: "From URL", icon: Link2 },
                  { id: "file", label: "Upload file", icon: FileUp },
                ] as { id: WbMode; label: string; icon: typeof Upload }[]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setMode(t.id);
                    setUrlState("idle");
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    mode === t.id
                      ? "bg-[#0c1a16] text-[#f1f3ee] shadow-sm"
                      : "bg-[#f7f9f5] text-[#0c1a16]/60 hover:bg-[#eef1ea] hover:text-[#0c1a16]"
                  }`}
                >
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>

            {mode === "paste" && (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={9}
                  placeholder="Paste an article, report, transcript, email thread — anything with words in it…"
                  className="w-full resize-y rounded-xl border border-[#0c1a16]/20 bg-[#f7f9f5] p-4 text-sm leading-relaxed text-[#0c1a16]/80 outline-none transition focus:border-[#0f8a6d] focus:ring-4 focus:ring-[#0f8a6d]/15"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0c1a16]/45">
                    Try a sample:
                  </span>
                  {Object.entries(WB_SAMPLES).map(([k, s]) => (
                    <button
                      key={k}
                      onClick={() => {
                        setText(s.body);
                        setSource(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#0c1a16]/20 bg-white px-3 py-1 text-xs font-semibold text-[#0c1a16]/70 transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                    >
                      <s.icon size={11} /> {s.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={runFromText}
                  disabled={text.trim().length < 120}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f8a6d] py-3.5 font-bold text-white shadow-[0_10px_26px_rgba(15,138,109,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#0a5c49] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  <Sparkles size={16} /> Analyze & generate insights
                </button>
              </>
            )}

            {mode === "url" && (
              <>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runFromUrl()}
                    type="url"
                    placeholder="https://en.wikipedia.org/wiki/…"
                    className="flex-1 rounded-xl border border-[#0c1a16]/20 bg-[#f7f9f5] px-4 py-3 text-sm outline-none transition focus:border-[#0f8a6d] focus:ring-4 focus:ring-[#0f8a6d]/15"
                  />
                  <button
                    onClick={() => runFromUrl()}
                    disabled={!url.trim() || urlState === "loading"}
                    className="rounded-xl bg-[#0f8a6d] px-5 font-bold text-white transition-all hover:bg-[#0a5c49] disabled:opacity-40"
                  >
                    {urlState === "loading" ? "…" : "Fetch"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0c1a16]/45">
                    Try:
                  </span>
                  {[
                    ["Attention (ML)", "https://en.wikipedia.org/wiki/Attention_(machine_learning)"],
                    ["Photosynthesis", "https://en.wikipedia.org/wiki/Photosynthesis"],
                    ["Roman roads", "https://en.wikipedia.org/wiki/Roman_roads"],
                  ].map(([label, link]) => (
                    <button
                      key={link}
                      onClick={() => runFromUrl(link)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#0c1a16]/20 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0c1a16]/65 transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                    >
                      <Globe size={10} /> {label}
                    </button>
                  ))}
                </div>
                {urlState === "error" && (
                  <div className="mt-3 rounded-lg border-l-4 border-[#e8695a] bg-[#e8695a]/10 p-3">
                    <p className="text-xs leading-relaxed text-[#b3402f]">
                      That site blocks browser-only fetching (or needs JavaScript to render). You
                      can paste its text instead, use the extension's <strong>From URL</strong> —
                      extensions bypass this limit — or try the public reader below.
                    </p>
                    {errMsg && (
                      <p className="mt-1.5 font-mono text-[10px] text-[#b3402f]/75">
                        detail: {errMsg}
                      </p>
                    )}
                    {proxyUrl && (
                      <button
                        onClick={runViaProxy}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#b3402f] px-3.5 py-1.5 text-[11px] font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#8f2f22]"
                      >
                        <Globe size={11} /> Retry via public reader
                      </button>
                    )}
                    {proxyUrl && (
                      <p className="mt-1.5 text-[10px] text-[#b3402f]/80">
                        Sends the URL to r.jina.ai to fetch a readable copy — use only for public
                        pages you're comfortable sharing.
                      </p>
                    )}
                  </div>
                )}
                <p className="mt-3 text-xs leading-relaxed text-[#0c1a16]/55">
                  Wikipedia links get the full article text via its open API — any language edition
                  works, including mobile and bare domains. Other open sources fetch directly with
                  nothing leaving your machine; locked-down sites offer the opt-in reader above.
                </p>
              </>
            )}

            {mode === "file" && (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#0c1a16]/25 bg-[#f7f9f5] px-6 py-12 text-center transition-all hover:border-[#0f8a6d] hover:bg-[#0f8a6d]/5">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0f8a6d]/12 text-[#0a5c49]">
                  <FileUp size={22} />
                </span>
                <span className="text-sm font-bold text-[#0c1a16]">
                  Drop a .txt, .md, or .html file
                </span>
                <span className="text-xs text-[#0c1a16]/50">
                  .txt · .md · .html · .pdf · .docx — read instantly, never uploaded.
                </span>
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.text,.html,.htm,.pdf,.docx"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
              </label>
            )}

            {mode === "file" && errMsg && (
              <p className="mt-3 rounded-lg border-l-4 border-[#e8695a] bg-[#e8695a]/10 p-3 text-xs leading-relaxed text-[#b3402f]">
                {errMsg}
              </p>
            )}

            {source && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#0f8a6d]">
                <Link2 size={12} /> Source: <span className="truncate">{source}</span>
              </p>
            )}

            {/* Recent scans */}
            {history.length > 0 && (
              <div className="mt-5 border-t border-[#0c1a16]/10 pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0c1a16]/45">
                  <RefreshCw size={11} /> Recent scans
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setText(h.text);
                        setSource(h.title);
                        runAnalysis(h.text, h.title, targetPoints, 0);
                      }}
                      title={`${h.words.toLocaleString()} words · ${h.tier}`}
                      className="max-w-[190px] truncate rounded-full border border-[#0c1a16]/15 bg-[#f7f9f5] px-3 py-1 text-[11px] font-semibold text-[#0c1a16]/65 transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                    >
                      {h.title}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setHistory([]);
                      try {
                        localStorage.removeItem("summa:wb:history");
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-[#0c1a16]/35 transition-colors hover:text-[#b3402f]"
                  >
                    clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results side */}
          <div className="relative min-h-[420px] bg-[#f7f9f5] p-6 sm:p-7">
            {busy && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#f7f9f5]/90">
                <div className="h-1 w-48 overflow-hidden rounded-full bg-[#0c1a16]/10">
                  <div className="h-full w-1/2 rounded-full bg-[#0f8a6d]" style={{ animation: "wb-slide 1.1s ease-in-out infinite" }} />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0c1a16]/50">
                  Scanning & deriving insights…
                </p>
              </div>
            )}

            {!result && !busy && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0c1a16] text-[#e8a33d]">
                  <Compass size={26} />
                </span>
                <div>
                  <p className="font-display text-lg font-extrabold text-[#0c1a16]">
                    Your analysis lands here
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-[#0c1a16]/55">
                    5 main points, a full non-redundant summary, and four insight angles —
                    expanded point by point.
                  </p>
                </div>
              </div>
            )}

            {result && !busy && (
              <div key={runKey} className="space-y-6">
                {/* Stats */}
                <div className="point-in flex flex-wrap gap-2" style={{ animationDelay: "0.05s" }}>
                  <span className="rounded-full bg-[#0c1a16] px-3 py-1 text-xs font-extrabold text-[#e8a33d] shadow-sm">
                    {result.tier}
                  </span>
                  {[
                    [`${ins!.stats.words.toLocaleString()}`, "words"],
                    [`${ins!.stats.sentences}`, "sentences"],
                    [`${ins!.stats.readMins} min`, "read time"],
                    [`${result.points.length}`, "main points"],
                  ].map(([v, l]) => (
                    <span key={l} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0c1a16]/70 shadow-sm">
                      <span className="font-display text-sm font-extrabold text-[#0f8a6d]">{v}</span>{" "}
                      {l}
                    </span>
                  ))}
                </div>

                {/* Points with expand */}
                <ol className="space-y-2.5">
                  {result.points.map((p, i) => (
                    <li key={i} className="point-in" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                      <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="group flex w-full items-start gap-3 rounded-xl border border-[#0c1a16]/10 bg-white p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d]/50 hover:shadow-md"
                      >
                        <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#0c1a16] text-xs font-extrabold text-[#e8a33d]">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm font-medium leading-relaxed text-[#0c1a16]/85">
                          {p}
                        </span>
                        <ChevronDown
                          size={15}
                          className={`mt-1 flex-none text-[#0c1a16]/35 transition-transform group-hover:text-[#0f8a6d] ${
                            expanded === i ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {expanded === i && (
                        <div className="panel-in ml-9 mt-2 rounded-xl border-l-4 border-[#0f8a6d] bg-[#0f8a6d]/8 p-3.5">
                          {result.insights.support[i]?.length ? (
                            <>
                              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0a5c49]">
                                Supporting context
                              </p>
                              <ul className="space-y-1.5">
                                {result.insights.support[i].map((s, j) => (
                                  <li key={j} className="text-xs leading-relaxed text-[#0c1a16]/70">
                                    • {s}
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : (
                            <p className="text-xs italic text-[#0c1a16]/50">
                              No additional supporting sentences — this point stands on its own.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>

                {/* Insight cards */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {insightCards.map((c, i) => (
                    <div
                      key={c.title}
                      className={`point-in rounded-xl border p-4 transition-transform hover:-translate-y-1 ${c.tone}`}
                      style={{ animationDelay: `${0.8 + i * 0.12}s` }}
                    >
                      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em]">
                        <c.icon size={13} /> {c.title}
                      </p>
                      {c.items.length ? (
                        <ul className="space-y-1.5">
                          {c.items.map((s, j) => (
                            <li key={j} className="text-[11px] leading-relaxed text-[#0c1a16]/75">
                              • {s.length > 140 ? s.slice(0, 140) + "…" : s}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] italic text-[#0c1a16]/45">{c.empty}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Themes */}
                <div className="point-in" style={{ animationDelay: "1.15s" }}>
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0c1a16]/50">
                    Dominant themes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ins!.terms.map((t) => (
                      <span
                        key={t.word}
                        className="rounded-full bg-[#0c1a16] px-2.5 py-1 text-[11px] font-bold text-[#f1f3ee]"
                        style={{ opacity: 0.5 + Math.min(0.5, t.count / 12) }}
                      >
                        {t.word} <span className="text-[#e8a33d]">{t.count}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Full summary */}
                {result.details.length > 0 && (
                  <div className="point-in rounded-xl border border-[#e8a33d]/50 bg-[#e8a33d]/10 p-4" style={{ animationDelay: "1.3s" }}>
                    <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a86f1a]">
                      Full summary — everything else that matters
                    </p>
                    <p className="text-justify text-sm leading-relaxed text-[#0c1a16]/75">
                      {result.details.join(" ")}
                    </p>
                    {result.folded > 0 && (
                      <p className="mt-2 text-xs italic text-[#0c1a16]/50">
                        +{result.folded} more supporting sentences folded in.
                      </p>
                    )}
                  </div>
                )}

                {/* Export & handoff */}
                <div className="point-in rounded-xl border border-[#0c1a16]/15 bg-white p-4" style={{ animationDelay: "1.4s" }}>
                  <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#0c1a16]/10 pb-4">
                    <label className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0c1a16]/50">
                      Points:
                    </label>
                    <select
                      value={targetPoints}
                      onChange={(e) => {
                        const val = e.target.value === "auto" ? "auto" : parseInt(e.target.value, 10);
                        setTargetPoints(val);
                        if (text && source) runAnalysis(text, source, val, variance);
                      }}
                      className="rounded-lg border border-[#0c1a16]/15 bg-[#f7f9f5] px-2 py-1 text-xs font-semibold text-[#0c1a16] focus:border-[#0f8a6d] focus:outline-none"
                    >
                      <option value="auto">Auto</option>
                      {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => (
                        <option key={n} value={n}>
                          {n} pts
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (text && source) {
                          // Cycle rather than climb forever — bounds the
                          // escalation instead of letting it grow unbounded.
                          const nextVar = variance + 1.2 > 3.5 ? 0.8 : variance + 1.2;
                          runAnalysis(text, source, targetPoints, nextVar);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#0c1a16]/20 bg-[#f7f9f5] px-3 py-1.5 text-xs font-bold text-[#0c1a16] transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d] disabled:opacity-50 disabled:pointer-events-none"
                      title="Generates a fresh summary by preferring slightly different sentences."
                    >
                      <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Shuffle
                    </button>
                    <button
                      onClick={() => readAloud(result.points, result.details)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5 ${
                        speaking
                          ? "border-[#0f8a6d] bg-[#0f8a6d]/10 text-[#0f8a6d]"
                          : "border-[#0c1a16]/20 bg-[#f7f9f5] text-[#0c1a16] hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                      }`}
                      title={speaking ? "Stop reading" : "Read aloud via Text-to-Speech"}
                    >
                      <Sparkles size={12} className={speaking ? "animate-pulse" : ""} />
                      {speaking ? "Stop" : "Listen"}
                    </button>
                  </div>
                  
                  <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0c1a16]/50">
                    Take it with you
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(toMarkdown(result, source));
                        flash("md");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#0c1a16]/20 bg-[#f7f9f5] px-3 py-2 text-xs font-bold text-[#0c1a16] transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                    >
                      {copied === "md" ? <Check size={13} className="text-[#0f8a6d]" /> : <Copy size={13} />}
                      {copied === "md" ? "Copied!" : "Copy Markdown"}
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([toMarkdown(result, source)], { type: "text/markdown" });
                        const u = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = u;
                        a.download = `${result.title.replace(/[^\w.-]+/g, "-").slice(0, 60)}-summary.md`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.setTimeout(() => URL.revokeObjectURL(u), 4000);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#0c1a16]/20 bg-[#f7f9f5] px-3 py-2 text-xs font-bold text-[#0c1a16] transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                    >
                      <Download size={13} /> Download .md
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          result.points.map((p, i) => `${i + 1}. ${p}`).join("\n")
                        );
                        flash("pts");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#0c1a16]/20 bg-[#f7f9f5] px-3 py-2 text-xs font-bold text-[#0c1a16] transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                    >
                      {copied === "pts" ? <Check size={13} className="text-[#0f8a6d]" /> : <Copy size={13} />}
                      {copied === "pts" ? "Copied!" : "Copy points only"}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(toDraftBrief(result, source));
                        flash("nw");
                        window.setTimeout(() => window.open(NATURALWRITE_URL, "_blank", "noopener"), 350);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#2f4a80] px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#22345c]"
                      title="Copies a drafting brief, then opens NaturalWrite"
                    >
                      {copied === "nw" ? <Check size={13} /> : <PenLine size={13} />}
                      {copied === "nw" ? "Brief copied — opening…" : "Draft in NaturalWrite"}
                    </button>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-[#0c1a16]/50">
                    The draft button copies a writing brief — points, figures, and counterpoints —
                    then opens NaturalWrite in a new tab so you can paste and start writing.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </Collapsible>
    </section>
  );
}

/* ---------------- Site ---------------- */

function Site() {
  useReveal();
  const bookmarkletHref = useMemo(() => {
    try {
      return buildBookmarkletHref();
    } catch {
      return "";
    }
  }, []);

  const scriptValid = useMemo(() => {
    if (!bookmarkletHref) return false;
    try {
      new Function(decodeURIComponent(bookmarkletHref.replace("javascript:", "")));
      return true;
    } catch {
      return false;
    }
  }, [bookmarkletHref]);

  const [scanKey, setScanKey] = useState(0);
  const [allOpen, setAllOpen] = useState(true);

  // Live sample state
  const [sample, setSample] = useState(INITIAL_SAMPLE);
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  // Recomputes whenever a live trending article replaces the sample —
  // previously pinned to [] this silently kept showing the original
  // radiology article's points even after "Load live trending article".
  const { points, details, folded } = useMemo(
    () => scanDocument(sample.body, 5, sample.title),
    [sample]
  );

  const [sampleSource, setSampleSource] = useState<"mostread" | "worldnews">("mostread");
  const [sampleStale, setSampleStale] = useState(false);

  type LiveArticle = { title: string; body: string };
  const LIVE_CACHE_KEY = "summa:live-sample-cache";

  const readCache = (source: "mostread" | "worldnews"): LiveArticle | null => {
    try {
      const raw = localStorage.getItem(LIVE_CACHE_KEY + ":" + source);
      return raw ? (JSON.parse(raw) as LiveArticle) : null;
    } catch {
      return null;
    }
  };
  const writeCache = (source: "mostread" | "worldnews", article: LiveArticle) => {
    try {
      localStorage.setItem(LIVE_CACHE_KEY + ":" + source, JSON.stringify(article));
    } catch {
      /* private mode or full quota — caching is best-effort */
    }
  };

  // A small delay-based retry: transient network blips and momentary rate
  // limits are common on free public APIs, and most resolve within a
  // second or two. Retrying quietly here means the user only ever sees a
  // failure once every avenue has genuinely been exhausted.
  const withRetries = async <T,>(fn: () => Promise<T | null>, attempts = 2, delayMs = 700): Promise<T | null> => {
    for (let i = 0; i < attempts; i++) {
      const result = await fn();
      if (result) return result;
      if (i < attempts - 1) await new Promise((r) => window.setTimeout(r, delayMs * (i + 1)));
    }
    return null;
  };

  // Pull an article's plaintext straight from Wikipedia's own MediaWiki API
  // (CORS-enabled, official, no key). Deliberately avoids the third-party
  // CORS-proxy chain used elsewhere — those free public proxies rate-limit
  // or go offline often enough that they were the actual cause of this
  // feature failing outright, not the article sources themselves.
  //
  // Two independent endpoints are tried per title: the full-text "extracts"
  // API first, then the shorter REST summary API as a fallback — they're
  // operated separately enough that one being degraded doesn't take out
  // the other.
  const fetchWikipediaExtract = async (title: string): Promise<LiveArticle | null> => {
    try {
      const api =
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
        `&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`;
      const res = await fetchWithTimeout(api, 8000);
      if (res.ok) {
        const json = (await res.json()) as {
          query?: { pages?: Record<string, { extract?: string; title?: string }> };
        };
        const page = Object.values(json.query?.pages ?? {})[0];
        const body = (page?.extract || "").replace(/\s+/g, " ").trim();
        if (body.length >= 400) {
          return { title: (page?.title || title).replace(/_/g, " "), body };
        }
      }
    } catch {
      /* fall through to the REST fallback below */
    }
    // Fallback: REST summary endpoint. Shorter (lead section only) but a
    // genuinely separate service — still worth trying before giving up.
    try {
      const rest = await fetchWithTimeout(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        8000
      );
      if (rest.ok) {
        const rj = (await rest.json()) as { extract?: string; title?: string };
        const body = (rj.extract || "").replace(/\s+/g, " ").trim();
        if (body.length >= 200) return { title: rj.title || title.replace(/_/g, " "), body };
      }
    } catch {
      /* both endpoints failed for this title */
    }
    return null;
  };

  const fetchMostRead = async (): Promise<LiveArticle | null> => {
    // Wikipedia's official Pageviews API — genuinely "most read" (most
    // viewed encyclopedia articles), CORS-enabled, no key, no proxy.
    // Pageview stats can lag or briefly 404 for the most recent day, so
    // several days are tried in order rather than assuming day-2 exists.
    for (let back = 2; back <= 5; back++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - back);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      const api = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${day}`;
      let articles: string[] = [];
      try {
        const res = await fetchWithTimeout(api, 8000);
        if (!res.ok) continue;
        const json = (await res.json()) as { items?: { articles?: { article: string }[] }[] };
        articles = (json.items?.[0]?.articles || [])
          .map((a) => a.article)
          .filter((a) => !/^(Main_Page|Special:|Wikipedia:|File:|Portal:)/.test(a));
      } catch {
        continue;
      }
      if (!articles.length) continue;
      // Skip the top couple (almost always the same evergreen pages) for a
      // more genuinely "trending" pick, then try a few until one has content.
      const candidates = articles.slice(2, 18);
      for (let i = 0; i < 8 && candidates.length; i++) {
        const idx = Math.floor(Math.random() * candidates.length);
        const [title] = candidates.splice(idx, 1);
        const article = await fetchWikipediaExtract(title.replace(/_/g, " "));
        if (article) return article;
      }
    }
    return null;
  };

  const fetchWorldNews = async (): Promise<LiveArticle | null> => {
    // Wikipedia's editor-curated "Current events" portal — a genuine,
    // continuously updated world-news digest. The main portal page is
    // tried first; if it's briefly unavailable, today's and yesterday's
    // dated sub-pages (which always exist as a matter of site convention)
    // are tried next before falling back further.
    const targets = ["Portal:Current events"];
    for (let back = 0; back <= 1; back++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - back);
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];
      targets.push(`Portal:Current_events/${months[d.getUTCMonth()]}_${d.getUTCDate()},_${d.getUTCFullYear()}`);
    }
    for (const title of targets) {
      const article = await fetchWikipediaExtract(title);
      if (article) return article;
    }
    return null;
  };

  const fetchLiveSample = async (source: "mostread" | "worldnews" = sampleSource) => {
    setLoadingSample(true);
    setSampleError(null);
    setSampleStale(false);
    setSampleSource(source);
    try {
      const fetcher = source === "mostread" ? fetchMostRead : fetchWorldNews;
      const article = await withRetries(fetcher, 2, 800);
      if (!article) throw new Error("No articles returned.");
      setSample(article);
      writeCache(source, article);
      // Replay the scan-sweep + staggered point reveal for the new article
      // — this section's whole premise is "watch it scan", so a live
      // article deserves the same animation as a re-run.
      setScanKey((k) => k + 1);
    } catch {
      // Every live attempt failed — fall back to the last successful fetch
      // for this feed if one was cached, so the user still sees real
      // content instead of a dead end, clearly labeled as not fresh.
      const cached = readCache(source);
      if (cached) {
        setSample(cached);
        setSampleStale(true);
        setScanKey((k) => k + 1);
        setSampleError(
          "Couldn't refresh this feed right now, so showing the last successful pull instead. Try again shortly."
        );
      } else {
        setSampleError(
          "Couldn't load this feed right now — Wikipedia's public API may be busy. Try again, switch feeds, or hit refresh."
        );
      }
    }
    setLoadingSample(false);
  };

  /* "Watch it scan" — your-own-material input (paste ≤7.5k words, or any-length file) */
  const [proofMode, setProofMode] = useState<"sample" | "paste" | "file">("sample");
  const [proofText, setProofText] = useState("");
  const [proofBusy, setProofBusy] = useState(false);
  const [proofNote, setProofNote] = useState<string | null>(null);
  const [proofKey, setProofKey] = useState(0);
  const [proofResult, setProofResult] = useState<{
    title: string;
    words: number;
    points: string[];
    details: string[];
    folded: number;
    capped: boolean;
    tier: string;
  } | null>(null);

  const proofWords = wordCount(proofText);
  const overCap = proofWords > PASTE_WORD_CAP;

  const runProof = (text: string, title: string) => {
    setProofBusy(true);
    setProofNote(null);
    window.setTimeout(() => {
      const scan = scanDocument(text, "auto", title);
      setProofResult({
        title,
        words: wordCount(text),
        points: scan.points,
        details: scan.details,
        folded: scan.folded,
        capped: scan.capped,
        tier: scan.tier,
      });
      setProofKey((k) => k + 1);
      setProofBusy(false);
    }, 700);
  };

  const onProofFile = async (file: File | null) => {
    if (!file) return;
    setProofBusy(true);
    setProofNote(null);
    try {
      let text = "";
      if (/\.pdf$/i.test(file.name)) text = await extractPdf(file);
      else if (/\.docx$/i.test(file.name)) text = await extractDocx(file);
      else text = await file.text();
      text = text.replace(/\s+/g, " ").trim();
      if (text.length < 120) throw new Error("too short");
      setProofMode("file");
      runProof(text, file.name);
    } catch {
      setProofBusy(false);
      setProofNote(
        "Couldn't read that file — is it a text-based .txt, .pdf, or .docx? Scanned-image PDFs have no selectable text."
      );
    }
  };

  const taRef = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState(false);
  const [injected, setInjected] = useState(false);
  const [injectFailed, setInjectFailed] = useState(false);

  const selectAll = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    try {
      navigator.clipboard?.writeText(ta.value);
    } catch {
      /* Ctrl+C still works */
    }
    setSelected(true);
    window.setTimeout(() => setSelected(false), 2200);
  };

  const injectReal = () => {
    try {
      new Function(WIDGET_SOURCE)();
      setInjected(true);
      setInjectFailed(false);
    } catch {
      setInjectFailed(true);
    }
  };

  const [pageState, setPageState] = useState<"idle" | "done" | "error">("idle");

  // The built site is one self-contained HTML file — hand it over directly
  // so the user can run Summa outside Arena immediately, no deploy needed.
  const downloadSingleHtml = async () => {
    if (pageState === "done") return;
    try {
      const base = window.location.href.split("#")[0].split("?")[0];
      const root = base.endsWith("/") ? base : base.slice(0, base.lastIndexOf("/") + 1);
      // no-store: the service worker is cache-first for assets, which could
      // otherwise hand out the previous deploy's copy of the site.
      const res = await fetch(root, { cache: "no-store" });
      if (!res.ok) throw new Error("unavailable");
      const html = await res.text();
      if (!html.includes("<div id=\"root\">")) throw new Error("not the app");
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "summa.html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setPageState("done");
    } catch {
      setPageState("error");
    }
  };

  const [deployState, setDeployState] = useState<"idle" | "building" | "done" | "error">("idle");

  // Package the ALREADY-BUILT site (this very page + its assets) as a zip.
  // No source code, no build step — Vercel just serves the files, so
  // "Failed to resolve /src/main.tsx" style errors can't happen.
  const downloadDeployZip = async () => {
    if (deployState === "building") return;
    setDeployState("building");
    try {
      const base = window.location.href.split("#")[0].split("?")[0];
      const root = base.endsWith("/") ? base : base.slice(0, base.lastIndexOf("/") + 1);
      const zip = new JSZip();
      const entries: [string, string][] = [
        ["index.html", root],
        ["manifest.webmanifest", root + "manifest.webmanifest"],
        ["sw.js", root + "sw.js"],
        ["icon-512.png", root + "icon-512.png"],
      ];
      for (const [name, url] of entries) {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          if (name === "index.html") throw new Error("missing index.html");
          continue; // PWA extras are optional; the site works without them
        }
        zip.file(name, await res.blob());
      }
      zip.file(
        "README.txt",
        [
          "SUMMA — deploy-ready static site",
          "==============================",
          "",
          "Upload these four files to a GitHub repo, then import it in Vercel:",
          "  - Framework Preset: Other",
          "  - Build Command: (leave blank)",
          "  - Output Directory: .",
          "",
          "No build needed — the site is pre-built and self-contained.",
        ].join("\n")
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "summa-site.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setDeployState("done");
    } catch {
      setDeployState("error");
    }
  };

  const [extState, setExtState] = useState<"idle" | "building" | "done" | "error">("idle");
  const [folderCheck, setFolderCheck] = useState<
    | { kind: "ok"; name: string }
    | { kind: "wrong-folder"; name: string; hint: string }
    | { kind: "no-manifest"; name: string }
    | null
  >(null);

  // Let the user pick the folder they're about to load, and verify it
  // actually contains manifest.json at its root before Chrome yells at them.
  const verifyFolder = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList) as (File & { webkitRelativePath?: string })[];
    const first = files[0];
    const root = (first.webkitRelativePath || "").split("/")[0] || "picked folder";

    const paths = files.map((f) => f.webkitRelativePath || f.name);
    const hasRootManifest = paths.some(
      (p) => p.toLowerCase() === `${root.toLowerCase()}/manifest.json`
    );
    if (hasRootManifest) {
      setFolderCheck({ kind: "ok", name: root });
      return;
    }
    // Common mistake #1: they picked the parent project folder that
    // CONTAINS the extension folder instead of the extension folder itself.
    const nested = paths.find((p) => /\/(summa-)?extension\/manifest\.json$/i.test(p));
    if (nested) {
      setFolderCheck({
        kind: "wrong-folder",
        name: root,
        hint: "You picked one level too high — open this folder and choose the “extension” folder inside it.",
      });
      return;
    }
    // Common mistake #2: they pointed at the project folder from Arena.
    const looksLikeProject = paths.some((p) => /\/package\.json$/i.test(p));
    setFolderCheck({
      kind: looksLikeProject ? "wrong-folder" : "no-manifest",
      name: root,
      hint: looksLikeProject
        ? "That's the Arena project folder, not the extension. Download the extension ZIP above, unzip it, and pick the folder called “summa-extension”."
        : "",
    });
  };

  const downloadExtension = async () => {
    if (extState === "building") return;
    setExtState("building");
    try {
      const blob = await buildExtensionZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "summa-extension.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setExtState("done");
    } catch {
      setExtState("error");
    }
  };

  const downloadScript = () => {
    const blob = new Blob([WIDGET_SOURCE], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "summarize.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#f1f3ee] text-[#0c1a16]">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="blob-a pointer-events-none absolute -top-40 -left-40 h-[460px] w-[460px] rounded-full bg-[#0f8a6d]/12 blur-3xl" />
      <div className="blob-b pointer-events-none absolute top-[60%] -right-48 h-[500px] w-[500px] rounded-full bg-[#e8a33d]/12 blur-3xl" />

      {/* Header */}
      <header className="relative border-b border-[#0f8a6d]/25 bg-gradient-to-r from-[#dff0e6] via-[#cfe8db] to-[#e4f2ea] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f8a6d] text-[#f7fbf8] shadow-sm ring-1 ring-white/50">
              <Bolt size={18} fill="currentColor" />
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight text-[#0a4034]">
              Summa
            </span>
          </span>
          <span className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !allOpen;
                setAllOpen(next);
                window.dispatchEvent(new CustomEvent("summa:sections", { detail: next }));
                try {
                  ["proof", "workbench", "install", "troubleshoot", "deploy"].forEach((k) =>
                    localStorage.setItem(`summa:sec:${k}`, next ? "1" : "0")
                  );
                } catch {
                  /* ignore */
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#0f8a6d]/30 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#0a4034]/80 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:bg-white hover:text-[#0f8a6d]"
              title={allOpen ? "Collapse every section" : "Expand every section"}
            >
              <ChevronDown
                size={12}
                className={`transition-transform ${allOpen ? "" : "-rotate-90"}`}
              />
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
            <a
              href="#workbench"
              className="hidden items-center gap-1.5 rounded-full border border-[#0f8a6d]/30 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#0a4034]/80 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:bg-white hover:text-[#0f8a6d] sm:inline-flex"
            >
              <Sparkles size={12} /> Workbench
            </a>
            <a
              href="https://naturalwrite-nu.vercel.app"
              target="_blank"
              rel="noreferrer"
              title="NaturalWrite — the writing half of the pair"
              className="hidden items-center gap-1.5 rounded-full border border-[#4a6fb8]/35 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#2f4a80] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#4a6fb8] hover:bg-white md:inline-flex"
            >
              <PenLine size={12} /> NaturalWrite
            </a>
            <a
              href="#deploy"
              className="hidden items-center gap-1.5 rounded-full border border-[#0f8a6d]/30 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#0a4034]/80 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#e8a33d] hover:bg-white hover:text-[#a86f1a] sm:inline-flex"
            >
              <Globe size={12} /> Deploy on Vercel
            </a>
            <a
              href="#deploy"
              className="rounded-full border border-[#0f8a6d]/30 bg-white/80 px-3 py-1.5 font-mono text-xs font-bold tracking-tight text-[#0a4034]/80 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#e8a33d] hover:bg-white hover:text-[#a86f1a]"
              title="Not live yet — open the deploy guide"
            >
              → contentsummarize.com
            </a>
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-5">
        {/* Headline */}
        <div className="pt-14 pb-10 sm:pt-20">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            A Summarize button
            <br />
            for every page you read.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#0c1a16]/70">
            Three steps, in order. Watch it scan a real article first, then pick the one install
            method that fits you.
          </p>
          {/* Roadmap */}
          <div className="mt-7 flex flex-wrap items-center gap-2.5 text-xs font-extrabold uppercase tracking-[0.14em]">
            <a href="#proof" className="flex items-center gap-2 rounded-full bg-[#0c1a16] px-4 py-2 text-[#f1f3ee] transition-transform hover:-translate-y-0.5">
              <span className="text-[#e8a33d]">1</span> See it scan
            </a>
            <span className="text-[#0c1a16]/30">→</span>
            <a href="#install" className="flex items-center gap-2 rounded-full border border-[#0c1a16]/25 bg-white px-4 py-2 text-[#0c1a16]/70 transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]">
              <span className="text-[#e8a33d]">2</span> Pick a path
            </a>
            <span className="text-[#0c1a16]/30">→</span>
            <a href="#install" className="flex items-center gap-2 rounded-full border border-[#0c1a16]/25 bg-white px-4 py-2 text-[#0c1a16]/70 transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]">
              <span className="text-[#e8a33d]">3</span> Use it anywhere
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[#0f8a6d]/50 bg-[#0f8a6d]/8 px-4 py-3">
            <MonitorDown size={16} className="flex-none text-[#0a5c49]" />
            <p className="text-sm font-semibold text-[#0c1a16]/75">
              Can't find the Chrome extension folder? Don't look — just download it:
            </p>
            <button
              onClick={downloadExtension}
              disabled={extState === "building"}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all ${
                extState === "done"
                  ? "bg-[#0f8a6d] text-white"
                  : "bg-[#0c1a16] text-[#f1f3ee] hover:-translate-y-0.5 hover:bg-[#0f8a6d]"
              } disabled:opacity-60`}
            >
              {extState === "done" ? <Check size={13} /> : <Download size={13} />}
              {extState === "done" ? "Saved to Downloads" : "Download extension (.zip)"}
            </button>
            <span className="rounded-full border border-[#0f8a6d]/50 bg-white px-2.5 py-1 font-mono text-[10px] font-bold text-[#0a5c49]">
              v1.3.0 · button auto-appears on every page
            </span>
          </div>
        </div>

        {/* STEP 1 — proof */}
        <section id="proof" className="reveal pb-16">
          <Collapsible
            id="proof"
            tone="dark"
            title="1 · Watch it scan — the sample, or your own words"
            hint="nothing to install"
          >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#0f8a6d]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c1a16] text-[10px] text-[#e8a33d]">1</span>
                Step one · nothing to install
              </p>
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Watch it scan — the sample, or your own words
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fetchLiveSample("mostread")}
                disabled={loadingSample}
                className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                  sampleSource === "mostread"
                    ? "border-[#0f8a6d] bg-[#0f8a6d] text-white"
                    : "border-[#0f8a6d]/40 bg-[#0f8a6d]/10 text-[#0a4034] hover:bg-[#0f8a6d]/20"
                }`}
              >
                <RefreshCw
                  size={14}
                  className={loadingSample && sampleSource === "mostread" ? "animate-spin" : ""}
                />
                {loadingSample && sampleSource === "mostread" ? "Loading…" : "Most read"}
              </button>
              <button
                onClick={() => fetchLiveSample("worldnews")}
                disabled={loadingSample}
                className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                  sampleSource === "worldnews"
                    ? "border-[#0f8a6d] bg-[#0f8a6d] text-white"
                    : "border-[#0f8a6d]/40 bg-[#0f8a6d]/10 text-[#0a4034] hover:bg-[#0f8a6d]/20"
                }`}
              >
                <RefreshCw
                  size={14}
                  className={loadingSample && sampleSource === "worldnews" ? "animate-spin" : ""}
                />
                {loadingSample && sampleSource === "worldnews" ? "Loading…" : "World news"}
              </button>
              {sampleError && (
                <span className="basis-full text-xs font-semibold text-[#b3402f]">{sampleError}</span>
              )}
              <button
                onClick={() => setScanKey((k) => k + 1)}
                className="inline-flex items-center gap-2 rounded-full border-2 border-[#0c1a16] px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[#0c1a16] hover:text-[#f1f3ee]"
              >
                Re-run scan
              </button>
              <button
                onClick={injectReal}
                className="inline-flex items-center gap-2 rounded-full bg-[#0f8a6d] px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_26px_rgba(15,138,109,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#0a5c49]"
              >
                <Bolt size={14} fill="currentColor" />
                {injected ? "Injected — use the teal button ↘" : "Inject the real button"}
              </button>
            </div>
          </div>

          {injectFailed && (
            <p className="mb-4 rounded-lg bg-[#e8695a]/10 p-3 text-sm font-semibold text-[#b3402f]">
              Couldn't inject here — that's a sandbox limit, not a script problem. It will run from
              your bookmark on normal pages.
            </p>
          )}

          {/* Your-material tabs */}
          <div className="mb-6 overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-white shadow-[8px_8px_0_#0c1a16]">
            <div className="flex flex-wrap gap-1 border-b-2 border-[#0c1a16] bg-[#0c1a16] p-2">
              {(
                [
                  { id: "sample", label: "Watch the sample" },
                  { id: "paste", label: "Paste your own" },
                  { id: "file", label: "Upload a file" },
                ] as { id: typeof proofMode; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setProofMode(t.id)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                    proofMode === t.id
                      ? "bg-[#e8a33d] text-[#0c1a16]"
                      : "text-[#f1f3ee]/60 hover:bg-[#f1f3ee]/10 hover:text-[#f1f3ee]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-auto hidden self-center pr-2 text-[10px] font-semibold text-[#f1f3ee]/45 sm:block">
                paste ≤ {PASTE_WORD_CAP.toLocaleString()} words · files any length
              </span>
            </div>

            {proofMode === "paste" && (
              <div className="p-5">
                <textarea
                  value={proofText}
                  onChange={(e) => setProofText(e.target.value)}
                  rows={6}
                  placeholder="Paste up to 7,500 words — an article, essay, report, anything…"
                  className="w-full resize-y rounded-xl border border-[#0c1a16]/20 bg-[#f7f9f5] p-4 text-sm leading-relaxed text-[#0c1a16]/80 outline-none transition focus:border-[#0f8a6d] focus:ring-4 focus:ring-[#0f8a6d]/15"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[#0c1a16]/10">
                    <div
                      className={`h-full rounded-full transition-all ${overCap ? "bg-[#e8695a]" : "bg-[#0f8a6d]"}`}
                      style={{ width: `${Math.min(100, (proofWords / PASTE_WORD_CAP) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold ${overCap ? "text-[#b3402f]" : "text-[#0c1a16]/55"}`}>
                    {proofWords.toLocaleString()} / {PASTE_WORD_CAP.toLocaleString()} words
                  </span>
                  <button
                    onClick={() => runProof(proofText, "Your pasted material")}
                    disabled={proofBusy || proofWords < 40 || overCap}
                    className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#0f8a6d] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(15,138,109,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#0a5c49] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <Bolt size={14} fill="currentColor" />
                    {proofBusy ? "Scanning…" : "Scan my text"}
                  </button>
                </div>
                {overCap && (
                  <p className="mt-2 text-xs font-semibold text-[#b3402f]">
                    Over the paste limit — switch to <strong>Upload a file</strong> for longer
                    material (.txt, .pdf, .docx have no cap).
                  </p>
                )}
              </div>
            )}

            {proofMode === "file" && (
              <div className="p-5">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-[#0c1a16]/25 bg-[#f7f9f5] px-6 py-8 text-center transition-all hover:border-[#0f8a6d] hover:bg-[#0f8a6d]/5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f8a6d]/12 text-[#0a5c49]">
                    {proofBusy ? <RefreshCw size={20} className="animate-spin" /> : <FileUp size={20} />}
                  </span>
                  <span className="text-sm font-bold text-[#0c1a16]">
                    {proofBusy ? "Reading your document…" : "Drop or choose a .txt, .pdf, or .docx"}
                  </span>
                  <span className="text-xs text-[#0c1a16]/50">
                    Any length — parsed right here in your browser, never uploaded.
                  </span>
                  <input
                    type="file"
                    accept=".txt,.md,.text,.pdf,.docx"
                    className="hidden"
                    disabled={proofBusy}
                    onChange={(e) => onProofFile(e.target.files?.[0] || null)}
                  />
                </label>
                {proofNote && (
                  <p className="mt-3 rounded-lg border-l-4 border-[#e8695a] bg-[#e8695a]/10 p-3 text-xs leading-relaxed text-[#b3402f]">
                    {proofNote}
                  </p>
                )}
              </div>
            )}

            {proofMode === "sample" && (
              <p className="px-5 py-3.5 text-xs leading-relaxed text-[#0c1a16]/55">
                The scanner runs on the article below by default. Flip to{" "}
                <strong className="text-[#0c1a16]">Paste your own</strong> or{" "}
                <strong className="text-[#0c1a16]">Upload a file</strong> to tailor a summary from
                your material instead.
              </p>
            )}
          </div>

          {(proofMode === "sample" || !proofResult) ? (
          <article className="relative overflow-hidden rounded-2xl border border-[#0c1a16]/12 bg-white p-7 shadow-sm sm:p-10">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-2xl font-bold tracking-tight">{sample.title}</h3>
              <span className="flex items-center gap-2 text-xs font-semibold text-[#0c1a16]/45">
                {sampleStale && (
                  <span className="rounded-full bg-[#e8a33d]/20 px-2 py-0.5 font-bold text-[#a86f1a]">
                    cached — refresh failed
                  </span>
                )}
                {wordCount(sample.body)} words · {readTime(sample.body)} min read
              </span>
            </div>
            <div className="relative">
              <p className="max-w-3xl leading-relaxed text-[#0c1a16]/75">{sample.body}</p>
              <div key={`sweep-${scanKey}`} className="pointer-events-none absolute inset-0">
                <div className="proof-scan absolute left-0 right-0 h-[3px] rounded-full bg-[#0f8a6d] shadow-[0_0_16px_rgba(15,138,109,0.8)]" />
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-[#0f8a6d]/30 bg-[#0f8a6d]/10 p-5 sm:p-6">
              <p className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0a5c49]">
                <Bolt size={11} fill="currentColor" />
                What the scanner pulled out — 5 main points
              </p>
              <ol key={`pts-${scanKey}`} className="space-y-3">
                {points.map((p, i) => (
                  <li key={i} className="point-in flex gap-3" style={{ animationDelay: `${1.1 + i * 0.28}s` }}>
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[#0c1a16] text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-[#0c1a16]/80">{p}</span>
                  </li>
                ))}
              </ol>

              {details.length > 0 && (
                <div key={`det-${scanKey}`} className="point-in mt-5 border-t border-[#0f8a6d]/25 pt-4" style={{ animationDelay: `${1.1 + points.length * 0.28 + 0.2}s` }}>
                  <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a86f1a]">
                    Full summary — everything else that matters
                  </p>
                  <p className="text-justify text-sm leading-relaxed text-[#0c1a16]/70">
                    {details.join(" ")}
                  </p>
                  {folded > 0 && (
                    <p className="mt-2 text-xs italic text-[#0c1a16]/50">
                      +{folded} more supporting sentences folded in to keep this readable.
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#0f8a6d]">
              <Bolt size={14} fill="currentColor" />
              {injected
                ? "That teal button bottom-right is the same one Step 2 puts on your browser."
                : "This exact result is what Step 2 gives you on any page you visit."}
            </p>
          </article>
          ) : (
          <div
            key={`pr-${proofKey}`}
            className="relative overflow-hidden rounded-2xl border-2 border-[#0f8a6d] bg-white p-7 shadow-[10px_10px_0_#0f8a6d] sm:p-10"
          >
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="mb-1 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#0f8a6d]">
                  <Sparkles size={11} fill="currentColor" /> Tailored summary
                  <span className="rounded-full bg-[#0c1a16] px-2 py-0.5 text-[9px] text-[#e8a33d]">
                    {proofResult.tier}
                  </span>
                </p>
                <h3 className="font-display text-2xl font-bold tracking-tight break-words">
                  {proofResult.title}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0c1a16]/45">
                  {proofResult.words.toLocaleString()} words ·{" "}
                  {Math.max(1, Math.round(proofResult.words / 220))} min read
                  {proofResult.capped && " · first 4,000 sentences analysed"}
                </span>
                <button
                  onClick={() => {
                    setProofMode("sample");
                    setProofResult(null);
                  }}
                  className="rounded-full border border-[#0c1a16]/25 px-3 py-1 text-xs font-bold text-[#0c1a16]/60 transition-colors hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                >
                  ← back to sample
                </button>
              </div>
            </div>

            <ol className="space-y-3">
              {proofResult.points.map((p, i) => (
                <li key={i} className="point-in flex gap-3" style={{ animationDelay: `${0.1 + i * 0.15}s` }}>
                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#0c1a16] text-xs font-bold text-[#e8a33d]">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-[#0c1a16]/85">{p}</span>
                </li>
              ))}
            </ol>

            {proofResult.details.length > 0 && (
              <div
                className="point-in mt-6 rounded-xl border border-[#e8a33d]/50 bg-[#e8a33d]/10 p-5"
                style={{ animationDelay: `${0.1 + proofResult.points.length * 0.15 + 0.15}s` }}
              >
                <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a86f1a]">
                  Full summary — everything else that matters
                </p>
                <p className="text-justify text-sm leading-relaxed text-[#0c1a16]/75">
                  {proofResult.details.join(" ")}
                </p>
                {proofResult.folded > 0 && (
                  <p className="mt-2 text-xs italic text-[#0c1a16]/50">
                    +{proofResult.folded} more supporting sentences folded in to keep this readable.
                  </p>
                )}
              </div>
            )}

            <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#0f8a6d]">
              <Bolt size={14} fill="currentColor" />
              The same engine powers the button on every page — install it in Step 2.
            </p>
          </div>
          )}
          </Collapsible>
        </section>

        {/* Workbench */}
        <Workbench />

        {/* Content-type ticker */}
        <section className="reveal -mx-5 mb-14 overflow-hidden border-y-2 border-[#0c1a16] bg-[#0c1a16] py-3">
          <div className="marquee-track flex w-max items-center gap-10 text-sm font-semibold text-[#f1f3ee]/70">
            {[...Array(2)].map((_, dup) =>
              [
                "Articles & blog posts", "Emails & messages", "Image-heavy pages",
                "Documentation & wikis", "Social posts & threads", "Gmail inboxes",
                "Research papers", "Product pages", "News sites", "Support docs",
              ].map((t) => (
                <span key={dup + t} className="flex items-center gap-2.5">
                  <Bolt size={11} className="text-[#e8a33d]" fill="currentColor" />
                  tuned for {t}
                </span>
              ))
            )}
          </div>
        </section>

        {/* STEP 2 — choose a path */}
        <div id="install" className="reveal">
          <Collapsible
            id="install"
            tone="dark"
            title="2 · Install it — start with the extension"
            hint="recommended, plus a fallback"
          >
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#0f8a6d]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c1a16] text-[10px] text-[#e8a33d]">2</span>
            Step two · pick one
          </p>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Install it — the extension is the one you want
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#0c1a16]/70">
            The <strong className="text-[#0c1a16]">Chrome extension</strong> is the full experience:
            the button appears on every page by itself and works everywhere, Gmail and GitHub
            included. The <strong className="text-[#0c1a16]">bookmark</strong> below it is a
            fallback for Firefox, Safari, or machines where extensions are blocked. You only need
            one.
          </p>
        </div>
        </Collapsible>
        </div>

        {/* Install cards — extension first via flex order, no JSX moved */}
        <div className="flex flex-col gap-10">
        {/* Bookmark fallback card (rendered second) */}
        <section className="reveal order-2 overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-white shadow-[10px_10px_0_#0c1a16]">
          {/* Fallback header */}
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#0c1a16] bg-[#e8a33d] px-5 py-2.5 sm:px-7">
            <span className="rounded-full bg-[#0c1a16] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#e8a33d]">
              Fallback
            </span>
            <span className="font-display text-sm font-extrabold text-[#0c1a16]">
              The 60-second bookmark — for Firefox, Safari, or locked-down machines
            </span>
            <span className="ml-auto hidden text-[11px] font-semibold text-[#0c1a16]/60 lg:block">
              won't run on Gmail · GitHub · X
            </span>
          </div>
          {/* Step 1 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#0c1a16] bg-[#0c1a16] px-5 py-4 sm:px-7">
            <span className="flex items-center gap-3">
              <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-[#e8a33d] text-sm font-extrabold text-[#0c1a16]">
                1
              </span>
              <span className="font-display text-lg font-extrabold text-[#f1f3ee]">
                Copy your link
              </span>
            </span>
            <button
              onClick={selectAll}
              disabled={!bookmarkletHref}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
                selected
                  ? "bg-[#0f8a6d] text-white"
                  : "bg-[#e8a33d] text-[#0c1a16] hover:scale-105 active:scale-95"
              }`}
            >
              {selected ? <Check size={15} /> : <Copy size={15} />}
              {selected ? "Selected — press Ctrl+C" : "Select all"}
            </button>
          </div>
          <div className="px-5 py-5 sm:px-7">
            {bookmarkletHref ? (
              <textarea
                ref={taRef}
                readOnly
                value={bookmarkletHref}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                rows={4}
                spellCheck={false}
                className="w-full resize-none rounded-lg border border-[#0c1a16]/20 bg-[#f7f9f5] p-3 font-mono text-[11px] leading-relaxed text-[#0c1a16]/70 outline-none focus:border-[#0f8a6d] focus:ring-2 focus:ring-[#0f8a6d]/20"
              />
            ) : (
              <p className="rounded-lg bg-[#e8695a]/10 p-4 text-sm font-semibold text-[#b3402f]">
                The link couldn't be generated in this environment — use “Download summarize.js” in
                Other ways below.
              </p>
            )}
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#0c1a16]/55">
              {scriptValid ? (
                <>
                  <ShieldCheck size={13} className="text-[#0f8a6d]" /> Verified — this script
                  compiles cleanly. Click the box or use Select all, then Ctrl+C (⌘C).
                </>
              ) : (
                <>Script check unavailable.</>
              )}
            </p>
          </div>

          {/* Steps 2 + 3 */}
          <div className="grid gap-0 border-t-2 border-[#0c1a16] sm:grid-cols-2">
            <div className="border-b-2 border-[#0c1a16] px-5 py-5 sm:border-b-0 sm:border-r-2 sm:px-7">
              <span className="flex items-center gap-3">
                <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-[#e8a33d] text-sm font-extrabold text-[#0c1a16]">
                  2
                </span>
                <span className="font-display text-lg font-extrabold">Add a bookmark</span>
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#0c1a16]/70">
                Press <kbd className="rounded border border-[#0c1a16]/25 bg-[#f7f9f5] px-1.5 py-0.5 text-xs font-bold">Ctrl+Shift+B</kbd>{" "}
                to show your bookmarks bar. Right-click it and choose{" "}
                <strong>Add page…</strong> (Chrome/Edge) or <strong>New Bookmark…</strong>.
              </p>
            </div>
            <div className="px-5 py-5 sm:px-7">
              <span className="flex items-center gap-3">
                <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-[#e8a33d] text-sm font-extrabold text-[#0c1a16]">
                  3
                </span>
                <span className="font-display text-lg font-extrabold">Paste and save</span>
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#0c1a16]/70">
                Name it <strong>Summarize</strong>, paste the link into the URL box, save. Done —
                click it on any article from now on.
              </p>
              {/* Mock bar */}
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#0c1a16]/15 bg-[#f7f9f5] px-3 py-2 text-xs text-[#0c1a16]/45">
                <span>News</span>
                <span>Docs</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0f8a6d] px-2.5 py-0.5 font-bold text-white shadow-sm">
                  <Bolt size={10} fill="currentColor" /> Summarize
                </span>
                <span className="ml-auto">← your bookmarks bar</span>
              </div>
            </div>
          </div>
        </section>

        {/* Chrome extension path — shown first via flex order */}
        <section className="reveal order-1">
          <div className="overflow-hidden rounded-2xl border-2 border-[#0f8a6d] bg-white shadow-[10px_10px_0_#0f8a6d]">
            <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#0f8a6d] bg-[#0f8a6d] px-5 py-2.5 sm:px-7">
              <span className="rounded-full bg-[#0c1a16] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#e8a33d]">
                Recommended
              </span>
              <span className="font-display text-sm font-extrabold text-white">
                Chrome extension — appears on every page, works on Gmail, GitHub, X
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#0f8a6d] bg-[#0c1a16] px-5 py-4 sm:px-7">
              <span className="flex items-center gap-3">
                <MonitorDown size={18} className="text-[#e8a33d]" />
                <span className="font-display text-lg font-extrabold text-[#f1f3ee]">
                  Download the extension
                </span>
              </span>
            </div>
            <div className="grid gap-8 p-6 sm:grid-cols-[1fr_1.1fr] sm:p-8">
              <div>
                <p className="text-sm leading-relaxed text-[#0c1a16]/75">
                  The project you download already contains a finished{" "}
                  <code className="rounded bg-[#eef1ea] px-1">extension</code> folder — that's what
                  Chrome loads. Because it's a real extension, site security rules can't block it,
                  so it works where the bookmark can't. (The button below packages the same folder
                  as a ZIP if you're hosting the site elsewhere.)
                </p>
                <button
                  onClick={downloadExtension}
                  disabled={extState === "building"}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0f8a6d] px-5 py-3 font-semibold text-white shadow-[0_10px_26px_rgba(15,138,109,0.4)] transition-all hover:-translate-y-0.5 hover:bg-[#0a5c49] disabled:opacity-60"
                >
                  {extState === "done" ? <Check size={16} /> : <Download size={16} />}
                  {extState === "building"
                    ? "Packaging…"
                    : extState === "done"
                    ? "Downloaded — check your Downloads folder"
                    : extState === "error"
                    ? "Build failed — try again"
                    : "Download just the extension (.zip)"}
                </button>
                <p className="mt-3 text-xs text-[#0c1a16]/50">
                  v1.3.0 · ~5 KB · Chrome, Edge, Brave, Opera, Arc · no store account needed.
                </p>

                {/* Folder verifier */}
                <div className="mt-5 rounded-xl border border-dashed border-[#0c1a16]/30 bg-[#f7f9f5] p-4">
                  <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0c1a16]/70">
                    Not sure which folder to pick?
                  </p>
                  <p className="mb-3 text-xs leading-relaxed text-[#0c1a16]/65">
                    Point to the folder you're about to load — I'll tell you if it's the right one
                    before Chrome complains.
                  </p>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#0c1a16]/25 bg-white px-4 py-1.5 text-xs font-bold text-[#0c1a16] hover:border-[#0f8a6d]">
                    <input
                      type="file"
                      // @ts-expect-error non-standard but supported in Chromium
                      webkitdirectory=""
                      directory=""
                      multiple
                      className="hidden"
                      onChange={(e) => verifyFolder(e.currentTarget.files)}
                    />
                    Verify folder…
                  </label>
                  {folderCheck && (
                    <div
                      className={`mt-3 rounded-lg p-3 text-xs leading-relaxed ${
                        folderCheck.kind === "ok"
                          ? "border border-[#0f8a6d]/40 bg-[#0f8a6d]/10 text-[#0a5c49]"
                          : "border border-[#e8695a]/40 bg-[#e8695a]/10 text-[#b3402f]"
                      }`}
                    >
                      {folderCheck.kind === "ok" ? (
                        <>
                          <b>✓ {folderCheck.name}</b> — this is the right folder. Load it now.
                        </>
                      ) : folderCheck.kind === "wrong-folder" ? (
                        <>
                          <b>✗ {folderCheck.name}</b> — wrong folder. {folderCheck.hint}
                        </>
                      ) : (
                        <>
                          <b>✗ {folderCheck.name}</b> — no <code>manifest.json</code> directly
                          inside. You probably picked the project folder. Go one level deeper and
                          choose the folder named <b>extension</b> — it sits right next to{" "}
                          <code>src</code> and <code>public</code>.
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <ol className="space-y-3 rounded-xl bg-[#f7f9f5] p-5">
                {[
                  <>
                    Download this project from Arena and unzip it. Inside the project folder
                    there's a ready-made folder named{" "}
                    <code className="rounded bg-[#0f8a6d] px-1 font-bold text-white">extension</code>{" "}
                    — it already contains <code className="rounded bg-white px-1">manifest.json</code>.
                    No building, no zip-in-a-zip.
                  </>,
                  <>
                    Open <code className="rounded bg-white px-1">chrome://extensions</code> and
                    turn on <b>Developer mode</b> (top-right).
                  </>,
                  <>
                    Click <b>Load unpacked</b> and pick the{" "}
                    <code className="rounded bg-[#0f8a6d] px-1 font-bold text-white">extension</code>{" "}
                    folder — <em>not</em> the big project folder around it. When in doubt, use the
                    verifier on the left first.
                  </>,
                  <>
                    Pin the Summa icon to your toolbar, then click it on any page to summarize it.
                  </>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-display flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#0c1a16] text-xs font-extrabold text-[#e8a33d]">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm leading-relaxed text-[#0c1a16]/80">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
        </div>

        {/* Not showing up? */}
        <section className="reveal pb-10">
          <Collapsible
            id="troubleshoot"
            title="3 · Test it — and what to do if the button doesn't appear"
            hint="verified test pages"
          >
          <div className="rounded-2xl border-2 border-[#e8a33d] bg-[#e8a33d]/10 p-6 sm:p-8">
            <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#a86f1a]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c1a16] text-[10px] text-[#e8a33d]">3</span>
              Step three · test it
            </p>
            <h3 className="font-display mb-2 text-xl font-extrabold text-[#0c1a16]">
              Prove your install on a page that always allows it
            </h3>
            <p className="mb-5 text-sm leading-relaxed text-[#0c1a16]/70">
              Open one of these links in a normal tab, click your Summarize bookmark (or extension
              icon), and the teal panel should appear bottom-right. If it shows here, your install
              works — any page where it doesn't is one that blocks scripts like this.
            </p>
            <div className="mb-6 flex flex-wrap gap-2">
              {[
                { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Photosynthesis" },
                { name: "BBC News", url: "https://www.bbc.com/news" },
                { name: "MDN Docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" },
                { name: "arXiv paper", url: "https://arxiv.org/abs/1706.03762" },
              ].map((s) => (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#0c1a16]/25 bg-white px-4 py-1.5 text-sm font-semibold text-[#0c1a16] transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d]"
                >
                  Open {s.name} <ExternalLink size={12} />
                </a>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#0f8a6d]/40 bg-[#0f8a6d]/8 p-4">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-[#0a5c49]">
                  ✓ Works on
                </p>
                <p className="text-sm leading-relaxed text-[#0c1a16]/70">
                  News articles, Wikipedia, blog posts, documentation, most PDFs opened in the
                  browser, Reddit threads, Substack, arXiv, Medium.
                </p>
              </div>
              <div className="rounded-xl border border-[#e8695a]/40 bg-[#e8695a]/8 p-4">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-[#b3402f]">
                  ✗ Blocked by CSP
                </p>
                <p className="text-sm leading-relaxed text-[#0c1a16]/70">
                  Gmail, GitHub, Twitter/X, YouTube, most banks. The site itself refuses to run
                  bookmark scripts — a browser security rule, not fixable from our end.
                </p>
              </div>
            </div>

            <details className="mt-5 rounded-xl bg-white/70 px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold text-[#0c1a16]/75 marker:text-[#0f8a6d]">
                Other things to check
              </summary>
              <ul className="mt-3 space-y-2 pl-4 text-[#0c1a16]/70">
                <li>
                  <strong>Old bookmark, old script.</strong> Delete any previous Summarize
                  bookmark and reinstall — earlier versions could blank the page or fail silently.
                </li>
                <li>
                  <strong>Look bottom-right.</strong> The teal button now pops in with an animation
                  and the summary panel opens automatically on first click.
                </li>
                <li>
                  <strong>Wrong URL saved.</strong> Right-click your bookmark → Edit → the URL
                  must start with <code className="rounded bg-[#eef1ea] px-1">javascript:</code>
                  (not <code className="rounded bg-[#eef1ea] px-1">https:</code>). If it starts with
                  https, re-copy from Step 1 above and paste again.
                </li>
                <li>
                  <strong>Refresh the page.</strong> If the site loaded before you added the
                  bookmark, a reload sometimes helps.
                </li>
              </ul>
            </details>
          </div>
          </Collapsible>
        </section>

        {/* Vercel deploy guide */}
        <section id="deploy" className="reveal pb-20">
          <Collapsible
            id="deploy"
            tone="dark"
            title="Put it live on Vercel"
            hint="hosting & domain"
            defaultOpen={false}
          >
          <div className="overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-[#0c1a16] text-[#f1f3ee] shadow-[10px_10px_0_#0f8a6d]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f3ee]/10 px-6 py-5 sm:px-8">
              <span className="flex items-center gap-3">
                <Globe size={20} className="text-[#e8a33d]" />
                <span className="font-display text-xl font-extrabold">
                  Put it live on Vercel
                </span>
              </span>
              <span className="rounded-full bg-[#f1f3ee]/10 px-3 py-1 font-mono text-xs font-bold text-[#f1f3ee]/80">
                www.contentsummarize.com
              </span>
            </div>

            <div className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[1.05fr_1fr]">
              {/* Steps */}
              <div>
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#0f8a6d] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white">
                    No build · no terminal · no git commands
                  </span>
                  <span className="text-xs text-[#f1f3ee]/50">about 5 minutes, all in the browser</span>
                </div>

                {/* Download CTA */}
                <div className="mb-6 rounded-xl border-2 border-[#e8a33d] bg-[#e8a33d]/10 p-5">
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e8a33d]">
                    Take the finished site out of Arena
                  </p>
                  <p className="mb-4 text-sm font-semibold leading-relaxed text-[#f1f3ee]/85">
                    The whole site is one self-contained file. Grab it for yourself right now, or
                    take the zip if you're heading to GitHub.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={downloadSingleHtml}
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold shadow-lg transition-all ${
                        pageState === "done"
                          ? "bg-[#0f8a6d] text-white"
                          : "bg-[#f1f3ee] text-[#0c1a16] hover:-translate-y-0.5 hover:shadow-xl"
                      }`}
                    >
                      {pageState === "done" ? <Check size={16} /> : <Download size={16} />}
                      {pageState === "done"
                        ? "summa.html saved — double-click it!"
                        : pageState === "error"
                        ? "Couldn't save from here"
                        : "Download the page (.html)"}
                    </button>
                    <button
                      onClick={downloadDeployZip}
                      disabled={deployState === "building"}
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold shadow-lg transition-all ${
                        deployState === "done"
                          ? "bg-[#0f8a6d] text-white"
                          : "bg-[#e8a33d] text-[#0c1a16] hover:-translate-y-0.5 hover:shadow-xl"
                      } disabled:opacity-60`}
                    >
                      {deployState === "done" ? <Check size={16} /> : <Download size={16} />}
                      {deployState === "building"
                        ? "Packaging…"
                        : deployState === "done"
                        ? "Zip saved to Downloads"
                        : deployState === "error"
                        ? "Couldn't package here"
                        : "Or the deploy zip"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-[#f1f3ee]/60">
                    <strong className="text-[#7fd4bd]">summa.html</strong> opens straight in your
                    browser from your Downloads folder — Summa running outside Arena, no internet
                    needed. <strong className="text-[#e8a33d]">The zip</strong> is the same page
                    plus PWA extras, ready for GitHub → Vercel.
                  </p>
                  {(pageState === "error" || deployState === "error") && (
                    <p className="mt-2 text-xs leading-relaxed text-[#e8a33d]">
                      This preview can't hand over its own files. Once the site is live on
                      contentsummarize.com, both buttons will work from there.
                    </p>
                  )}
                </div>

                {/* Which download is which */}
                <div className="mb-6 grid gap-3 sm:grid-cols-2">
                  <div className="group rounded-xl border-2 border-[#0f8a6d] bg-[#0f8a6d]/10 p-4 transition-transform hover:-translate-y-0.5">
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7fd4bd]">
                      <Package size={13} /> Finished files · this step
                    </p>
                    <p className="text-xs leading-relaxed text-[#f1f3ee]/75">
                      From the buttons above — both land in your{" "}
                      <strong className="text-[#f1f3ee]">Downloads</strong> folder. The zip holds
                      the four finished files you upload to GitHub:
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {["index.html", "manifest.webmanifest", "sw.js", "icon-512.png"].map((f) => (
                        <code key={f} className="rounded bg-[#0c1a16] px-1.5 py-0.5 font-mono text-[10px] text-[#e8a33d]">
                          {f}
                        </code>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#f1f3ee]/15 bg-[#f1f3ee]/4 p-4">
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#f1f3ee]/45">
                      <FolderOpen size={13} /> Project download · not this step
                    </p>
                    <p className="text-xs leading-relaxed text-[#f1f3ee]/55">
                      The <code className="rounded bg-[#f1f3ee]/10 px-1">globalize-page-…</code>{" "}
                      folder from Arena, with <code className="rounded bg-[#f1f3ee]/10 px-1">src</code>{" "}
                      and <code className="rounded bg-[#f1f3ee]/10 px-1">public</code>. That's raw
                      source code — it needs a build, and it's what failed last time. You only need
                      it for the Chrome <code className="rounded bg-[#f1f3ee]/10 px-1">extension</code>{" "}
                      folder.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Phase 1 — GitHub */}
                  <div className="rounded-xl border border-[#f1f3ee]/15 bg-[#f1f3ee]/4 p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="flex items-center gap-2.5">
                        <span className="font-display flex h-7 w-7 items-center justify-center rounded-full bg-[#e8a33d] text-xs font-extrabold text-[#0c1a16]">1</span>
                        <span className="font-display text-base font-extrabold text-[#f1f3ee]">Create the GitHub repo</span>
                      </p>
                      <a
                        href="https://github.com/new"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f3ee] px-3.5 py-1.5 text-xs font-bold text-[#0c1a16] transition-transform hover:-translate-y-0.5"
                      >
                        Open github.com/new <ExternalLink size={11} />
                      </a>
                    </div>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-[#f1f3ee]/75">
                      <li>• In the <strong className="text-[#f1f3ee]">Repository name</strong> box, type <code className="rounded bg-[#f1f3ee]/10 px-1">summa</code>.</li>
                      <li>• Leave <em>“Add a README”</em> <strong className="text-[#f1f3ee]">unchecked</strong>. Ignore every other option.</li>
                      <li>• Click the green <strong className="text-[#7fd4bd]">Create repository</strong> button at the bottom.</li>
                    </ul>
                    <p className="mt-2.5 border-l-2 border-[#7fd4bd] pl-3 text-xs italic text-[#f1f3ee]/55">
                      You'll see a page titled “Quick setup.” Click the blue link{" "}
                      <strong className="not-italic text-[#7fd4bd]">uploading an existing file</strong>,
                      drag the four files from your unzipped <code className="rounded bg-[#f1f3ee]/10 px-1">summa-site</code>{" "}
                      folder into the dashed box, wait for the green check marks, then click{" "}
                      <strong className="not-italic text-[#7fd4bd]">Commit changes</strong>.
                    </p>
                  </div>

                  {/* Phase 2 — Vercel */}
                  <div className="rounded-xl border border-[#f1f3ee]/15 bg-[#f1f3ee]/4 p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="flex items-center gap-2.5">
                        <span className="font-display flex h-7 w-7 items-center justify-center rounded-full bg-[#e8a33d] text-xs font-extrabold text-[#0c1a16]">2</span>
                        <span className="font-display text-base font-extrabold text-[#f1f3ee]">Import it into Vercel</span>
                      </p>
                      <a
                        href="https://vercel.com/new"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f3ee] px-3.5 py-1.5 text-xs font-bold text-[#0c1a16] transition-transform hover:-translate-y-0.5"
                      >
                        Open vercel.com/new <ExternalLink size={11} />
                      </a>
                    </div>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-[#f1f3ee]/75">
                      <li>• Sign in with <strong className="text-[#f1f3ee]">Continue with GitHub</strong> if asked. Your <code className="rounded bg-[#f1f3ee]/10 px-1">summa</code> repo appears under “Import Git Repository” — click <strong className="text-[#f1f3ee]">Import</strong>.</li>
                      <li>• On the configure screen, open <strong className="text-[#f1f3ee]">Framework Preset</strong> and choose <em>Other</em>. This is the setting that fixes last time's failure.</li>
                      <li>• Make sure <strong className="text-[#f1f3ee]">Build Command</strong> is empty and <strong className="text-[#f1f3ee]">Output Directory</strong> shows <code className="rounded bg-[#f1f3ee]/10 px-1">.</code></li>
                      <li>• Click <strong className="text-[#7fd4bd]">Deploy</strong>.</li>
                    </ul>
                    <p className="mt-2.5 border-l-2 border-[#7fd4bd] pl-3 text-xs italic text-[#f1f3ee]/55">
                      You'll see a “Congratulations” screen with a link like{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1 not-italic">summa-xxxx.vercel.app</code> —
                      click <strong className="not-italic text-[#7fd4bd]">Visit</strong>. That's your
                      site, live on the internet.
                    </p>
                  </div>

                  {/* Phase 3 — domain */}
                  <div className="rounded-xl border border-[#f1f3ee]/15 bg-[#f1f3ee]/4 p-5">
                    <p className="mb-3 flex items-center gap-2.5">
                      <span className="font-display flex h-7 w-7 items-center justify-center rounded-full bg-[#e8a33d] text-xs font-extrabold text-[#0c1a16]">3</span>
                      <span className="font-display text-base font-extrabold text-[#f1f3ee]">Point your domain at it</span>
                    </p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-[#f1f3ee]/75">
                      <li>• In the Vercel project: top menu → <strong className="text-[#f1f3ee]">Settings</strong> → left sidebar → <strong className="text-[#f1f3ee]">Domains</strong>.</li>
                      <li>• Type <code className="rounded bg-[#f1f3ee]/10 px-1">contentsummarize.com</code> → <strong className="text-[#7fd4bd]">Add</strong>. If Vercel says it belongs to naturalwrite-nu, accept the <strong className="text-[#f1f3ee]">Move</strong> prompt.</li>
                      <li>• Log in where you bought the domain, find <strong className="text-[#f1f3ee]">DNS settings</strong>, and add the two records on the right (copy buttons included).</li>
                    </ul>
                    <p className="mt-2.5 border-l-2 border-[#7fd4bd] pl-3 text-xs italic text-[#f1f3ee]/55">
                      Vercel checks the records every few seconds. When both turn green and the
                      padlock appears, www.contentsummarize.com is serving Summa.
                    </p>
                  </div>
                </div>

                {/* Common deploy errors */}
                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border-l-4 border-[#e8695a] bg-[#e8695a]/10 p-4">
                    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#f0a294]">
                      Error · “repository does not contain the requested branch… not empty”
                    </p>
                    <p className="text-xs leading-relaxed text-[#f1f3ee]/75">
                      The <code className="rounded bg-[#f1f3ee]/10 px-1">summa</code> repo on GitHub
                      is empty — the upload didn't get committed. Open the repo; if you still see
                      the “Quick setup” page, click <em>uploading an existing file</em>, drag the
                      four files in, and this time make sure you scroll down and hit the green{" "}
                      <strong className="text-[#7fd4bd]">Commit changes</strong> button. Then
                      retry the import.
                    </p>
                  </div>
                  <div className="rounded-xl border-l-4 border-[#e8695a] bg-[#e8695a]/10 p-4">
                    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#f0a294]">
                      Error · “Failed to resolve /src/main.tsx”
                    </p>
                    <p className="text-xs leading-relaxed text-[#f1f3ee]/75">
                      Your repo has <code className="rounded bg-[#f1f3ee]/10 px-1">package.json</code>{" "}
                      but the <code className="rounded bg-[#f1f3ee]/10 px-1">src</code> folder never
                      arrived. If your upload queue shows <code className="rounded bg-[#f1f3ee]/10 px-1">App.tsx</code>,{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">main.tsx</code> with no{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">src/</code> in front, don't
                      commit — you dragged the files out of their folder. Cancel, and drag the{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">src</code> folder itself. Fix: in the repo, <strong className="text-[#f1f3ee]">Add file →
                      Upload files</strong>, drag in the <code className="rounded bg-[#f1f3ee]/10 px-1">src</code>{" "}
                      and <code className="rounded bg-[#f1f3ee]/10 px-1">public</code> folders from
                      your project download, commit. The number after{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">globalize-page-…</code> is just
                      Windows renaming duplicates — pick the newest one; any copy that contains{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">src</code> +{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">public</code> is the right one.
                      Then in Vercel set Framework Preset <em>Vite</em>, Build Command{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">npm run build</code>, Output
                      Directory <code className="rounded bg-[#f1f3ee]/10 px-1">dist</code>, and redeploy.
                    </p>
                  </div>
                </div>

                {/* Updating later */}
                <div className="mt-3 rounded-xl border border-[#7fd4bd]/40 bg-[#7fd4bd]/8 p-4">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7fd4bd]">
                    <RefreshCw size={12} /> Updating the site later
                  </p>
                  <p className="text-xs leading-relaxed text-[#f1f3ee]/70">
                    Download the newest project, then on GitHub replace changed files in place —
                    open each folder and use <strong className="text-[#f1f3ee]">Add file → Upload
                    files</strong>: <code className="rounded bg-[#f1f3ee]/10 px-1">App.tsx</code> +{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">index.css</code> go into{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">src</code>;{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">summarize.ts</code> +{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">insights.ts</code> into{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">src/lib</code>;{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">sw.js</code> into{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">public</code>. Each commit
                    triggers a fresh deploy automatically.
                  </p>
                </div>

                <p className="mt-5 rounded-xl border-l-4 border-[#7fd4bd] bg-[#7fd4bd]/10 p-3.5 text-xs leading-relaxed text-[#f1f3ee]/70">
                  <strong className="text-[#7fd4bd]">Already have the Summa extension
                  working?</strong> Then you're done with the important part — everything below
                  only puts this <em>website</em> online at your domain. Take your time with it.
                </p>

                {/* Git commands — optional */}
                <div className="mt-6 rounded-xl bg-[#f1f3ee]/5 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#f1f3ee]/45">
                      <GitBranch size={12} /> Optional · git, if you want auto-updates later
                    </p>
                    <CopyButton
                      dark
                      label="Copy"
                      text={`git init\ngit add .\ngit commit -m "Add Summa"\ngit branch -M main\ngit remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git\ngit push -u origin main`}
                    />
                  </div>
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-[#f1f3ee]/80">
{`git init
git add .
git commit -m "Add Summa"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main`}
                  </pre>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#f1f3ee]/50">
                    Create the repo on github.com first and choose{" "}
                    <strong className="text-[#f1f3ee]/75">empty</strong> (no README), then swap in
                    your username and repo name. The project's{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">.gitignore</code> keeps{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">node_modules</code> out.
                  </p>
                  <p className="mt-2 border-t border-[#f1f3ee]/10 pt-2 text-[11px] leading-relaxed text-[#f1f3ee]/50">
                    <strong className="text-[#7fd4bd]">Where do I run these?</strong> Open the
                    project folder, click its address bar, type{" "}
                    <code className="rounded bg-[#f1f3ee]/10 px-1">cmd</code> and press Enter — a
                    terminal opens right there. (Windows 11: right-click empty space →{" "}
                    <em>Open in Terminal</em>. Mac: right-click the folder → Services → New
                    Terminal at Folder.)
                  </p>
                </div>

                {/* CLI alternative */}
                <div className="mt-4 rounded-xl bg-[#f1f3ee]/5 p-4">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#f1f3ee]/45">
                    <GitBranch size={12} /> Or skip GitHub entirely (Vercel CLI)
                  </p>
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-[#f1f3ee]/80">
{`npm i -g vercel
vercel          # links this folder to a new project
vercel --prod   # ships it live`}
                  </pre>
                </div>
              </div>

              {/* DNS card */}
              <div>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#f1f3ee]/50">
                  DNS records — add at your registrar
                </p>
                <div className="overflow-hidden rounded-xl border border-[#f1f3ee]/15">
                  <div className="grid grid-cols-[64px_60px_1fr_auto] gap-2 bg-[#f1f3ee]/8 px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#f1f3ee]/50">
                    <span>Type</span>
                    <span>Name</span>
                    <span>Value</span>
                    <span />
                  </div>
                  {[
                    { type: "A", name: "@", value: "76.76.21.21" },
                    { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
                  ].map((r) => (
                    <div
                      key={r.type}
                      className="grid grid-cols-[64px_60px_1fr_auto] items-center gap-2 border-t border-[#f1f3ee]/10 bg-[#0a1512] px-4 py-3"
                    >
                      <span className="rounded bg-[#0f8a6d]/25 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#7fd4bd]">
                        {r.type}
                      </span>
                      <span className="font-mono text-xs text-[#f1f3ee]/70">{r.name}</span>
                      <span className="truncate font-mono text-xs font-bold text-[#e8a33d]">
                        {r.value}
                      </span>
                      <CopyButton text={r.value} label="Copy" dark />
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#f1f3ee]/55">
                  The <strong className="text-[#f1f3ee]/80">A</strong> record covers{" "}
                  contentsummarize.com; the <strong className="text-[#f1f3ee]/80">CNAME</strong>{" "}
                  covers www.contentsummarize.com. Keep both.
                </p>

                {/* Domain conflict note */}
                <div className="mt-5 rounded-xl border-l-4 border-[#e8a33d] bg-[#e8a33d]/10 p-4">
                  <p className="text-xs leading-relaxed text-[#f1f3ee]/80">
                    <strong className="text-[#e8a33d]">Your domain is currently on
                    naturalwrite-nu?</strong> A domain can only belong to one Vercel project.
                    Either open <em>naturalwrite-nu → Settings → Domains</em> and remove it there
                    first — or just add it to the Summa project anyway: Vercel will tell you it's
                    in use and offer to move it over in one click.
                  </p>
                </div>
              </div>
            </div>
          </div>
          </Collapsible>
        </section>

        {/* Other ways (collapsed) */}
        <section className="reveal pb-20">
          <details className="group rounded-2xl border border-[#0c1a16]/15 bg-white/70 px-6 py-4 backdrop-blur-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-extrabold marker:content-none">
              Other ways & advanced
              <span className="text-[#0f8a6d] transition-transform group-open:rotate-45 text-2xl leading-none">
                +
              </span>
            </summary>
            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              <div>
                <h4 className="font-display mb-2 font-bold">Drag instead of paste</h4>
                <p className="mb-3 text-sm leading-relaxed text-[#0c1a16]/65">
                  On a real tab (not a preview pane), show the bookmarks bar and drag this chip onto
                  it:
                </p>
                <a
                  href={bookmarkletHref}
                  onClick={(e) => e.preventDefault()}
                  draggable
                  className="inline-flex cursor-grab items-center gap-1.5 rounded-full bg-[#0f8a6d] px-4 py-2 text-sm font-bold text-white shadow-md transition-transform hover:scale-105 active:cursor-grabbing"
                >
                  <Bolt size={12} fill="currentColor" /> Summarize
                </a>
              </div>
              <div>
                <h4 className="font-display mb-2 font-bold">Deploying somewhere else?</h4>
                <p className="mb-3 text-sm leading-relaxed text-[#0c1a16]/65">
                  The Vercel section above covers the full flow, but the{" "}
                  <code className="rounded bg-[#eef1ea] px-1">dist</code> folder from{" "}
                  <code className="rounded bg-[#eef1ea] px-1">npm run build</code> is plain static
                  files — it works identically on Netlify, GitHub Pages, Cloudflare Pages, or any
                  S3 bucket.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={downloadScript}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0c1a16] px-4 py-1.5 text-xs font-bold transition-colors hover:bg-[#0c1a16] hover:text-[#f1f3ee]"
                  >
                    <Download size={13} /> summarize.js
                  </button>
                  <InstallButton />
                </div>
              </div>
              <div>
                <h4 className="font-display mb-2 font-bold">Removing an old extension?</h4>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#0c1a16]/70">
                  <li>
                    Open <code className="rounded bg-[#eef1ea] px-1">chrome://extensions</code> and
                    remove the old Summarize.
                  </li>
                  <li>
                    Revoke its key at{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#0f8a6d] underline underline-offset-2"
                    >
                      platform.openai.com/api-keys
                      <ExternalLink size={11} className="ml-0.5 inline" />
                    </a>{" "}
                    so nothing keeps billing you.
                  </li>
                  <li>Restart the browser.</li>
                </ol>
              </div>
              <div className="flex items-start gap-3 rounded-xl border-l-4 border-[#0f8a6d] bg-[#0f8a6d]/8 p-4">
                <Bolt size={16} className="mt-0.5 flex-none text-[#0a5c49]" fill="currentColor" />
                <p className="text-sm leading-relaxed text-[#0c1a16]/70">
                  <strong>What either path gives you:</strong> one click → the entire page scanned
                  (nav and footers ignored) → 5 numbered main points + a full non-redundant
                  summary. Tune it with the scope toggle and the content-type dropdown (Auto /
                  Article / Email / Image-heavy / Docs / Thread), or hit <strong>From URL</strong>{" "}
                  to paste any link and summarize it without even visiting. With the extension
                  loaded, the teal button drops onto <strong>every page automatically</strong> —
                  no icon-clicking needed. Everything runs on your device.
                </p>
              </div>

              {/* Developer mode */}
              <div className="rounded-xl border-2 border-[#0c1a16] bg-[#0c1a16] p-5 text-[#f1f3ee] sm:col-span-2">
                <p className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e8a33d]">
                  <GitBranch size={13} /> Developer mode — take the code and build on it
                </p>
                <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
                  <div>
                    <p className="mb-2 text-xs font-bold text-[#f1f3ee]/80">Local setup</p>
                    <pre className="overflow-x-auto rounded-lg bg-[#f1f3ee]/8 p-3 font-mono text-xs leading-relaxed text-[#7fd4bd]">
{`npm install        # once, needs Node 18+
npm run dev        # live at http://localhost:5173
npm run build      # production bundle → dist/`}
                    </pre>
                    <p className="mt-2 text-xs leading-relaxed text-[#f1f3ee]/60">
                      Grab the source either way: download the project from Arena, or{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">git clone</code> your Summa
                      repo — copy the URL from the green{" "}
                      <strong className="text-[#7fd4bd]">&lt;&gt; Code</strong> button on GitHub and
                      paste it after <code className="rounded bg-[#f1f3ee]/10 px-1">git clone</code>{" "}
                      in a terminal. Edit in VS Code — changes hot-reload instantly on localhost.
                    </p>
                    <p className="mt-2 border-l-2 border-[#7fd4bd] pl-2 text-[11px] leading-relaxed text-[#7fd4bd]/90">
                      localhost missing a new feature? Your clone is older than Arena. Re-download
                      from Arena and overwrite <code className="rounded bg-[#f1f3ee]/10 px-1">src/App.tsx</code>{" "}
                      in your Summa folder — the dev server hot-reloads it instantly. Once you start
                      pushing your own edits, <code className="rounded bg-[#f1f3ee]/10 px-1">git pull</code>{" "}
                      keeps any machine in sync.
                    </p>
                    <p className="mt-2 border-l-2 border-[#e8a33d] pl-2 text-[11px] leading-relaxed text-[#e8a33d]/90">
                      Live site out of date? Sync everything at once: download the newest Arena
                      project, copy <em>all</em> its files into your local Summa folder (replace
                      when asked), then in Git Bash run{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">git add . && git commit -m "sync" && git push</code>.
                      Vercel rebuilds automatically and the live site matches Arena.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-xs font-bold text-[#f1f3ee]/80">
                      Grab an engine file — exact copy, no transcription
                    </p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {[
                        { name: "summarize.ts", src: summarizeSrc, note: "the scan engine" },
                        { name: "bookmarkletSource.ts", src: bookmarkletSrc, note: "the widget" },
                        { name: "widget.js", src: WIDGET_SOURCE, note: "extension copy" },
                      ].map((f) => (
                        <span key={f.name} className="inline-flex overflow-hidden rounded-lg border border-[#f1f3ee]/25">
                          <button
                            onClick={() => {
                              const blob = new Blob([f.src], { type: "text/plain" });
                              const u = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = u;
                              a.download = f.name;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              window.setTimeout(() => URL.revokeObjectURL(u), 4000);
                            }}
                            className="inline-flex items-center gap-1.5 bg-[#f1f3ee]/10 px-3 py-2 font-mono text-[11px] font-bold text-[#7fd4bd] transition-colors hover:bg-[#f1f3ee]/20"
                            title={`Download ${f.name} — ${f.note}`}
                          >
                            <Download size={12} /> {f.name}
                          </button>
                          <button
                            onClick={() => navigator.clipboard?.writeText(f.src)}
                            className="border-l border-[#f1f3ee]/20 px-2.5 py-2 text-[11px] font-bold text-[#f1f3ee]/60 transition-colors hover:bg-[#f1f3ee]/15 hover:text-[#f1f3ee]"
                            title="Copy the full file to your clipboard"
                          >
                            copy
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="mb-4 border-l-2 border-[#e8a33d] pl-2 text-[11px] leading-relaxed text-[#e8a33d]/90">
                      Paste into <strong>Notepad or VS Code</strong>, never WordPad — WordPad saves
                      rich text and turns straight quotes into curly ones, which breaks the build.
                      Downloading is safer than copying either way.
                    </p>
                    <p className="mb-2 text-xs font-bold text-[#f1f3ee]/80">File map</p>
                    <ul className="space-y-1.5 font-mono text-[11px] leading-relaxed text-[#f1f3ee]/70">
                      <li><span className="text-[#e8a33d]">src/App.tsx</span> — the whole page: proof, Workbench, install paths, deploy guide</li>
                      <li><span className="text-[#e8a33d]">src/lib/summarize.ts</span> — scan engine: 5 points + full non-redundant summary</li>
                      <li><span className="text-[#e8a33d]">src/lib/bookmarkletSource.ts</span> — the button widget (bookmark + ZIP)</li>
                      <li><span className="text-[#e8a33d]">extension/widget.js</span> — same widget, Chrome-extension copy</li>
                      <li><span className="text-[#e8a33d]">extension/manifest.json</span> — permissions + auto-inject on every page</li>
                      <li><span className="text-[#e8a33d]">public/sw.js</span> — offline cache + fresh-deploy logic</li>
                    </ul>
                    <p className="mt-2 border-l-2 border-[#e8a33d] pl-2 text-[11px] leading-relaxed text-[#e8a33d]/90">
                      One rule: <code className="rounded bg-[#f1f3ee]/10 px-1">extension/widget.js</code> and{" "}
                      <code className="rounded bg-[#f1f3ee]/10 px-1">bookmarkletSource.ts</code> are two
                      copies of the same scanner — change them together.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </section>
      </main>

      {/* Companion app — NaturalWrite */}
      <section className="relative mx-auto max-w-4xl px-5 pb-16">
        <div className="reveal overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-white shadow-[10px_10px_0_#4a6fb8]">
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#0c1a16] bg-gradient-to-r from-[#dfe6f5] via-[#d2ddf0] to-[#e4eaf7] px-5 py-2.5 sm:px-7">
            <span className="rounded-full bg-[#0c1a16] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9fb8e8]">
              Companion
            </span>
            <span className="font-display text-sm font-extrabold text-[#22345c]">
              Two halves of the same workflow
            </span>
          </div>

          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            {/* Summa side */}
            <div className="rounded-xl border border-[#0f8a6d]/30 bg-[#0f8a6d]/8 p-5">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0a5c49]">
                <Bolt size={12} fill="currentColor" /> You are here
              </p>
              <h3 className="font-display mb-1.5 text-lg font-extrabold text-[#0c1a16]">
                Summa — read faster
              </h3>
              <p className="text-sm leading-relaxed text-[#0c1a16]/70">
                Turns any page, PDF, or inbox into 5 main points plus a full summary. The intake
                half: get through the material.
              </p>
            </div>

            {/* Connector */}
            <div className="flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#0c1a16] bg-[#f7f9f5] text-[#0c1a16] shadow-sm">
                <ArrowLeftRight size={18} />
              </span>
            </div>

            {/* NaturalWrite side */}
            <div className="rounded-xl border border-[#4a6fb8]/35 bg-[#4a6fb8]/8 p-5">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#2f4a80]">
                <PenLine size={12} /> Companion app
              </p>
              <h3 className="font-display mb-1.5 text-lg font-extrabold text-[#0c1a16]">
                NaturalWrite — write better
              </h3>
              <p className="mb-4 text-sm leading-relaxed text-[#0c1a16]/70">
                Takes what you've gathered and helps you shape it into clear, natural prose. The
                output half: turn understanding into writing.
              </p>
              <a
                href="https://naturalwrite-nu.vercel.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#2f4a80] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(47,74,128,0.3)] transition-all hover:-translate-y-0.5 hover:bg-[#22345c]"
              >
                <PenLine size={14} /> Open NaturalWrite
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          <p className="border-t border-[#0c1a16]/10 bg-[#f7f9f5] px-6 py-3 text-center text-xs leading-relaxed text-[#0c1a16]/60 sm:px-8">
            <strong className="text-[#0c1a16]">Paired use:</strong> summarize a source here, copy
            the points, then open NaturalWrite to draft from them — research in, writing out.
          </p>
        </div>
      </section>

      <footer className="relative border-t border-[#0c1a16]/10 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-2 px-5 text-sm text-[#0c1a16]/55 sm:flex-row">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0c1a16] text-[#e8a33d]">
              <Bolt size={12} fill="currentColor" />
            </span>
            <span className="font-display font-bold text-[#0c1a16]">Summa</span>
          </span>
          <span>Runs entirely in your browser. Nothing leaves your machine.</span>
          <span className="flex items-center gap-3">
            <a
              href="https://naturalwrite-nu.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-bold text-[#2f4a80] transition-colors hover:text-[#4a6fb8]"
            >
              <PenLine size={12} /> NaturalWrite
            </a>
            <span className="text-[#0c1a16]/25">·</span>
            <a
              href="#deploy"
              className="font-mono font-bold text-[#0c1a16]/70 hover:text-[#0f8a6d] transition-colors"
            >
              → deploy
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Site />
    </ErrorBoundary>
  );
}
