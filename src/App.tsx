import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bolt,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MonitorDown,
  Puzzle,
  ShieldCheck,
  X,
  FileJson,
  FileCode2,
} from "lucide-react";
import { WIDGET_SOURCE, buildBookmarkletHref } from "./lib/bookmarkletSource";
import { buildExtensionZip, MANIFEST_JSON } from "./lib/extensionZip";
import { readTime, scanDocument, wordCount } from "./lib/summarize";

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

  const manifestValid = useMemo(() => {
    try {
      const m = JSON.parse(MANIFEST_JSON);
      return m.manifest_version === 3 && !!m.name && !!m.content_scripts?.[0]?.js?.length;
    } catch {
      return false;
    }
  }, []);

  const { points, details, folded } = useMemo(
    () => scanDocument(SAMPLE.body, 5, SAMPLE.title),
    []
  );

  const taRef = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState(false);
  const [injected, setInjected] = useState(false);
  const [injectFailed, setInjectFailed] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [zipDone, setZipDone] = useState(false);

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

  const saveFile = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const downloadScript = () => saveFile(WIDGET_SOURCE, "summarize.js", "text/javascript");
  const downloadManifest = () => saveFile(MANIFEST_JSON, "manifest.json", "application/json");
  const downloadContentJs = () => saveFile(WIDGET_SOURCE, "content.js", "text/javascript");

  // The sure-fire path: a real extension zip that injects the button on
  // every page automatically — no bookmarks, no pasting, no previews eating it.
  const downloadExtension = async () => {
    setZipping(true);
    try {
      const blob = await buildExtensionZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "summa-extension.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setZipDone(true);
      window.setTimeout(() => setZipDone(false), 2600);
    } catch {
      /* zip failed — the bookmark path still works */
    }
    setZipping(false);
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#f1f3ee] text-[#0c1a16]">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="drift-a pointer-events-none absolute -top-40 -left-40 h-[460px] w-[460px] rounded-full bg-[#0f8a6d]/10 blur-3xl" />
      <div className="drift-b pointer-events-none absolute top-[60%] -right-48 h-[500px] w-[500px] rounded-full bg-[#e8a33d]/10 blur-3xl" />

      {/* Header */}
      <header className="relative border-b border-[#0c1a16]/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0c1a16] text-[#e8a33d]">
              <Bolt size={18} fill="currentColor" />
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight">Summa</span>
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0c1a16]/50">
            No extension · one bookmark
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-5">
        {/* Headline */}
        <div className="pt-14 pb-8 sm:pt-20">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            A Summarize button
            <br />
            for every page you read.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#0c1a16]/70">
            Two ways in: copy one link into a bookmark, or load the tiny extension and the button
            lands on every page by itself. Either way — no account, no tracking, Gmail included.
          </p>
        </div>

        {/* Works-everywhere marquee */}
        <div className="reveal -mx-5 mb-10 overflow-hidden border-y border-[#0c1a16]/10 bg-[#0c1a16] py-3">
          <div className="marquee-track flex w-max items-center gap-8 text-xs font-semibold text-[#f1f3ee]/60">
            {[0, 1].map((dup) =>
              [
                "news articles", "gmail threads", "arxiv papers", "wikipedia", "docs & wikis",
                "medium posts", "reports & pdfs", "reddit threads", "blog posts", "long emails",
              ].map((d) => (
                <span key={dup + d} className="flex items-center gap-2">
                  <Bolt size={10} className="text-[#e8a33d]" fill="currentColor" />
                  works on {d}
                </span>
              ))
            )}
          </div>
        </div>

        {/* THE install card */}
        <section className="reveal overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-white shadow-[10px_10px_0_#0c1a16]">
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
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border-l-4 border-[#e8a33d] bg-[#e8a33d]/10 px-3.5 py-3">
              <span className="mt-0.5 text-sm font-black text-[#a86f1a]">!</span>
              <p className="text-xs leading-relaxed text-[#0c1a16]/70">
                <strong className="text-[#0c1a16]">If clicking your bookmark does nothing</strong>{" "}
                (or shows a wall of code), Chrome/Edge silently stripped the{" "}
                <code className="rounded bg-white px-1 font-mono">javascript:</code> prefix when you
                pasted. Right-click the bookmark → Edit, and make sure the URL still starts with
                those 11 characters — retype them if they vanished. Or skip all of this with the
                extension below.
              </p>
            </div>
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

        {/* Extension — the sure-fire path */}
        <section className="reveal pt-16 sm:pt-20">
          <div className="overflow-hidden rounded-2xl border-2 border-[#0c1a16] bg-[#0c1a16] text-[#f1f3ee] shadow-[10px_10px_0_rgba(12,26,22,0.3)]">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_1fr]">
              {/* Steps */}
              <div className="p-7 sm:p-9">
                <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#e8a33d]">
                  <Puzzle size={13} /> Most reliable
                </p>
                <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                  Skip the bookmark.
                  <br />
                  Let the button show up itself.
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-[#f1f3ee]/65">
                  This downloads a tiny extension (three files, no store, no permissions beyond
                  reading pages). Load it once and the teal Summarize button injects into every
                  webpage automatically — previews, paste bugs and prefix-stripping can't touch it.
                </p>
                <ol className="mt-7 space-y-5">
                  {[
                    ["Unzip the download (or grab the two files at right)", "Either way you need a folder whose top level holds manifest.json."],
                    ["Open chrome://extensions", "Edge uses edge://extensions — same screen."],
                    ["Switch on Developer mode", "The toggle lives in the top-right corner of that page."],
                    ["Click “Load unpacked” and pick that folder", "Select the folder itself — not the .zip, not the folder above it."],
                  ].map(([t, d], i) => (
                    <li key={t} className="group flex gap-4">
                      <span className="font-display flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#e8a33d] text-sm font-extrabold text-[#0c1a16] transition-transform group-hover:scale-110">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-display text-sm font-bold text-[#f1f3ee]">{t}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[#f1f3ee]/55">{d}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {/* Exact-error troubleshooting */}
                <div className="mt-8 rounded-xl border border-[#e8695a]/40 bg-[#e8695a]/10 p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#e8695a]">
                    Seeing “Manifest file is missing or unreadable”?
                  </p>
                  <p className="text-xs leading-relaxed text-[#f1f3ee]/75">
                    That error means Chrome was pointed at the <strong>.zip file</strong> or the
                    wrong folder. “Load unpacked” needs the folder that{" "}
                    <em>directly contains</em> manifest.json — like this:
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-[#0c1a16] p-4 font-mono text-xs leading-relaxed text-[#f1f3ee]/80">
{`summa/              ← select THIS folder
├── manifest.json   ← must sit at the top level
├── content.js
└── README.txt`}
                  </pre>
                  <p className="mt-3 text-xs leading-relaxed text-[#f1f3ee]/60">
                    If your unzipped folder instead shows a single folder inside it, go one level
                    deeper. If you skipped the zip, download the two files at right and drop them
                    into any new folder yourself.
                  </p>
                </div>
              </div>

              {/* Download card */}
              <div className="dot-grid-light flex flex-col justify-center gap-4 border-t-2 border-[#f1f3ee]/10 bg-[#0f8a6d] p-7 sm:p-9 lg:border-l-2 lg:border-t-0">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0c1a16] text-[#e8a33d] shadow-lg">
                  <Puzzle size={30} />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#0c1a16]/30 px-2.5 py-1 text-[#f1f3ee]">
                    {manifestValid ? <ShieldCheck size={11} /> : <X size={11} />}
                    manifest {manifestValid ? "valid" : "failed"}
                  </span>
                  <span className="rounded-full bg-[#0c1a16]/30 px-2.5 py-1 text-[#f1f3ee]">3 files</span>
                  <span className="rounded-full bg-[#0c1a16]/30 px-2.5 py-1 text-[#f1f3ee]">~5 KB</span>
                </div>
                <div>
                  <p className="font-display text-xl font-extrabold">summa-extension.zip</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#f1f3ee]/75">
                    manifest.json + content.js + a README with these exact steps.
                  </p>
                </div>
                <button
                  onClick={downloadExtension}
                  disabled={zipping}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-bold transition-all ${
                    zipDone
                      ? "bg-[#f1f3ee] text-[#0a5c49]"
                      : "bg-[#0c1a16] text-[#f1f3ee] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.35)] active:translate-y-0"
                  }`}
                >
                  {zipping ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Packing…
                    </>
                  ) : zipDone ? (
                    <>
                      <Check size={16} /> Saved — now unzip it
                    </>
                  ) : (
                    <>
                      <Download size={16} /> Download extension (.zip)
                    </>
                  )}
                </button>
                <div className="border-t border-[#f1f3ee]/20 pt-4">
                  <p className="mb-2.5 text-[11px] font-semibold text-[#f1f3ee]/70">
                    Unzip acting up? Grab the two files yourself and drop them in any new folder:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={downloadManifest}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#f1f3ee]/40 px-3.5 py-1.5 text-xs font-bold text-[#f1f3ee] transition-colors hover:bg-[#0c1a16]/30"
                    >
                      <FileJson size={13} /> manifest.json
                    </button>
                    <button
                      onClick={downloadContentJs}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#f1f3ee]/40 px-3.5 py-1.5 text-xs font-bold text-[#f1f3ee] transition-colors hover:bg-[#0c1a16]/30"
                    >
                      <FileCode2 size={13} /> content.js
                    </button>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-[#f1f3ee]/60">
                  Firefox instead? Open about:debugging → “Load Temporary Add-on” → pick
                  manifest.json from the folder.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Live test */}
        <section className="reveal py-16 sm:py-20">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#0f8a6d]">
                Prove it first
              </p>
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Run the exact script, right here
              </h2>
            </div>
            <button
              onClick={injectReal}
              className="inline-flex items-center gap-2 rounded-full bg-[#0f8a6d] px-5 py-3 font-semibold text-white shadow-[0_10px_26px_rgba(15,138,109,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#0a5c49]"
            >
              <Bolt size={15} fill="currentColor" />
              {injected ? "Injected — use the teal button ↘" : "Inject the real button"}
            </button>
          </div>

          {injectFailed && (
            <p className="mb-4 rounded-lg bg-[#e8695a]/10 p-3 text-sm font-semibold text-[#b3402f]">
              Couldn't inject here — that's a sandbox limit, not a script problem. It will run from
              your bookmark on normal pages.
            </p>
          )}

          <article className="rounded-2xl border border-[#0c1a16]/12 bg-white p-7 shadow-sm sm:p-10">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-2xl font-bold tracking-tight">{SAMPLE.title}</h3>
              <span className="text-xs font-semibold text-[#0c1a16]/45">
                {wordCount(SAMPLE.body)} words · {readTime(SAMPLE.body)} min read
              </span>
            </div>
            <p className="max-w-3xl leading-relaxed text-[#0c1a16]/75">{SAMPLE.body}</p>

            <div className="mt-8 rounded-xl border border-[#0f8a6d]/30 bg-[#0f8a6d]/10 p-5 sm:p-6">
              <p className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0a5c49]">
                <Bolt size={11} fill="currentColor" />
                What the scanner pulls out — 5 main points
              </p>
              <ol className="space-y-3">
                {points.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[#0c1a16] text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-[#0c1a16]/80">{p}</span>
                  </li>
                ))}
              </ol>

              {details.length > 0 && (
                <div className="mt-5 border-t border-[#0f8a6d]/25 pt-4">
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
                ? "Now click the teal button in the bottom-right corner — same one your bookmark will add."
                : "Inject the button above and compare — it should find these same points on any page."}
            </p>
          </article>
        </section>

        {/* Other ways (collapsed) */}
        <section className="reveal pb-20">
          <details className="group rounded-2xl border border-[#0c1a16]/15 bg-white/70 px-6 py-4 backdrop-blur-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-extrabold marker:content-none">
              Other ways & troubleshooting
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
                <h4 className="font-display mb-2 font-bold">Read or host the script</h4>
                <p className="mb-3 text-sm leading-relaxed text-[#0c1a16]/65">
                  ~4 KB, dependency-free, nothing leaves your browser. Load it in Tampermonkey to
                  auto-inject on every site.
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
              <div>
                <h4 className="font-display mb-2 font-bold">Button still not showing?</h4>
                <ul className="space-y-1.5 text-sm leading-relaxed text-[#0c1a16]/70">
                  <li className="flex gap-2">
                    <span className="font-bold text-[#0f8a6d]">1.</span>
                    Bookmark saved but dead? The <code className="rounded bg-[#eef1ea] px-1">javascript:</code> prefix got stripped — retype it in the bookmark's URL.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-[#0f8a6d]">2.</span>
                    Nothing at all? Load the extension above — it bypasses bookmarks entirely.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-[#0f8a6d]">3.</span>
                    Old chip from a previous install? Delete it first, then reinstall — the browser keeps running stale code otherwise.
                  </li>
                </ul>
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
