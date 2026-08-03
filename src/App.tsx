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
} from "lucide-react";
import { WIDGET_SOURCE, buildBookmarkletHref } from "./lib/bookmarkletSource";
import { buildExtensionZip } from "./lib/extensionBundle";
import { readTime, scanDocument, wordCount } from "./lib/summarize";
import { deriveInsights, type InsightSet } from "./lib/insights";
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

const SAMPLE = {
  title: "How Machine Learning Is Quietly Rewriting Radiology",
  body: `Radiology departments around the world are facing an unprecedented workload. The number of imaging studies ordered each year has grown far faster than the supply of trained radiologists, leading to fatigue, burnout, and diagnostic delays. Into this gap stepped a new generation of machine learning models trained on millions of annotated scans. These systems do not replace radiologists; instead, they act as a tireless second reader, flagging subtle anomalies that a tired human eye might miss after a twelve-hour shift. In controlled trials, radiologists working alongside such models detected early-stage lung nodules at significantly higher rates than either the model or the physician alone. The most successful deployments treat the algorithm as a triage tool, pushing the most suspicious cases to the top of the worklist so that urgent patients are seen first. Skeptics rightly point out that models can inherit biases from their training data and may fail silently on equipment they have never seen. As a result, regulators now demand continuous monitoring and clear accountability for every automated suggestion. The emerging consensus is that the future of radiology is neither human nor machine, but a careful partnership in which each covers the other's blind spots.`,
};

/* ---------------- Document extractors (loaded on demand from CDN) ---------------- */

const PASTE_WORD_CAP = 7500;
const scriptCache: Record<string, Promise<void>> = {};

function loadScript(src: string): Promise<void> {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("loader"));
      document.head.appendChild(s);
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

/* ---------------- Workbench samples ---------------- */

const WB_SAMPLES: Record<string, { label: string; icon: typeof Newspaper; title: string; body: string }> = {
  news: { label: "News article", icon: Newspaper, title: SAMPLE.title, body: SAMPLE.body },
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

function Workbench() {
  const [mode, setMode] = useState<WbMode>("paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [urlState, setUrlState] = useState<"idle" | "loading" | "error">("idle");
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [result, setResult] = useState<{
    title: string;
    points: string[];
    details: string[];
    folded: number;
    insights: InsightSet;
  } | null>(null);

  const runAnalysis = (t: string, label: string) => {
    setBusy(true);
    setExpanded(null);
    window.setTimeout(() => {
      const scan = scanDocument(t, 5, label);
      setResult({
        title: label,
        points: scan.points,
        details: scan.details,
        folded: scan.folded,
        insights: deriveInsights(t, scan.points, scan.details),
      });
      setRunKey((k) => k + 1);
      setBusy(false);
    }, 650);
  };

  const runFromText = () => {
    if (text.trim().length < 120) return;
    setSource(null);
    runAnalysis(text, "Pasted material");
  };

  const runFromUrl = async () => {
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    setUrlState("loading");
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error("http");
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,style,noscript,nav,footer,aside").forEach((n) => n.remove());
      const t = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 200) throw new Error("thin");
      setText(t);
      setSource(u);
      setUrlState("idle");
      runAnalysis(t, new URL(u).hostname.replace(/^www\./, ""));
    } catch {
      setUrlState("error");
    }
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      let t = String(reader.result || "");
      if (/\.html?$/i.test(f.name)) {
        t = t
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ");
      }
      setText(t);
      setSource(f.name);
      runAnalysis(t, f.name);
    };
    reader.readAsText(f);
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
                    onClick={runFromUrl}
                    disabled={!url.trim() || urlState === "loading"}
                    className="rounded-xl bg-[#0f8a6d] px-5 font-bold text-white transition-all hover:bg-[#0a5c49] disabled:opacity-40"
                  >
                    {urlState === "loading" ? "…" : "Fetch"}
                  </button>
                </div>
                {urlState === "error" && (
                  <p className="mt-3 rounded-lg border-l-4 border-[#e8695a] bg-[#e8695a]/10 p-3 text-xs leading-relaxed text-[#b3402f]">
                    That site blocks browser-only fetching (or needs JavaScript to render). Paste
                    its text instead, or use the extension's <strong>From URL</strong> — extensions
                    bypass this limit.
                  </p>
                )}
                <p className="mt-3 text-xs leading-relaxed text-[#0c1a16]/55">
                  Works best with CORS-open sources (Wikipedia, public APIs, your own sites).
                  Nothing is sent to a server beyond the direct request to the page itself.
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
                  Transcripts, exports, saved articles — read instantly, never uploaded.
                </span>
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.text,.html,.htm"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
              </label>
            )}

            {source && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#0f8a6d]">
                <Link2 size={12} /> Source: <span className="truncate">{source}</span>
              </p>
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
              </div>
            )}
          </div>
        </div>
      </div>
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

  const { points, details, folded } = useMemo(
    () => scanDocument(SAMPLE.body, 5, SAMPLE.title),
    []
  );
  const [scanKey, setScanKey] = useState(0);

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
  } | null>(null);

  const proofWords = wordCount(proofText);
  const overCap = proofWords > PASTE_WORD_CAP;

  const runProof = (text: string, title: string) => {
    setProofBusy(true);
    setProofNote(null);
    window.setTimeout(() => {
      const scan = scanDocument(text, 5, title);
      setProofResult({
        title,
        words: wordCount(text),
        points: scan.points,
        details: scan.details,
        folded: scan.folded,
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
      const res = await fetch(root);
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
        const res = await fetch(url);
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
      <header className="relative border-b border-[#0c1a16]/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0c1a16] text-[#e8a33d]">
              <Bolt size={18} fill="currentColor" />
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight">Summa</span>
          </span>
          <span className="flex items-center gap-2">
            <a
              href="#workbench"
              className="hidden items-center gap-1.5 rounded-full border border-[#0c1a16]/20 bg-white px-3 py-1.5 text-xs font-bold text-[#0c1a16]/70 transition-all hover:-translate-y-0.5 hover:border-[#0f8a6d] hover:text-[#0f8a6d] sm:inline-flex"
            >
              <Sparkles size={12} /> Workbench
            </a>
            <a
              href="#deploy"
              className="hidden items-center gap-1.5 rounded-full border border-[#0c1a16]/20 bg-white px-3 py-1.5 text-xs font-bold text-[#0c1a16]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8a33d] hover:text-[#a86f1a] sm:inline-flex"
            >
              <Globe size={12} /> Deploy on Vercel
            </a>
            <a
              href="#deploy"
              className="rounded-full border border-[#0c1a16]/20 bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-tight text-[#0c1a16]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8a33d] hover:text-[#a86f1a]"
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
            <div className="flex gap-2">
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
              <h3 className="font-display text-2xl font-bold tracking-tight">{SAMPLE.title}</h3>
              <span className="text-xs font-semibold text-[#0c1a16]/45">
                {wordCount(SAMPLE.body)} words · {readTime(SAMPLE.body)} min read
              </span>
            </div>
            <div className="relative">
              <p className="max-w-3xl leading-relaxed text-[#0c1a16]/75">{SAMPLE.body}</p>
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
                </p>
                <h3 className="font-display text-2xl font-bold tracking-tight break-words">
                  {proofResult.title}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0c1a16]/45">
                  {proofResult.words.toLocaleString()} words ·{" "}
                  {Math.max(1, Math.round(proofResult.words / 220))} min read
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
        <div id="install" className="reveal mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#0f8a6d]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c1a16] text-[10px] text-[#e8a33d]">2</span>
            Step two · pick one
          </p>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Two ways to install — choose one
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#0c1a16]/70">
            <strong className="text-[#0c1a16]">Path A (bookmark)</strong> takes 60 seconds — just
            copy and paste. <strong className="text-[#0c1a16]">Path B (extension)</strong> takes a
            couple of minutes but also works on Gmail, GitHub, and X. You only need one of them.
          </p>
        </div>

        {/* THE install card */}
        <section className="reveal overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-white shadow-[10px_10px_0_#0c1a16]">
          {/* Path A header */}
          <div className="flex items-center gap-2 border-b-2 border-[#0c1a16] bg-[#e8a33d] px-5 py-2.5 sm:px-7">
            <span className="rounded-full bg-[#0c1a16] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#e8a33d]">
              Path A
            </span>
            <span className="font-display text-sm font-extrabold text-[#0c1a16]">
              The 60-second bookmark — works on news, blogs, Wikipedia, docs
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

        {/* Chrome extension path */}
        <section className="reveal mt-10">
          <div className="overflow-hidden rounded-2xl border-2 border-[#0f8a6d] bg-white shadow-[10px_10px_0_#0f8a6d]">
            <div className="flex items-center gap-2 border-b-2 border-[#0f8a6d] bg-[#0f8a6d] px-5 py-2.5 sm:px-7">
              <span className="rounded-full bg-[#0c1a16] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#e8a33d]">
                Path B
              </span>
              <span className="font-display text-sm font-extrabold text-white">
                Chrome extension — the powerful one, works on Gmail, GitHub, X
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

        {/* Not showing up? — always visible */}
        <section className="reveal pb-10">
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
        </section>

        {/* Vercel deploy guide */}
        <section id="deploy" className="reveal pb-20">
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
            </div>
          </details>
        </section>
      </main>

      <footer className="relative border-t border-[#0c1a16]/10 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-2 px-5 text-sm text-[#0c1a16]/55 sm:flex-row">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0c1a16] text-[#e8a33d]">
              <Bolt size={12} fill="currentColor" />
            </span>
            <span className="font-display font-bold text-[#0c1a16]">Summa</span>
          </span>
          <span>Runs entirely in your browser. Nothing leaves your machine.</span>
          <a
            href="#deploy"
            className="font-mono font-bold text-[#0c1a16]/70 hover:text-[#0f8a6d] transition-colors"
          >
            → deploy to contentsummarize.com
          </a>
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
