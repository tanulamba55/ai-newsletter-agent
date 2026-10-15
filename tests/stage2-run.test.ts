// Stage 2 whole-run tests: all three parts together (search, YC, government), merged into one result.
// No network: every address is answered from saved files in tests/fixtures/ or a small made-up page.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectGovernment, euFeedUrl, federalRegisterUrl } from '../src/lib/government.ts';
import { makeMatcher } from '../src/lib/prefilter.ts';
import { ItemSchema, KeywordsSchema, SearchConfigSchema, SkippedSchema, YcConfigSchema } from '../src/lib/schemas.ts';
import type { SearchConfig } from '../src/lib/schemas.ts';
import { runSearches } from '../src/lib/search.ts';
import { bothSearchProvidersFailed, combine, formatReport } from '../src/lib/stage2.ts';
import { collectYc } from '../src/lib/yc.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const config = (name: string) => JSON.parse(readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-10-15T09:00:00Z');
const matcher = makeMatcher(KeywordsSchema.parse(config('keywords.json')));
const ycConfig = YcConfigSchema.parse(config('yc.json'));
const searches: SearchConfig[] = (config('searches.json') as unknown[]).map((c) => SearchConfigSchema.parse(c));

// Answers every address from saved files. Bing: the same saved page for every query.
// Anything not listed fails, like a provider that is down.
function world(down: string[] = []) {
  const calls: string[] = [];
  const dirPage = JSON.stringify({ totalPages: 1, companies: [{ name: 'Gradon', batch: 'F26', website: 'https://heygradon.com', tags: ['AI'] }] });
  const getText = async (url: string): Promise<string> => {
    calls.push(url);
    if (down.some((d) => url.includes(d))) throw new Error('HTTP 503');
    if (url.startsWith('https://www.bing.com/news/search')) return fixture('bing_deepseek.xml');
    if (url === 'https://www.ycombinator.com/launches.json') return fixture('yc_launches_p1.json');
    if (url.startsWith('https://api.ycombinator.com/v0.1/companies')) return dirPage;
    if (url === federalRegisterUrl(NOW)) return fixture('fedreg_ai.json');
    if (url === euFeedUrl) return fixture('eu_digital.xml');
    throw new Error('HTTP 500');
  };
  return { getText, calls };
}

async function runAll(w: ReturnType<typeof world>) {
  const resolve = async () => ({ error: 'not used' });
  const search = await runSearches(searches, { getText: w.getText, resolve, now: NOW, aggregators: config('aggregators.json').hosts, matcher, pauseMs: 0 });
  const yc = await collectYc({ getText: w.getText, now: NOW, config: ycConfig, matcher, pauseMs: 0 });
  const gov = await collectGovernment({ getText: w.getText, now: NOW, matcher });
  const parts = { search, yc, gov };
  return { parts, combined: combine(parts, NOW) };
}

test('whole run: items are valid, URLs are unique, every lane contributed, all 7 providers are reported', async () => {
  const { combined } = await runAll(world());
  for (const item of combined.items) ItemSchema.parse(item); // same shape as Stage 1
  for (const s of combined.skipped) SkippedSchema.parse(s);
  const urls = combined.items.map((i) => i.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(combined.items.some((i) => i.lane === 'china'));
  assert.ok(combined.items.some((i) => i.yc_match)); // YC launches
  assert.ok(combined.items.some((i) => i.outlet === 'European Commission'));
  assert.ok(combined.items.every((i) => !/msn\.com|yahoo\.com/.test(i.url))); // aggregators dropped
  assert.deepEqual(combined.health.providers.map((p) => p.name), ['Bing News', 'Google News', 'YC launches', 'Hacker News', 'YC directory', 'Federal Register', 'EU Commission feed']);
  assert.equal(combined.health.providers_error, 0);
  assert.equal(combined.health.total_items, combined.items.length);
  assert.equal(combined.health.stage, 2);
});

test('whole run: newest item first, and every item is inside the 7-day window', async () => {
  const { combined } = await runAll(world());
  const dates = combined.items.map((i) => i.published_at);
  assert.deepEqual(dates, [...dates].sort().reverse());
  const oldest = NOW.getTime() - 7 * 24 * 3600 * 1000;
  assert.ok(dates.every((d) => new Date(d).getTime() >= oldest));
});

test('replay gives the same result: running twice from the same downloads gives identical items', async () => {
  const first = await runAll(world());
  const second = await runAll(world());
  assert.deepEqual(first.combined.items, second.combined.items);
  assert.deepEqual(first.combined.health.providers, second.combined.health.providers);
});

test('one provider down (Federal Register): ERROR is reported, everything else still arrives', async () => {
  const { combined } = await runAll(world(['federalregister.gov']));
  const fr = combined.health.providers.find((p) => p.name === 'Federal Register');
  assert.equal(fr?.status, 'ERROR');
  assert.equal(combined.health.providers_error, 1);
  assert.ok(combined.items.length > 10);
});

test('Bing and Google both down: both ERROR and the loud warning is printed; the YC and government lanes still work', async () => {
  const { parts, combined } = await runAll(world(['bing.com', 'news.google.com']));
  assert.equal(bothSearchProvidersFailed(combined.health), true);
  assert.ok(combined.items.some((i) => i.yc_match));
  const text = formatReport(parts, combined, { now: NOW, offline: false }).join('\n');
  assert.match(text, /WARNING: Bing and Google News BOTH failed/);
});

test('Bing down only: Google backup is asked for every query and counted as a fallback', async () => {
  const { combined } = await runAll(world(['bing.com']));
  assert.equal(combined.health.fallbacks_fired, searches.length); // Google was asked for every query (and failed here: not served)
  assert.equal(bothSearchProvidersFailed(combined.health), true); // Google is not served in this fake world either
});

test('YC lane: a YC launch and the same page found by search is one item, and the YC copy (with yc_match) wins', () => {
  const launch = { id: 'a', title: 'Gradon launch', url: 'https://www.ycombinator.com/launches/x', outlet: 'YC Launches', outlet_type: 'official' as const, published_at: '2026-10-14T10:00:00.000Z', snippet: 'pitch', lane: 'yc', yc_match: { company: 'Gradon', batch: 'Fall 2026' } };
  const found = { ...launch, outlet: 'Bing', outlet_type: 'media' as const, snippet: '', lane: 'topic', yc_match: undefined };
  const parts = {
    search: { items: [found], skipped: [], tooOld: 0, duplicates: 0, undecodable: 0, fallbacksFired: 0, providers: [], perQuery: [] },
    yc: { items: [launch], skipped: [], tooOld: 0, providers: [] },
    gov: { items: [], skipped: [], tooOld: 0, providers: [] },
  };
  const c = combine(parts, NOW);
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].yc_match?.company, 'Gradon');
  assert.equal(c.duplicates, 1);
});

test('report: one row per lane and per provider, with totals', async () => {
  const { parts, combined } = await runAll(world());
  const text = formatReport(parts, combined, { now: NOW, offline: true }).join('\n');
  for (const word of ['offline replay', 'china', 'official', 'topic', 'outlet', 'yc (launches / Launch HN)', 'government', 'Bing News', 'YC directory', 'Items written:']) assert.ok(text.includes(word), word);
  assert.ok(!text.includes('WARNING'));
});
