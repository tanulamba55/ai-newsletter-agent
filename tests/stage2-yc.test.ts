// Stage 2 YC lane tests. No network: real saved YC and Hacker News files in tests/fixtures/ plus small made-up pages.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMatcher } from '../src/lib/prefilter.ts';
import { collectDirectory, collectLaunches, collectYc, launchHnToItems, launchHnUrl, launchesToItems, parseLaunchHnTitle } from '../src/lib/yc.ts';
import type { YcDeps } from '../src/lib/yc.ts';
import { CompaniesPageSchema, ItemSchema, KeywordsSchema, LaunchesPageSchema, YcConfigSchema } from '../src/lib/schemas.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const config = (name: string) => JSON.parse(readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8'));
const yc = YcConfigSchema.parse(config('yc.json'));
const NOW = new Date('2026-10-15T09:00:00Z'); // the fixtures were saved on this morning
const LAUNCHES = 'https://www.ycombinator.com/launches.json';
const COMPANIES = 'https://api.ycombinator.com/v0.1/companies';

function serve(files: Record<string, string>, calls: string[] = []): YcDeps['getText'] {
  return async (url) => {
    calls.push(url);
    if (url in files) return files[url];
    throw new Error('HTTP 500');
  };
}
const deps = (getText: YcDeps['getText'], over: Partial<YcDeps> = {}): YcDeps => ({ getText, now: NOW, config: yc, pauseMs: 0, ...over });

// A made-up directory page: companies listed by batch.
const dirPage = (batches: string[], totalPages = 5) => JSON.stringify({ totalPages, companies: batches.map((b, i) => ({ name: `Co-${b}-${i}`, batch: b, website: `https://${b}-${i}.example.com`, tags: ['AI'] })) });

// ---------- launches ----------
test('real launches page: only AI-tagged launches become items, the rest are logged not_ai', () => {
  const page = LaunchesPageSchema.parse(JSON.parse(fixture('yc_launches_p1.json')));
  const r = launchesToItems(page, yc, NOW);
  assert.ok(r.items.length > 0);
  assert.ok(r.skipped.some((s) => s.reason === 'not_ai'));
  assert.equal(r.items.length + r.skipped.length + r.tooOld, page.hits.length); // every launch is accounted for
  for (const item of r.items) {
    ItemSchema.parse(item); // same shape as Stage 1
    assert.match(item.url, /^https:\/\/www\.ycombinator\.com\/launches\//); // the YC launch page
    assert.equal(item.lane, 'yc');
    assert.equal(item.category_hint, '4');
    assert.equal(item.outlet_type, 'official');
    assert.ok(item.yc_match?.company);
  }
  const gradon = r.items.find((i) => i.yc_match?.company === 'Gradon'); // tagged "Artificial Intelligence" in the saved file
  assert.ok(gradon);
  assert.match(gradon.snippet, /Company site: https:\/\/heygradon\.com/);
  assert.equal(r.skipped.find((s) => s.reason === 'not_ai' && /Saccade/.test(s.title)), undefined); // "Machine Learning" counts as AI
});

test('launch tags: AI, Artificial Intelligence, Machine Learning count; Fintech alone does not', () => {
  const page = LaunchesPageSchema.parse({ page: 0, nbPages: 1, hits: ['AI', 'artificial intelligence', 'Machine Learning', 'Fintech'].map((tag, i) => ({ title: `L${i}`, slug: `l${i}`, created_at: '2026-10-14T10:00:00Z', company: { name: `C${i}`, tags: [tag] } })) });
  const r = launchesToItems(page, yc, NOW);
  assert.deepEqual(r.items.map((i) => i.title), ['L0', 'L1', 'L2']);
  assert.equal(r.items[0].url, 'https://www.ycombinator.com/launches/l0'); // built from the slug when search_path is missing
});

test('launch without an AI tag is kept when its title or tagline matches the AI keywords', () => {
  const matcher = makeMatcher(KeywordsSchema.parse(config('keywords.json')));
  const hit = (title: string, tagline: string, tags: string[]) => ({ title, tagline, slug: title.toLowerCase().replace(/\W+/g, '-'), created_at: '2026-10-14T10:00:00Z', company: { name: title, tags } });
  const page = LaunchesPageSchema.parse({
    page: 0,
    nbPages: 1,
    hits: [hit('Expand Fetch', 'Reading glasses for your AI agent', ['Developer Tools']), hit('Inflection Space', 'Hyperscaling spacecraft manufacturing', ['Hard Tech']), hit('Tagged', 'Plain pitch', ['AI'])],
  });
  const withMatcher = launchesToItems(page, yc, NOW, matcher);
  assert.deepEqual(withMatcher.items.map((i) => i.title), ['Expand Fetch', 'Tagged']);
  assert.deepEqual(withMatcher.skipped.map((s) => s.title), ['Inflection Space']);
  assert.deepEqual(launchesToItems(page, yc, NOW).items.map((i) => i.title), ['Tagged']); // without a matcher: tags only
});

test('launch paging: stops after page 0 when it already reaches items older than 7 days', async () => {
  const calls: string[] = [];
  const r = await collectLaunches(deps(serve({ [LAUNCHES]: fixture('yc_launches_p1.json'), [`${LAUNCHES}?page=1`]: fixture('yc_launches_p2.json') }, calls)));
  assert.deepEqual(calls, [LAUNCHES]);
  assert.equal(r.pages, 1);
});

test('launch paging: goes to the next page while the whole page is inside the window', async () => {
  const calls: string[] = [];
  const earlier = new Date('2026-10-14T12:00:00Z'); // the 7 days now reach back to 7 Oct 12:00, so page 0 is all inside
  const r = await collectLaunches(deps(serve({ [LAUNCHES]: fixture('yc_launches_p1.json'), [`${LAUNCHES}?page=1`]: fixture('yc_launches_p2.json') }, calls), { now: earlier }));
  assert.deepEqual(calls, [LAUNCHES, `${LAUNCHES}?page=1`]); // page 1 reaches older items, so paging stops there
  assert.equal(r.pages, 2);
});

test('launches list changes shape: ERROR with a clear note, Launch HN backup runs instead', async () => {
  const calls: string[] = [];
  const files = { [LAUNCHES]: '{"results": []}', [launchHnUrl(NOW)]: fixture('hn_launch.json') };
  const r = await collectYc(deps(serve(files, calls), { matcher: makeMatcher(KeywordsSchema.parse(config('keywords.json'))) }));
  const [launches, hn] = r.providers;
  assert.equal(launches.status, 'ERROR');
  assert.match(launches.note ?? '', /unexpected shape/);
  assert.equal(hn.name, 'Hacker News');
  assert.equal(hn.status, 'OK');
  assert.ok(calls.includes(launchHnUrl(NOW)));
});

test('Hacker News backup is not asked when the launches list works', async () => {
  const calls: string[] = [];
  const r = await collectYc(deps(serve({ [LAUNCHES]: fixture('yc_launches_p1.json') }, calls)));
  assert.ok(!calls.some((c) => c.includes('algolia')));
  assert.equal(r.providers[1].note, 'not needed');
});

// ---------- Launch HN backup ----------
test('Launch HN title: company and batch are read; Show HN and other posts give null', () => {
  assert.deepEqual(parseLaunchHnTitle('Launch HN: Consus (YC F24) – LLM gateway for companies'), { company: 'Consus', batch: 'F24' });
  assert.equal(parseLaunchHnTitle('Show HN: What are vector embeddings?'), null);
  assert.equal(parseLaunchHnTitle('Launch HN: No batch here'), null);
});

test('Hacker News address: the date filter is URL-encoded (a bare ">" gives HTTP 400)', () => {
  const url = launchHnUrl(NOW);
  assert.match(url, /numericFilters=created_at_i%3E\d+/);
  assert.ok(!url.includes('>'));
});

test('real Hacker News file: only Launch HN posts inside the window become items', () => {
  const r = launchHnToItems(JSON.parse(fixture('hn_launch.json')), { now: NOW });
  for (const item of r.items) {
    ItemSchema.parse(item);
    assert.match(item.title, /^Launch HN: /);
    assert.ok(item.yc_match?.batch);
    assert.equal(item.category_hint, '4');
  }
  assert.ok(!r.items.some((i) => /^Show HN/.test(i.title)));
});

// ---------- directory ----------
test('real directory page has the shape we expect', () => {
  const page = CompaniesPageSchema.parse(JSON.parse(fixture('yc_companies_p1.json')));
  assert.equal(page.companies.length, 25);
  assert.ok(page.totalPages > 100);
  assert.match(page.companies[0].batch, /^[A-Z]\d{2}$/);
});

test('directory: stops after more than recent_batches different batches; only recent batches are kept', async () => {
  const calls: string[] = [];
  const files = { [`${COMPANIES}?page=1`]: dirPage(['W27', 'F26', 'F26']), [`${COMPANIES}?page=2`]: dirPage(['F26', 'S26', 'W26']), [`${COMPANIES}?page=3`]: dirPage(['W26']) };
  const r = await collectDirectory(deps(serve(files, calls), { config: { ...yc, recent_batches: 3 } }));
  assert.deepEqual(r.batches, ['W27', 'F26', 'S26', 'W26']); // the 4th batch is where it stopped
  assert.deepEqual([...new Set(r.companies.map((c) => c.batch))], ['W27', 'F26', 'S26']);
  assert.equal(r.companies.length, 5);
  assert.equal(calls.length, 2); // page 3 never requested
});

test('directory: company list is saved for the Stage 3 tagger; a failing run keeps the old file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yc-'));
  const cache = join(dir, 'yc-companies.json');
  const ok = { [LAUNCHES]: fixture('yc_launches_p1.json'), [`${COMPANIES}?page=1`]: dirPage(['W27', 'F26', 'S26', 'W26']) };
  const good = await collectYc(deps(serve(ok), { config: { ...yc, recent_batches: 2 } }), cache);
  assert.equal(good.providers[2].status, 'OK');
  const saved = JSON.parse(readFileSync(cache, 'utf8'));
  assert.deepEqual(saved.map((c: { batch: string }) => c.batch), ['W27', 'F26']);
  assert.equal(saved[0].website, 'https://W27-0.example.com');

  writeFileSync(cache, '["old copy"]');
  const bad = await collectYc(deps(serve({ [LAUNCHES]: fixture('yc_launches_p1.json') })), cache); // directory page 1 fails
  assert.equal(bad.providers[2].status, 'ERROR');
  assert.equal(readFileSync(cache, 'utf8'), '["old copy"]'); // not overwritten
  assert.ok(existsSync(cache));
});

test('directory: a page with the wrong shape is an ERROR, not a crash', async () => {
  const r = await collectYc(deps(serve({ [LAUNCHES]: fixture('yc_launches_p1.json'), [`${COMPANIES}?page=1`]: '{"companies": "oops"}' })));
  assert.equal(r.providers[2].status, 'ERROR');
  assert.match(r.providers[2].note ?? '', /unexpected shape/);
  assert.equal(r.providers[0].status, 'OK'); // the launches part still worked
});
