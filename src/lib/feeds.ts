/**
 * Live article feed — pulls current headlines from open RSS sources so the
 * demo always has fresh, real material to scan.
 *
 * Browsers can't fetch most news sites directly (CORS), so we go through
 * a public JSON-RSS bridge. Everything is read-only and public; nothing
 * about the user is transmitted. If a source is unreachable we say so
 * rather than silently showing stale content.
 */

export interface FeedSource {
  id: string;
  label: string;
  url: string;
  /** Wikipedia articles fetch their full text; RSS gives summaries only. */
  kind: "rss";
}

export interface LiveArticle {
  title: string;
  summary: string;
  link: string;
  source: string;
  published?: string;
}

export const FEED_SOURCES: FeedSource[] = [
  {
    id: "science",
    label: "Science",
    kind: "rss",
    url: "https://feeds.arstechnica.com/arstechnica/science",
  },
  {
    id: "tech",
    label: "Technology",
    kind: "rss",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
  },
  {
    id: "world",
    label: "World news",
    kind: "rss",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  {
    id: "business",
    label: "Business",
    kind: "rss",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
  },
  {
    id: "research",
    label: "Research",
    kind: "rss",
    url: "https://phys.org/rss-feed/breaking/science-news/",
  },
];

const BRIDGE = "https://api.rss2json.com/v1/api.json?rss_url=";

function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch and normalise one feed. Throws with a readable message on failure. */
export async function fetchFeed(source: FeedSource): Promise<LiveArticle[]> {
  const res = await fetch(BRIDGE + encodeURIComponent(source.url), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Feed unreachable (HTTP ${res.status})`);
  const json = (await res.json()) as {
    status?: string;
    items?: { title?: string; description?: string; content?: string; link?: string; pubDate?: string }[];
  };
  if (json.status !== "ok" || !json.items?.length) {
    throw new Error("Feed returned no articles");
  }
  return json.items
    .map((it) => {
      const body = stripHtml(it.content || it.description || "");
      return {
        title: stripHtml(it.title || "Untitled"),
        summary: body,
        link: it.link || "",
        source: source.label,
        published: it.pubDate,
      };
    })
    .filter((a) => a.summary.length > 120)
    .slice(0, 12);
}

/** Wikipedia's daily most-read — a reliable, CORS-open trending signal. */
export async function fetchTrendingWiki(): Promise<LiveArticle[]> {
  const d = new Date(Date.now() - 86400000); // yesterday: today's list may not exist yet
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const res = await fetch(
    `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${y}/${m}/${day}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Wikipedia trending unavailable (HTTP ${res.status})`);
  const json = (await res.json()) as {
    mostread?: { articles?: { titles?: { normalized?: string }; extract?: string; content_urls?: { desktop?: { page?: string } }; views?: number }[] };
  };
  const items = json.mostread?.articles ?? [];
  return items
    .map((a) => ({
      title: a.titles?.normalized || "Untitled",
      summary: (a.extract || "").replace(/\s+/g, " ").trim(),
      link: a.content_urls?.desktop?.page || "",
      source: "Wikipedia · most read",
      published: undefined,
    }))
    .filter((a) => a.summary.length > 120)
    .slice(0, 12);
}

/** Fetch the full article text for a Wikipedia link (much richer than the extract). */
export async function fetchWikiFullText(link: string): Promise<string> {
  const u = new URL(link);
  const title = decodeURIComponent(u.pathname.replace("/wiki/", ""));
  const api =
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts` +
    `&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`;
  const res = await fetch(api, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load the full article");
  const json = (await res.json()) as {
    query?: { pages?: Record<string, { extract?: string }> };
  };
  const page = Object.values(json.query?.pages ?? {})[0];
  return (page?.extract || "").replace(/\s+/g, " ").trim();
}
