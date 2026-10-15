// Stage 2 automated tests. No network: they use real saved files in tests/fixtures/ and small made-up feeds.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeMatcher } from '../src/lib/prefilter.ts';
import { bingRealUrl, bingUrl, googleUrl, isAggregator, readBing, runQuery, runSearches } from '../src/lib/search.ts';
import type { SearchDeps } from '../src/lib/search.ts';
import { Health2Schema, ItemSchema, KeywordsSchema, SearchConfigSchema } from '../src/lib/schemas.ts';
import type { SearchConfig } from '../src/lib/schemas.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const config = (name: string) => JSON.parse(readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-10-14T13:30:00Z'); // the fixtures were saved at this time
const AGG: string[] = config('aggregators.json').hosts;
const keywords = KeywordsSchema.parse(config('keywords.json'));
const search = (over: Partial<SearchConfig> = {}): SearchConfig => SearchConfigSchema.parse({ lane: 'china', query: 'DeepSeek', ...over });

// A fake download function: serves text by address, fails for anything else.
function serve(files: Record<string, string>, calls: string[] = []): SearchDeps['getText'] {
  return async (url) => {
    calls.push(url);
    if (url in files) return files[url];
    throw new Error('HTTP 500');
  };
}
const deps = (getText: SearchDeps['getText'], over: Partial<SearchDeps> = {}): SearchDeps => ({
  getText,
  resolve: async (link) => ({ url: `https://decoded.example.com/${encodeURIComponent(link.slice(-12))}` }),
  now: NOW,
  aggregators: AGG,
  pauseMs: 0,
  ...over,
});

// A small made-up Bing feed. Each entry: [title, real article url, date, source name].
function bingXml(entries: [string, string, string, string][]): string {
  const items = entries
    .map(([title, url, date, source]) => `<item><title>${title}</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;url=${encodeURIComponent(url)}&amp;c=1</link><description>About ${title}</description><pubDate>${date}</pubDate><News:Source>${source}</News:Source></item>`)
    .join('');
  return `<?xml version="1.0"?><rss version="2.0" xmlns:News="https://www.bing.com/news"><channel><title>t</title>${items}</channel></rss>`;
}
const recent = 'Tue, 13 Oct 2026 12:00:00 GMT';

// ---------- Bing results ----------
test('Bing link: the real article URL is taken from url=', () => {
  assert.equal(bingRealUrl('http://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&url=https%3a%2f%2fwww.techrepublic.com%2farticle%2fx&c=1'), 'https://www.techrepublic.com/article/x');
  assert.equal(bingRealUrl('http://www.bing.com/news/apiclick.aspx?c=1'), null);
});

test('Bing fixture: items carry real URL, Bing source name, snippet, date, lane, hint and region', async () => {
  const r = await readBing(fixture('bing_deepseek.xml'), search({ category_hint: '7' }), deps(serve({})));
  const tr = r.items.find((i) => i.outlet === 'TechRepublic');
  assert.ok(tr);
  assert.equal(tr.url, 'https://www.techrepublic.com/article/news-deepseek-winverse-robotics-ai-funding-china-apac');
  assert.match(tr.snippet, /DeepSeek reportedly plans/);
  assert.equal(tr.published_at, '2026-10-13T07:22:00.000Z');
  assert.equal(tr.lane, 'china');
  assert.equal(tr.category_hint, '7');
  assert.equal(tr.region, 'china');
  for (const i of r.items) ItemSchema.parse(i); // same shape as Stage 1
});

test('aggregators (msn.com, yahoo.com) are dropped and logged', async () => {
  const r = await readBing(fixture('bing_deepseek.xml'), search(), deps(serve({})));
  assert.equal(r.skipped.filter((s) => s.reason === 'aggregator').length, 3); // 2 MSN + 1 Yahoo in the saved file
  assert.ok(r.items.every((i) => !isAggregator(i.url, AGG)));
  assert.equal(isAggregator('https://www.msn.com/en-us/x', AGG), true);
  assert.equal(isAggregator('https://notmsn.com/x', AGG), false); // only real sub-domains match
  assert.equal(isAggregator('https://note.com/the_record/n/n1', AGG), true); // reposting platform, 18 of 237 items on 15 Oct
});

test('window: old items are counted, undated items are logged', async () => {
  const xml = bingXml([
    ['Fresh', 'https://a.example.com/fresh', recent, 'A'],
    ['Old', 'https://a.example.com/old', 'Sun, 20 Sep 2026 12:00:00 GMT', 'A'],
    ['NoDate', 'https://a.example.com/nodate', '', 'A'],
  ]);
  const r = await readBing(xml, search(), deps(serve({})));
  assert.deepEqual(r.items.map((i) => i.title), ['Fresh']);
  assert.equal(r.tooOld, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['undated']);
});

// ---------- Google backup ----------
const three = bingXml([
  ['One', 'https://a.example.com/1', recent, 'A'],
  ['Two', 'https://a.example.com/2', recent, 'A'],
  ['Three', 'https://a.example.com/3', recent, 'A'],
]);

test('Google backup does NOT run when Bing gives 3 or more results', async () => {
  const calls: string[] = [];
  const q = await runQuery(search(), deps(serve({ [bingUrl('DeepSeek')]: three }, calls)));
  assert.equal(q.items.length, 3);
  assert.equal(q.google, undefined);
  assert.deepEqual(calls, [bingUrl('DeepSeek')]);
});

test('Google backup runs when Bing is thin; its items get the source name and no snippet', async () => {
  const thin = bingXml([['One', 'https://a.example.com/1', recent, 'A']]);
  const q = await runQuery(search({ query: 'EU AI Act', lane: 'topic' }), deps(serve({ [bingUrl('EU AI Act')]: thin, [googleUrl('EU AI Act')]: fixture('gn_search_euaiact.xml') })));
  assert.equal(q.google?.ok, true);
  assert.ok(q.google!.items > 3);
  const fromGoogle = q.items.find((i) => i.url.startsWith('https://decoded.example.com/'));
  assert.ok(fromGoogle);
  assert.equal(fromGoogle.snippet, '');
  assert.ok(fromGoogle.outlet.length > 0 && fromGoogle.outlet !== 'Google News');
  assert.ok(!fromGoogle.title.endsWith(` - ${fromGoogle.outlet}`)); // " - Outlet" suffix removed
});

test('Google backup runs when Bing errors; undecodable links are logged and counted', async () => {
  const q = await runQuery(search({ query: 'EU AI Act', lane: 'topic' }), deps(serve({ [googleUrl('EU AI Act')]: fixture('gn_search_euaiact.xml') }), { resolve: async () => ({ error: 'nope' }) }));
  assert.equal(q.bing.ok, false);
  assert.equal(q.google?.ok, true);
  assert.equal(q.items.length, 0);
  assert.ok(q.undecodable > 0);
  assert.ok(q.skipped.every((s) => s.reason === 'undecodable_link'));
});

// ---------- one bad provider or query never stops the run ----------
test('both providers fail for one query: that query is empty, the others still run', async () => {
  const files = { [bingUrl('DeepSeek')]: three }; // "Broken query" has no file, so Bing and Google both fail
  const run = await runSearches([search({ query: 'Broken query' }), search()], deps(serve(files)));
  assert.equal(run.items.length, 3);
  const [bing, google] = run.providers;
  assert.equal(bing.name, 'Bing News');
  assert.equal(bing.status, 'OK'); // 1 of 2 queries failed, not all
  assert.match(bing.note ?? '', /1 of 2 queries failed/);
  assert.equal(google.queries, 1); // only the broken query needed the backup
  assert.equal(google.status, 'ERROR');
  assert.equal(run.fallbacksFired, 1);
});

test('health: Bing and Google both ERROR when every query fails everywhere', async () => {
  const run = await runSearches([search(), search({ query: 'Qwen' })], deps(serve({})));
  assert.deepEqual(run.providers.map((p) => p.status), ['ERROR', 'ERROR']);
  Health2Schema.parse({ stage: 2, run_at: NOW.toISOString(), total_items: 0, providers: run.providers, providers_error: 2, fallbacks_fired: run.fallbacksFired, undecodable_links: 0 });
});

test('health: Google shows "not needed" when Bing always worked', async () => {
  const run = await runSearches([search()], deps(serve({ [bingUrl('DeepSeek')]: three })));
  assert.equal(run.providers[1].status, 'OK');
  assert.equal(run.providers[1].queries, 0);
  assert.equal(run.providers[1].note, 'not needed');
});

// ---------- prefilter, caps, duplicates ----------
test('outlet lane with prefilter: non-AI results are dropped and logged not_ai', async () => {
  const xml = bingXml([
    ['Huawei unveils new AI chip for large models', 'https://www.scmp.com/tech/1', recent, 'SCMP'],
    ['Hong Kong property prices fall again', 'https://www.scmp.com/news/2', recent, 'SCMP'],
    ['Taiwan holds military drills', 'https://www.scmp.com/news/3', recent, 'SCMP'],
  ]);
  const cfg = search({ lane: 'outlet', query: 'site:scmp.com', prefilter: true });
  const q = await runQuery(cfg, deps(serve({ [bingUrl('site:scmp.com')]: xml }), { matcher: makeMatcher(keywords) }));
  assert.deepEqual(q.items.map((i) => i.url), ['https://www.scmp.com/tech/1']);
  assert.equal(q.skipped.filter((s) => s.reason === 'not_ai').length, 2);
});

test('max_results caps the items for one query', async () => {
  const q = await runQuery(search({ max_results: 2 }), deps(serve({ [bingUrl('DeepSeek')]: three })));
  assert.equal(q.items.length, 2);
});

test('same URL from two queries is one item (counted as a duplicate)', async () => {
  const run = await runSearches([search(), search({ query: 'Qwen' })], deps(serve({ [bingUrl('DeepSeek')]: three, [bingUrl('Qwen')]: three })));
  assert.equal(run.items.length, 3);
  assert.equal(run.duplicates, 3);
});

// ---------- config ----------
test('config/searches.json: every entry is valid, hints are category numbers 1-8', () => {
  const list = (config('searches.json') as unknown[]).map((c) => SearchConfigSchema.parse(c));
  assert.ok(list.length >= 20);
  for (const c of list) if (c.category_hint) assert.match(c.category_hint, /^[1-8]$/);
  assert.ok(list.filter((c) => c.lane === 'outlet' && c.query.startsWith('site:')).length >= 2);
});
