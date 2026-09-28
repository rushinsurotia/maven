import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { safeFetch } from "./safe-fetch";
import type { Knowledge, KnowledgeChunk } from "./types";

const USER_AGENT = "MavenBot/0.1 (+https://github.com/rushinsurotia/maven)";
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|mp4|mp3|mov|avi|css|js|json|xml|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i;
const BLOCK_TAGS = "p,div,li,h1,h2,h3,h4,h5,h6,tr,section,article,header,footer,aside,main,blockquote,dt,dd,address,td,th,br";

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  lines: string[];
}

export interface SiteMeta {
  siteName: string;
  description: string;
  themeColor?: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  meta: SiteMeta;
}

function normalizeHost(host: string) {
  return host.replace(/^www\./, "").toLowerCase();
}

function normalizeUrl(u: URL): string {
  const copy = new URL(u.toString());
  copy.hash = "";
  for (const p of [...copy.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$)/i.test(p)) copy.searchParams.delete(p);
  }
  let s = copy.toString();
  if (s.endsWith("/") && copy.pathname !== "/") s = s.slice(0, -1);
  return s;
}

export function extractPage(html: string, url: string): { page: CrawledPage; links: string[]; meta: SiteMeta } {
  const $ = cheerio.load(html);
  const title = ($("title").first().text() || $("h1").first().text() || url).trim().replace(/\s+/g, " ");
  const description = ($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "").trim();
  const siteName = ($('meta[property="og:site_name"]').attr("content") || title.split(/\s[|\-–—·:]\s/)[0] || "").trim();
  const themeColor = $('meta[name="theme-color"]').attr("content")?.trim();

  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    try {
      links.push(new URL(href, url).toString());
    } catch {
      /* ignore bad links */
    }
  });

  // Keep tel:/mailto: targets as text: they are often the only place a phone
  // number or email appears.
  $('a[href^="tel:"], a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href")!;
    const value = decodeURIComponent(href.replace(/^(tel|mailto):/, ""));
    if (!$(el).text().includes(value)) $(el).append(` (${value})`);
  });

  $("script,style,noscript,svg,iframe,template,canvas,form select").remove();
  $(BLOCK_TAGS).each((_, el) => {
    $(el).append("\n");
  });
  const text = $("body").length ? $("body").text() : $.root().text();
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);

  // Collapse consecutive duplicates produced by nested block elements.
  const deduped = lines.filter((l, i) => l !== lines[i - 1]);
  return { page: { url, title, description, lines: deduped }, links, meta: { siteName, description, themeColor } };
}

async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string } | undefined> {
  const res = await safeFetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return undefined;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/html") && !type.includes("xhtml")) return undefined;
  const html = await res.text();
  return { html: html.slice(0, 2_000_000), finalUrl: res.url || url };
}

async function sitemapUrls(origin: string, timeoutMs: number): Promise<string[]> {
  try {
    const res = await safeFetch(`${origin}/sitemap.xml`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => !u.endsWith(".xml"));
  } catch {
    return [];
  }
}

export async function crawlSite(
  startUrl: string,
  opts: { maxPages?: number; timeoutMs?: number; onProgress?: (url: string, count: number) => void } = {},
): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? 40;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const start = new URL(startUrl);
  const host = normalizeHost(start.hostname);
  const sameSite = (u: URL) => normalizeHost(u.hostname) === host && !SKIP_EXT.test(u.pathname);

  const queue: string[] = [normalizeUrl(start)];
  const seen = new Set(queue);
  const enqueue = (raw: string, front = false) => {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return;
    }
    if (!sameSite(u)) return;
    const n = normalizeUrl(u);
    if (seen.has(n)) return;
    seen.add(n);
    front ? queue.unshift(n) : queue.push(n);
  };

  const pages: CrawledPage[] = [];
  let meta: SiteMeta = { siteName: start.hostname, description: "" };
  let sitemapLoaded = false;

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift()!;
    opts.onProgress?.(url, pages.length);
    try {
      const got = await fetchHtml(url, timeoutMs);
      if (!got) continue;
      const { page, links, meta: pageMeta } = extractPage(got.html, got.finalUrl);
      if (pages.length === 0) meta = pageMeta;
      if (page.lines.length) pages.push(page);
      // Prioritize pages that usually hold the facts customers ask about.
      for (const l of links) enqueue(l, /contact|about|hours|faq|pricing|price|services|book|location|team|menu|policy|shipping|return/i.test(l));
    } catch {
      /* skip unreachable pages */
    }
    if (!sitemapLoaded) {
      sitemapLoaded = true;
      for (const u of await sitemapUrls(start.origin, timeoutMs)) enqueue(u);
    }
  }
  if (!pages.length) throw new Error(`Couldn't read any pages from ${startUrl}. Check the URL is public and returns HTML.`);
  return { pages, meta };
}

// Turns crawled pages into search chunks. Lines repeated across many pages
// (nav, footer) are pulled out into one "site-wide" page so they are kept
// once instead of polluting every chunk. Footers often hold hours and contacts.
export function buildKnowledge(pages: CrawledPage[], maxChunkChars = 1200): Knowledge {
  const freq = new Map<string, number>();
  for (const p of pages) for (const l of new Set(p.lines)) freq.set(l, (freq.get(l) ?? 0) + 1);
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const boilerplate = new Set([...freq].filter(([, n]) => pages.length >= 3 && n >= threshold).map(([l]) => l));

  const docs = pages.map((p) => ({ url: p.url, title: p.title, lines: p.lines.filter((l) => !boilerplate.has(l)) }));
  if (boilerplate.size) {
    docs.push({ url: pages[0].url, title: "Site-wide information (header/footer)", lines: [...boilerplate] });
  }

  const chunks: KnowledgeChunk[] = [];
  const seenText = new Set<string>();
  for (const d of docs) {
    let buf: string[] = [];
    let len = 0;
    const flush = () => {
      const text = buf.join("\n").trim();
      buf = [];
      len = 0;
      if (text.length < 20) return;
      const hash = crypto.createHash("sha1").update(text).digest("hex");
      if (seenText.has(hash)) return;
      seenText.add(hash);
      chunks.push({ id: hash.slice(0, 12), url: d.url, title: d.title, text });
    };
    for (const line of d.lines) {
      const piece = line.length > maxChunkChars ? line.slice(0, maxChunkChars) : line;
      if (len + piece.length > maxChunkChars && buf.length) {
        const last = buf[buf.length - 1];
        flush();
        // Carry the previous line over for context across the boundary.
        if (last.length < 200) {
          buf.push(last);
          len = last.length;
        }
      }
      buf.push(piece);
      len += piece.length + 1;
    }
    flush();
  }
  return { pages: pages.map((p) => ({ url: p.url, title: p.title })), chunks };
}
