// Reading RSS and Atom feeds: download (with retry, fallback address, cache), paging,
// date window, HTML cleaning, Google News link decoding. One bad feed never stops the run.
import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkWindow, parseDate } from './dates.ts';
import { cleanUrl, makeId } from './urls.ts';
import type { FeedConfig, Item, Skipped } from './schemas.ts';
import type { Resolved } from './resolveUrl.ts';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const TIMEOUT_MS = 25000;
const MAX_PAGES = 15;
const SNIPPET_MAX = 400;

export type GetText = (url: string) => Promise<string>;
export type ResolveFn = (link: string) => Promise<Resolved>;

// What one feed gives back to the main script.
export type CollectResult = {
  items: Item[];
  skipped: Skipped[];
  tooOld: number; // counted, not logged (too many)
  fallbackUsed: boolean;
  status: 'OK' | 'ERROR';
  note?: string;
};

export type Deps = {
  getText: GetText;
  resolve: ResolveFn;
  now: Date;
  matcher?: (text: string) => boolean; // keyword prefilter
  pauseMs?: number; // pause between pages
  log?: (msg: string) => void;
};

// --- Downloading -----------------------------------------------------------------------

// Download text. Retry once after a short pause. Raw copies are saved in the cache folder;
// with offline=true we read only from the cache.
export function makeGetText(opts: { cacheDir: string; offline?: boolean; fetchFn?: typeof fetch; retryPauseMs?: number }): GetText {
  const fetchFn = opts.fetchFn ?? fetch;
  const retryPause = opts.retryPauseMs ?? 2000;
  return async (url) => {
    const file = join(opts.cacheDir, createHash('sha1').update(url).digest('hex').slice(0, 16) + '.txt');
    if (opts.offline) {
      if (!existsSync(file)) throw new Error('not in cache (offline)');
      return readFileSync(file, 'utf8');
    }
    const attempt = async () => {
      const res = await fetchFn(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    };
    let text: string;
    try {
      text = await attempt();
    } catch {
      await new Promise((r) => setTimeout(r, retryPause));
      try {
        text = await attempt();
      } catch (e) {
        const err = e as Error & { cause?: { code?: string } };
        throw new Error(err.cause?.code ?? err.message);
      }
    }
    mkdirSync(opts.cacheDir, { recursive: true });
    writeFileSync(file, text);
    return text;
  };
}

// --- Cleaning text -------------------------------------------------------------------

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&#8217;': '’', '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”', '&#8211;': '–', '&#8212;': '—', '&#8230;': '…' };

// Remove HTML tags and common entities, collapse spaces, cap the length.
export function stripHtml(html: string | undefined, max = SNIPPET_MAX): string {
  if (!html) return '';
  let text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  text = text.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m) => {
    if (ENTITIES[m]) return ENTITIES[m];
    const num = m.match(/^&#(x?)([0-9a-f]+);$/i);
    return num ? String.fromCodePoint(parseInt(num[2], num[1] ? 16 : 10)) : ' ';
  });
  text = text.replace(/\s+/g, ' ').trim();
  // WordPress feeds add "The post X appeared first on Y." to every summary. Not content.
  text = text.replace(/\s*The post .+ appeared first on .+?\.?$/, '').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// --- Parsing ---------------------------------------------------------------------------

type Entry = { title?: string; link?: string; pubDate?: string; isoDate?: string; content?: string; contentSnippet?: string; summary?: string; source?: { _?: string } | string; [k: string]: unknown };

const parser = new Parser({ customFields: { item: ['source', 'description'] } });

export async function parseEntries(xml: string): Promise<Entry[]> {
  const feed = await parser.parseString(xml);
  return feed.items as Entry[];
}

const isGoogleLink = (link: string) => new URL(link).hostname === 'news.google.com';

function sourceName(e: Entry): string | undefined {
  const s = e.source;
  const name = typeof s === 'string' ? s : s?._;
  return name?.trim() || undefined;
}

// Google News titles end with " - Outlet". Remove that suffix.
export function stripOutletSuffix(title: string, outlet?: string): string {
  const padded = ` ${title}`; // so a title that is only " - Outlet" (leading space already trimmed) still matches
  if (outlet && padded.endsWith(` - ${outlet}`)) return padded.slice(0, -(outlet.length + 3)).trim();
  return padded.replace(/ - [^-]+$/, '').trim();
}

// Turn parsed entries into Items. Applies the 7-day window and the undated rule.
// Google News links are NOT decoded here (see collectRss).
export function entriesToItems(entries: Entry[], feed: FeedConfig, now: Date) {
  const items: Item[] = [];
  const skipped: Skipped[] = [];
  let tooOld = 0;
  let emptyTitles = 0;
  for (const e of entries) {
    const title = stripHtml(e.title, 500);
    const link = e.link?.trim();
    if (!title || !link) continue;
    // Google News lists site files (scripts) as entries with an empty title (" - Outlet"). Not articles.
    if (isGoogleLink(link) && !stripOutletSuffix(title, sourceName(e))) {
      emptyTitles++;
      continue;
    }
    const date = parseDate(e.isoDate) ?? parseDate(e.pubDate);
    if (!date) {
      skipped.push({ reason: 'undated', title, url: link, feed: feed.name });
      continue;
    }
    const age = checkWindow(date, now);
    if (age === 'too_old') {
      tooOld++;
      continue;
    }
    if (age === 'future') {
      skipped.push({ reason: 'undated', title, url: link, feed: feed.name, published_at: date.toISOString() });
      continue;
    }
    const google = isGoogleLink(link);
    // Outlet is always the feed name, so one outlet never appears under two spellings
    // (Google's <source> says "South China Morning Post", our own SCMP feed says "SCMP").
    const outlet = feed.name;
    // Google News items carry no real summary (the description is just a link), so snippet stays empty.
    const snippet = google ? '' : stripHtml(e.contentSnippet || e.content || e.summary || (e.description as string | undefined));
    let url: string;
    try {
      url = google ? link : cleanUrl(link);
    } catch {
      continue; // link is not a valid URL: nothing to keep
    }
    const item: Item = {
      id: makeId(url),
      title: google ? stripOutletSuffix(title, sourceName(e)) : title,
      url,
      outlet,
      outlet_type: feed.type,
      published_at: date.toISOString(),
      snippet,
    };
    if (feed.region) item.region = feed.region;
    if (feed.lane) item.lane = feed.lane;
    items.push(item);
  }
  return { items, skipped, tooOld, emptyTitles };
}

// --- Collecting one feed ---------------------------------------------------------------

// Download one address; if it fails and a fallback exists, try the fallback once.
async function getWithFallback(url: string, fallback: string | undefined, getText: GetText): Promise<{ xml: string; fallbackUsed: boolean }> {
  try {
    return { xml: await getText(url), fallbackUsed: false };
  } catch (e) {
    if (!fallback) throw e;
    return { xml: await getText(fallback), fallbackUsed: true };
  }
}

function withPage(url: string, page: number): string {
  const u = new URL(url);
  u.searchParams.set('paged', String(page));
  return u.toString();
}

// One address worth of entries, following ?paged=N when the feed says so.
async function readAddress(feed: FeedConfig, url: string, deps: Deps, usePaging: boolean) {
  const first = await getWithFallback(url, feed.fallback_url, deps.getText);
  let entries = await parseEntries(first.xml);
  let note: string | undefined;
  if (usePaging) {
    const seen = new Set(entries.map((e) => e.link));
    for (let page = 2; page <= MAX_PAGES; page++) {
      const dates = entries.slice(-10).map((e) => parseDate(e.isoDate) ?? parseDate(e.pubDate)).filter((d): d is Date => d !== null);
      // Stop once the last page reached items older than the window.
      if (dates.length && dates.some((d) => checkWindow(d, deps.now) === 'too_old')) break;
      await new Promise((r) => setTimeout(r, deps.pauseMs ?? 300));
      let more: Entry[];
      try {
        more = await parseEntries(await deps.getText(withPage(url, page)));
      } catch (e) {
        note = `paging stopped at page ${page}: ${(e as Error).message}`;
        break;
      }
      const fresh = more.filter((e) => e.link && !seen.has(e.link));
      if (!fresh.length) break; // empty or repeated page
      fresh.forEach((e) => seen.add(e.link));
      entries = entries.concat(fresh);
    }
  }
  return { entries, fallbackUsed: first.fallbackUsed, note };
}

// Decode Google News links to real URLs. Failures are logged as undecodable_link.
async function decodeGoogleItems(items: Item[], feed: FeedConfig, deps: Deps) {
  const out: Item[] = [];
  const skipped: Skipped[] = [];
  const total = items.filter((i) => isGoogleLink(i.url)).length;
  let done = 0;
  for (const item of items) {
    if (!isGoogleLink(item.url)) {
      out.push(item);
      continue;
    }
    const r = await deps.resolve(item.url);
    done++;
    if (done % 10 === 0) deps.log?.(`  ${feed.name}: decoded ${done}/${total} Google News links`);
    if ('error' in r) {
      skipped.push({ reason: 'undecodable_link', title: item.title, url: item.url, feed: feed.name, published_at: item.published_at });
      continue;
    }
    const url = cleanUrl(r.url);
    out.push({ ...item, url, id: makeId(url) });
  }
  return { items: out, skipped };
}

export async function collectRss(feed: FeedConfig, deps: Deps): Promise<CollectResult> {
  const addresses: { url: string; paging: boolean }[] = [];
  if (feed.url) addresses.push({ url: feed.url, paging: feed.paging === 'paged' });
  if (feed.google_news_url) addresses.push({ url: feed.google_news_url, paging: false });

  let items: Item[] = [];
  const skipped: Skipped[] = [];
  let tooOld = 0;
  let fallbackUsed = false;
  const notes: string[] = [];
  let okCount = 0;

  for (const addr of addresses) {
    try {
      const r = await readAddress(feed, addr.url, deps, addr.paging);
      okCount++;
      fallbackUsed ||= r.fallbackUsed;
      if (r.note) notes.push(r.note);
      const parsed = entriesToItems(r.entries, feed, deps.now);
      tooOld += parsed.tooOld;
      if (parsed.emptyTitles) notes.push(`${parsed.emptyTitles} Google News entries without a title ignored (site files, not articles)`);
      skipped.push(...parsed.skipped);
      const decoded = await decodeGoogleItems(parsed.items, feed, deps);
      skipped.push(...decoded.skipped);
      items = items.concat(decoded.items);
    } catch (e) {
      notes.push(`${new URL(addr.url).hostname}: ${(e as Error).message}`);
    }
  }
  if (okCount === 0) return { items: [], skipped, tooOld, fallbackUsed, status: 'ERROR', note: notes.join('; ') };

  // Keyword prefilter (only for feeds flagged prefilter).
  if (feed.prefilter && deps.matcher) {
    const kept: Item[] = [];
    for (const item of items) {
      if (deps.matcher(`${item.title} ${item.snippet}`)) kept.push(item);
      else skipped.push({ reason: 'not_ai', title: item.title, url: item.url, feed: feed.name, published_at: item.published_at });
    }
    items = kept;
  }
  return { items, skipped, tooOld, fallbackUsed, status: 'OK', note: notes.length ? notes.join('; ') : undefined };
}
