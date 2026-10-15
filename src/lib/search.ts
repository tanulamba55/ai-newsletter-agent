// The search tool for Stage 2. This is the only file that knows the search providers.
//   1. Bing News RSS (main): real article URL is inside the link, short description included.
//   2. Google News RSS (backup): runs for a query only when Bing fails or gives fewer than 3 usable results.
//      Its links need the decoder (lib/resolveUrl.ts), which costs about 1.5 s per link.
// One failing provider or query never stops the run. Rules: docs/specs/stage2-search.md.
import Parser from 'rss-parser';
import { checkWindow, parseDate } from './dates.ts';
import { stripHtml, stripOutletSuffix } from './rss.ts';
import type { GetText, ResolveFn } from './rss.ts';
import { cleanUrl, makeId } from './urls.ts';
import type { Item, ProviderHealth, SearchConfig, Skipped } from './schemas.ts';

const MIN_BING_RESULTS = 3; // fewer usable Bing results than this: ask Google too
const BING = 'Bing News';
const GOOGLE = 'Google News';

export type SearchDeps = {
  getText: GetText;
  resolve: ResolveFn;
  now: Date;
  aggregators: string[]; // hosts to drop, for example "msn.com" (config/aggregators.json)
  matcher?: (text: string) => boolean; // keyword prefilter, used when a search has prefilter: true
  pauseMs?: number; // pause between queries (polite to the providers)
  log?: (msg: string) => void;
};

// Addresses. Exported so tests can serve saved files by address.
export function bingUrl(query: string): string {
  // qft interval 7 = last 7 days. Without it Bing returns old items.
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&mkt=en-US&qft=interval%3d%227%22`;
}
export function googleUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query).replace(/%20/g, '+')}+when:7d&hl=en-US&gl=US&ceid=US:en`;
}

// --- Reading results ---------------------------------------------------------------------

type Entry = { title?: string; link?: string; pubDate?: string; isoDate?: string; contentSnippet?: string; content?: string; description?: string; source?: { _?: string } | string; 'News:Source'?: string };
const parser = new Parser({ customFields: { item: ['source', 'description', 'News:Source'] } });

async function parseEntries(xml: string): Promise<Entry[]> {
  return (await parser.parseString(xml)).items as Entry[];
}

// True if the URL's host is an aggregator host or a sub-domain of one (www.msn.com matches msn.com).
export function isAggregator(url: string, hosts: string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

// Bing links look like bing.com/news/apiclick.aspx?...&url=<real article url>&... : take the real one.
export function bingRealUrl(link: string): string | null {
  try {
    const real = new URL(link).searchParams.get('url');
    return real && /^https?:\/\//.test(real) ? real : null;
  } catch {
    return null;
  }
}

// What one provider gave for one query, after the date window and aggregator rules.
type ProviderResult = { items: Item[]; skipped: Skipped[]; tooOld: number; undecodable: number };

// Build an Item from a search result. Outlet = the provider's own source name (decided 14 Oct 2026).
function makeItem(cfg: SearchConfig, f: { title: string; url: string; outlet: string; date: Date; snippet: string }): Item {
  const item: Item = {
    id: makeId(f.url),
    title: f.title,
    url: f.url,
    outlet: f.outlet,
    outlet_type: 'media',
    published_at: f.date.toISOString(),
    snippet: f.snippet,
    lane: cfg.lane,
  };
  if (cfg.category_hint) item.category_hint = cfg.category_hint;
  if (cfg.lane === 'china') item.region = 'china';
  return item;
}

// Shared rules for both providers: undated, window, aggregator hosts.
function accept(cfg: SearchConfig, deps: SearchDeps, r: ProviderResult, f: { title: string; rawUrl: string; outlet: string; date: Date | null; snippet: string }): void {
  let url: string;
  try {
    url = cleanUrl(f.rawUrl);
  } catch {
    return; // not a valid URL: nothing to keep
  }
  if (!f.date) {
    r.skipped.push({ reason: 'undated', title: f.title, url, feed: cfg.query });
    return;
  }
  const age = checkWindow(f.date, deps.now);
  if (age === 'too_old') {
    r.tooOld++;
    return;
  }
  if (age === 'future') {
    r.skipped.push({ reason: 'undated', title: f.title, url, feed: cfg.query, published_at: f.date.toISOString() });
    return;
  }
  if (isAggregator(url, deps.aggregators)) {
    r.skipped.push({ reason: 'aggregator', title: f.title, url, feed: cfg.query, published_at: f.date.toISOString() });
    return;
  }
  r.items.push(makeItem(cfg, { title: f.title, url, outlet: f.outlet, date: f.date, snippet: f.snippet }));
}

export async function readBing(xml: string, cfg: SearchConfig, deps: SearchDeps): Promise<ProviderResult> {
  const r: ProviderResult = { items: [], skipped: [], tooOld: 0, undecodable: 0 };
  for (const e of await parseEntries(xml)) {
    const title = stripHtml(e.title, 500);
    const rawUrl = e.link ? bingRealUrl(e.link) : null;
    if (!title || !rawUrl) continue;
    const date = parseDate(e.pubDate) ?? parseDate(e.isoDate);
    accept(cfg, deps, r, { title, rawUrl, outlet: e['News:Source']?.trim() || new URL(rawUrl).hostname, date, snippet: stripHtml(e.description || e.contentSnippet) });
  }
  return r;
}

export async function readGoogle(xml: string, cfg: SearchConfig, deps: SearchDeps): Promise<ProviderResult> {
  const r: ProviderResult = { items: [], skipped: [], tooOld: 0, undecodable: 0 };
  for (const e of (await parseEntries(xml)).slice(0, cfg.max_results)) {
    const outlet = (typeof e.source === 'string' ? e.source : e.source?._)?.trim() || 'Google News';
    const title = stripOutletSuffix(stripHtml(e.title, 500), outlet);
    if (!title || !e.link) continue; // empty title = a site file, not an article (see LESSONS.md)
    const date = parseDate(e.isoDate) ?? parseDate(e.pubDate);
    if (!date || checkWindow(date, deps.now) !== 'ok') {
      accept(cfg, deps, r, { title, rawUrl: e.link, outlet, date, snippet: '' }); // records undated or counts too old
      continue;
    }
    const decoded = await deps.resolve(e.link);
    if ('error' in decoded) {
      r.undecodable++;
      r.skipped.push({ reason: 'undecodable_link', title, url: e.link, feed: cfg.query, published_at: date.toISOString() });
      continue;
    }
    accept(cfg, deps, r, { title, rawUrl: decoded.url, outlet, date, snippet: '' }); // Google items have no snippet
  }
  return r;
}

// --- One query -----------------------------------------------------------------------------

export type QueryResult = {
  items: Item[];
  skipped: Skipped[];
  tooOld: number;
  undecodable: number;
  bing: { ok: boolean; items: number; error?: string };
  google?: { ok: boolean; items: number; error?: string }; // present only when the backup ran
};

// Ask Bing; if it fails or is thin, ask Google. Then merge, apply the prefilter, cap the count.
export async function runQuery(cfg: SearchConfig, deps: SearchDeps): Promise<QueryResult> {
  const out: QueryResult = { items: [], skipped: [], tooOld: 0, undecodable: 0, bing: { ok: false, items: 0 } };
  const add = (r: ProviderResult) => {
    out.items.push(...r.items);
    out.skipped.push(...r.skipped);
    out.tooOld += r.tooOld;
    out.undecodable += r.undecodable;
  };

  try {
    const r = await readBing(await deps.getText(bingUrl(cfg.query)), cfg, deps);
    out.bing = { ok: true, items: r.items.length };
    add(r);
  } catch (e) {
    out.bing = { ok: false, items: 0, error: (e as Error).message };
  }

  if (!out.bing.ok || out.bing.items < MIN_BING_RESULTS) {
    try {
      const r = await readGoogle(await deps.getText(googleUrl(cfg.query)), cfg, deps);
      out.google = { ok: true, items: r.items.length };
      add(r);
    } catch (e) {
      out.google = { ok: false, items: 0, error: (e as Error).message };
    }
  }

  // Merge: the same URL from both providers is one item; keep the copy that has a snippet.
  const byUrl = new Map<string, Item>();
  for (const item of out.items) {
    const have = byUrl.get(item.url);
    if (!have || (!have.snippet && item.snippet)) byUrl.set(item.url, item);
  }
  let items = [...byUrl.values()];

  if (cfg.prefilter && deps.matcher) {
    const kept: Item[] = [];
    for (const item of items) {
      if (deps.matcher(`${item.title} ${item.snippet}`)) kept.push(item);
      else out.skipped.push({ reason: 'not_ai', title: item.title, url: item.url, feed: cfg.query, published_at: item.published_at });
    }
    items = kept;
  }
  out.items = items.slice(0, cfg.max_results);
  return out;
}

// --- All queries -----------------------------------------------------------------------------

export type SearchRun = {
  items: Item[]; // merged across queries, exact-URL duplicates removed
  skipped: Skipped[];
  tooOld: number;
  duplicates: number; // counted, not logged
  undecodable: number;
  fallbacksFired: number; // queries where Google ran
  providers: ProviderHealth[]; // Bing News, Google News
  perQuery: { query: string; lane: string; items: number; bing: string; google: string }[]; // for the console table
};

function providerRow(name: string, rows: { ok: boolean; items: number; error?: string }[]): ProviderHealth {
  const failed = rows.filter((r) => !r.ok);
  const status = rows.length > 0 && failed.length === rows.length ? 'ERROR' : 'OK';
  const note = rows.length === 0 ? 'not needed' : failed.length ? `${failed.length} of ${rows.length} queries failed (${failed[0].error})` : undefined;
  return { name, status, queries: rows.length, items: rows.reduce((n, r) => n + r.items, 0), ...(note ? { note } : {}) };
}

export async function runSearches(configs: SearchConfig[], deps: SearchDeps): Promise<SearchRun> {
  const byUrl = new Map<string, Item>();
  const run: SearchRun = { items: [], skipped: [], tooOld: 0, duplicates: 0, undecodable: 0, fallbacksFired: 0, providers: [], perQuery: [] };
  const bingRows: QueryResult['bing'][] = [];
  const googleRows: NonNullable<QueryResult['google']>[] = [];
  let first = true;

  for (const cfg of configs) {
    if (!first) await new Promise((r) => setTimeout(r, deps.pauseMs ?? 1000));
    first = false;
    const q = await runQuery(cfg, deps);
    deps.log?.(`  ${cfg.lane.padEnd(9)}${cfg.query}: ${q.items.length} items${q.google ? ' (Google backup ran)' : ''}`);
    bingRows.push(q.bing);
    if (q.google) {
      googleRows.push(q.google);
      run.fallbacksFired++;
    }
    run.skipped.push(...q.skipped);
    run.tooOld += q.tooOld;
    run.undecodable += q.undecodable;
    for (const item of q.items) {
      const have = byUrl.get(item.url);
      if (have) {
        run.duplicates++;
        if (!have.snippet && item.snippet) byUrl.set(item.url, item);
      } else byUrl.set(item.url, item);
    }
    run.perQuery.push({ query: cfg.query, lane: cfg.lane, items: q.items.length, bing: q.bing.ok ? 'OK' : 'ERROR', google: q.google ? (q.google.ok ? 'OK' : 'ERROR') : '-' });
  }

  run.items = [...byUrl.values()];
  run.providers = [providerRow(BING, bingRows), providerRow(GOOGLE, googleRows)];
  return run;
}
