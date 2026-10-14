// Stage 1 automated tests. No network: they use real saved files in tests/fixtures/.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWindow, parseDate } from '../src/lib/dates.ts';
import { cleanUrl, makeId } from '../src/lib/urls.ts';
import { entriesToItems, collectRss, parseEntries, stripHtml } from '../src/lib/rss.ts';
import type { Deps } from '../src/lib/rss.ts';
import { collectHf, modelsToItems } from '../src/lib/huggingface.ts';
import { makeMatcher } from '../src/lib/prefilter.ts';
import { looksLikeAsset, makeResolver, readUrlFromReply } from '../src/lib/resolveUrl.ts';
import { FeedConfigSchema, KeywordsSchema } from '../src/lib/schemas.ts';
import type { FeedConfig } from '../src/lib/schemas.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const NOW = new Date('2026-10-14T07:30:00Z'); // the fixtures were saved on this morning
const feed = (over: Partial<FeedConfig> = {}): FeedConfig => FeedConfigSchema.parse({ name: 'Test feed', type: 'media', ...over });
const keywords = KeywordsSchema.parse(JSON.parse(readFileSync(new URL('../config/keywords.json', import.meta.url), 'utf8')));

// A fake download function: serves text by address, fails for anything else.
function serve(files: Record<string, string>, calls: string[] = []): Deps['getText'] {
  return async (url) => {
    calls.push(url);
    if (url in files) return files[url];
    throw new Error('HTTP 500');
  };
}
const noDecode: Deps['resolve'] = async () => ({ error: 'not used' });
const deps = (getText: Deps['getText'], over: Partial<Deps> = {}): Deps => ({ getText, resolve: noDecode, now: NOW, pauseMs: 0, ...over });

// ---------- dates ----------
test('date window: inside, too old, far future', () => {
  assert.equal(checkWindow(new Date('2026-10-10T00:00:00Z'), NOW), 'ok');
  assert.equal(checkWindow(new Date('2026-10-06T00:00:00Z'), NOW), 'too_old'); // 8 days
  assert.equal(checkWindow(new Date('2026-10-20T00:00:00Z'), NOW), 'future');
});

test('dates: RFC 822 and ISO are read, junk gives null', () => {
  assert.equal(parseDate('Wed, 14 Oct 2026 06:04:15 +0000')?.toISOString(), '2026-10-14T06:04:15.000Z');
  assert.equal(parseDate('2026-10-09T04:50:01.000Z')?.toISOString(), '2026-10-09T04:50:01.000Z');
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(undefined), null);
});

// ---------- URL cleaning ----------
test('URL cleaning: tracking, fragment, host case, trailing slash', () => {
  assert.equal(cleanUrl('https://Example.com/a/?utm_source=x&id=2#top'), 'https://example.com/a?id=2');
  assert.equal(cleanUrl('https://example.com/a/?fbclid=1&gclid=2&ref=3'), 'https://example.com/a');
  assert.equal(cleanUrl('https://example.com/'), 'https://example.com/'); // root keeps its slash
});

test('item id: 12 hex characters, same URL gives same id', () => {
  const id = makeId('https://example.com/a');
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.equal(id, makeId('https://example.com/a'));
});

test('snippet cleaning: tags, entities, WordPress tail, length cap', () => {
  assert.equal(stripHtml('<p>Hello &amp; <b>welcome</b></p> The post Big news appeared first on Site.'), 'Hello & welcome');
  assert.ok(stripHtml('x'.repeat(1000)).length <= 400);
});

// ---------- reading RSS and Atom ----------
test('RSS fixture (MarkTechPost): items read with outlet, date, clean snippet', async () => {
  const entries = await parseEntries(fixture('marktechpost.xml'));
  const r = entriesToItems(entries, feed({ name: 'MarkTechPost' }), NOW);
  assert.equal(r.items.length, 5);
  assert.equal(r.items[0].outlet, 'MarkTechPost');
  assert.equal(r.items[0].outlet_type, 'media');
  assert.ok(r.items[0].published_at.endsWith('Z'));
  assert.ok(!r.items[0].snippet.includes('appeared first on'));
});

test('Atom fixture (GitHub commits): entries are read', async () => {
  const r = entriesToItems(await parseEntries(fixture('github_atom.xml')), feed({ name: 'Atom test' }), NOW);
  assert.equal(r.items.length, 3);
  assert.ok(r.items.every((i) => i.url.startsWith('https://github.com/')));
});

test('item older than 7 days is counted as too_old, not logged', async () => {
  const later = new Date('2026-10-30T00:00:00Z');
  const r = entriesToItems(await parseEntries(fixture('marktechpost.xml')), feed(), later);
  assert.equal(r.items.length, 0);
  assert.equal(r.tooOld, 5);
  assert.equal(r.skipped.length, 0);
});

test('item without a date is dropped and logged as undated', async () => {
  const xml = `<rss version="2.0"><channel><title>t</title>
    <item><title>No date here</title><link>https://example.com/a</link></item>
    <item><title>Has date</title><link>https://example.com/b</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const r = entriesToItems(await parseEntries(xml), feed(), NOW);
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['undated']);
  assert.equal(r.skipped[0].title, 'No date here');
});

// ---------- one bad feed, fallback, paging ----------
test('bad feed: result is ERROR, nothing thrown', async () => {
  const r = await collectRss(feed({ url: 'https://broken.example.com/feed' }), deps(serve({})));
  assert.equal(r.status, 'ERROR');
  assert.equal(r.items.length, 0);
  assert.match(r.note ?? '', /HTTP 500/);
});

test('fallback_url is used when the main address fails', async () => {
  const f = feed({ url: 'https://main.example.com/feed', fallback_url: 'https://mirror.example.com/feed' });
  const r = await collectRss(f, deps(serve({ 'https://mirror.example.com/feed': fixture('marktechpost.xml') })));
  assert.equal(r.status, 'OK');
  assert.equal(r.fallbackUsed, true);
  assert.equal(r.items.length, 5);
});

test('fallback is not used (and not reported) when the main address works', async () => {
  const f = feed({ url: 'https://main.example.com/feed', fallback_url: 'https://mirror.example.com/feed' });
  const r = await collectRss(f, deps(serve({ 'https://main.example.com/feed': fixture('marktechpost.xml') })));
  assert.equal(r.fallbackUsed, false);
});

// a tiny feed page with one item at a given date
const page = (n: number, date: string) =>
  `<rss version="2.0"><channel><title>t</title><item><title>Story ${n}</title><link>https://example.com/s${n}</link><pubDate>${date}</pubDate></item></channel></rss>`;

test('paging: follows ?paged=N and stops at the first page with items older than 7 days', async () => {
  const calls: string[] = [];
  const files = {
    'https://paged.example.com/feed': page(1, 'Tue, 13 Oct 2026 10:00:00 GMT'),
    'https://paged.example.com/feed?paged=2': page(2, 'Sat, 10 Oct 2026 10:00:00 GMT'),
    'https://paged.example.com/feed?paged=3': page(3, 'Mon, 05 Oct 2026 10:00:00 GMT'), // too old: last page we need
    'https://paged.example.com/feed?paged=4': page(4, 'Mon, 28 Sep 2026 10:00:00 GMT'),
  };
  const r = await collectRss(feed({ url: 'https://paged.example.com/feed', paging: 'paged' }), deps(serve(files, calls)));
  assert.equal(calls.length, 3); // pages 1, 2, 3; page 4 never asked
  assert.deepEqual(r.items.map((i) => i.title).sort(), ['Story 1', 'Story 2']);
  assert.equal(r.tooOld, 1);
});

test('paging: a failing later page stops paging but keeps what we have', async () => {
  const files = { 'https://paged.example.com/feed': page(1, 'Tue, 13 Oct 2026 10:00:00 GMT') };
  const r = await collectRss(feed({ url: 'https://paged.example.com/feed', paging: 'paged' }), deps(serve(files)));
  assert.equal(r.status, 'OK');
  assert.equal(r.items.length, 1);
  assert.match(r.note ?? '', /paging stopped/);
});

// ---------- prefilter ----------
test('prefilter: whole word AI, case-insensitive phrases', () => {
  const m = makeMatcher(keywords);
  assert.ok(m('New AI model released'));
  assert.ok(m('Nvidia ships a faster GPU'));
  assert.ok(m('Agentic workflows for teams'));
  assert.ok(!m('He said the MAIN road is closed'));
  assert.ok(!m('Gears of War launches on GeForce NOW'));
});

test('prefilter on a real Nvidia feed: kept items match, the rest are logged not_ai', async () => {
  const f = feed({ name: 'Nvidia', type: 'official', url: 'https://n.example.com/feed', prefilter: true });
  const r = await collectRss(f, deps(serve({ 'https://n.example.com/feed': fixture('nvidia.xml') }), { matcher: makeMatcher(keywords) }));
  const m = makeMatcher(keywords);
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every((i) => m(`${i.title} ${i.snippet}`)));
  assert.ok(r.skipped.length > 0 && r.skipped.every((s) => s.reason === 'not_ai'));
});

test('prefilter is off for feeds without the flag', async () => {
  const f = feed({ url: 'https://n.example.com/feed', prefilter: false });
  const r = await collectRss(f, deps(serve({ 'https://n.example.com/feed': fixture('nvidia.xml') }), { matcher: makeMatcher(keywords) }));
  assert.equal(r.skipped.length, 0);
});

// ---------- Hugging Face ----------
test('Hugging Face JSON becomes Items (china region, pipeline + library as snippet)', () => {
  const f = feed({ name: 'HF', type: 'official', kind: 'hf-models', region: 'china', orgs: ['Qwen'] });
  const r = modelsToItems(fixture('hf_models_qwen.json'), 'Qwen', f, NOW);
  assert.ok(r.items.length >= 1);
  const first = r.items[0];
  assert.equal(first.title, 'Qwen/Qwen-Image-2.1-Turbo');
  assert.equal(first.url, 'https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo');
  assert.equal(first.outlet, 'Hugging Face (Qwen)');
  assert.equal(first.outlet_type, 'official');
  assert.equal(first.region, 'china');
  assert.equal(first.published_at, '2026-10-09T04:50:01.000Z');
  assert.equal(first.snippet, 'text-to-image, diffusers');
});

test('Hugging Face: one failing org does not hide the others; all failing is ERROR', async () => {
  const f = feed({ name: 'HF', type: 'official', kind: 'hf-models', orgs: ['Qwen', 'broken'] });
  const url = (org: string) => `https://huggingface.co/api/models?author=${org}&sort=createdAt&direction=-1&limit=50`;
  const some = await collectHf(f, deps(serve({ [url('Qwen')]: fixture('hf_models_qwen.json') })));
  assert.equal(some.status, 'OK');
  assert.ok(some.items.length >= 1);
  assert.match(some.note ?? '', /1 of 2 orgs failed/);
  const none = await collectHf(f, deps(serve({})));
  assert.equal(none.status, 'ERROR');
});

test('Hugging Face: unexpected API shape is an error for that org', async () => {
  const f = feed({ name: 'HF', type: 'official', kind: 'hf-models', orgs: ['Qwen'] });
  const url = 'https://huggingface.co/api/models?author=Qwen&sort=createdAt&direction=-1&limit=50';
  const r = await collectHf(f, deps(serve({ [url]: '{"error":"rate limited"}' })));
  assert.equal(r.status, 'ERROR');
});

// ---------- Google News links ----------
// Three saved examples: (1) old-style id with the URL inside base64, (2) new-style id answered by
// Google (saved response shapes), (3) an answer already in the cache file.
const tmp = () => mkdtempSync(join(tmpdir(), 'stage1-'));
const oldStyleId = Buffer.from('\x08\x13"\x6bhttps://example.com/old-style-story').toString('base64url');
const newStyleLink = 'https://news.google.com/rss/articles/CBMiNEWSTYLEID';
const googleReplies = (calls: string[]): typeof fetch => async (input, init) => {
  const url = String(input);
  calls.push(url);
  if (url.endsWith('batchexecute')) {
    // Same shape Google sends: JSON inside JSON, with = written as \u003d inside the URL
    const inner = JSON.stringify(['garturlres', 'https://venturebeat.com/ai/real-story?a=1&b=2', 1]).replace(/=/g, '\\u003d').replace(/&/g, '\\u0026');
    return new Response(")]}'\n\n" + JSON.stringify([['wrb.fr', 'Fbv4je', inner, null, null, null, 'generic']]) + '\n');
  }
  return new Response('<c-wiz><div data-n-a-sg="SIG123" data-n-a-ts="1760000000"></div></c-wiz>');
};

test('decoder: old-style link decodes without network', async () => {
  const calls: string[] = [];
  const r = makeResolver({ cacheFile: join(tmp(), 'c.json'), fetchFn: googleReplies(calls), pauseMs: 0 });
  assert.deepEqual(await r.resolve(`https://news.google.com/rss/articles/${oldStyleId}?oc=5`), { url: 'https://example.com/old-style-story' });
  assert.equal(calls.length, 0);
});

test('decoder: new-style link is answered by Google (signature, then batchexecute)', async () => {
  const calls: string[] = [];
  const r = makeResolver({ cacheFile: join(tmp(), 'c.json'), fetchFn: googleReplies(calls), pauseMs: 0 });
  assert.deepEqual(await r.resolve(newStyleLink), { url: 'https://venturebeat.com/ai/real-story?a=1&b=2' });
  assert.equal(calls.length, 2);
});

test('decoder: second ask for the same link comes from the cache file, even in a new run', async () => {
  const cacheFile = join(tmp(), 'c.json');
  const calls: string[] = [];
  await makeResolver({ cacheFile, fetchFn: googleReplies(calls), pauseMs: 0 }).resolve(newStyleLink);
  const before = calls.length;
  const again = await makeResolver({ cacheFile, fetchFn: googleReplies(calls), pauseMs: 0 }).resolve(newStyleLink);
  assert.deepEqual(again, { url: 'https://venturebeat.com/ai/real-story?a=1&b=2' });
  assert.equal(calls.length, before);
});

test('decoder: Google answering with no URL gives an error, not a crash', async () => {
  const broken: typeof fetch = async () => new Response('<html>nothing useful</html>');
  const r = makeResolver({ cacheFile: join(tmp(), 'c.json'), fetchFn: broken, pauseMs: 0 });
  assert.ok('error' in (await r.resolve(newStyleLink)));
});

test('Google News feed: titles lose the outlet suffix, links are decoded, failures logged undecodable_link', async () => {
  const f = feed({ name: 'VentureBeat', url: 'https://gn.example.com/feed', paging: 'google-news' });
  let n = 0;
  // first link decodes, the others fail
  const resolve: Deps['resolve'] = async () => (n++ === 0 ? { url: 'https://venturebeat.com/ai/story?utm_source=x' } : { error: 'boom' });
  const r = await collectRss(f, deps(serve({ 'https://gn.example.com/feed': fixture('gn_venturebeat.xml') }), { resolve }));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].url, 'https://venturebeat.com/ai/story'); // cleaned
  assert.equal(r.items[0].outlet, 'VentureBeat');
  assert.ok(!r.items[0].title.endsWith('VentureBeat'));
  assert.equal(r.items[0].snippet, '');
  assert.equal(r.skipped.length, 2);
  assert.ok(r.skipped.every((s) => s.reason === 'undecodable_link'));
});

test('own feed plus Google News query: one failing part is noted, feed stays OK', async () => {
  const f = feed({ name: 'SCMP', url: 'https://own.example.com/feed', google_news_url: 'https://gn.example.com/feed' });
  const r = await collectRss(f, deps(serve({ 'https://own.example.com/feed': fixture('marktechpost.xml') })));
  assert.equal(r.status, 'OK');
  assert.equal(r.items.length, 5);
  assert.match(r.note ?? '', /gn\.example\.com/);
});

test('decoder: reply parsing keeps = and & in the URL; site files are recognised', () => {
  const reply = ')]}\'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://x.com/a?id\\\\u003d5\\\\u0026p\\\\u003d2\\",1]",null]]\n';
  assert.equal(readUrlFromReply(reply), 'https://x.com/a?id=5&p=2');
  assert.equal(readUrlFromReply('garbage'), null);
  assert.ok(looksLikeAsset('https://venturebeat.com/_next/static/chunks/abc.js?dpl=1'));
  assert.ok(!looksLikeAsset('https://venturebeat.com/ai/some-story'));
});

test('Google News entries with an empty title (site files) are ignored and counted, never decoded', async () => {
  const xml = `<rss version="2.0"><channel><title>t</title>
    <item><title>Real story - VentureBeat</title><link>https://news.google.com/rss/articles/AAA</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate><source url="https://venturebeat.com">VentureBeat</source></item>
    <item><title> - VentureBeat</title><link>https://news.google.com/rss/articles/BBB</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate><source url="https://venturebeat.com">VentureBeat</source></item>
  </channel></rss>`;
  const asked: string[] = [];
  const resolve: Deps['resolve'] = async (link) => (asked.push(link), { url: 'https://venturebeat.com/ai/real' });
  const r = await collectRss(feed({ url: 'https://gn.example.com/feed' }), deps(serve({ 'https://gn.example.com/feed': xml }), { resolve }));
  assert.equal(r.items.length, 1);
  assert.equal(asked.length, 1);
  assert.match(r.note ?? '', /1 Google News entries without a title/);
});

test('Hugging Face: after 3 failures in a row the other orgs are not tried (API looks down)', async () => {
  const f = feed({ name: 'HF', type: 'official', kind: 'hf-models', orgs: ['a', 'b', 'c', 'd', 'e'] });
  const calls: string[] = [];
  const r = await collectHf(f, deps(serve({}, calls)));
  assert.equal(calls.length, 3);
  assert.equal(r.status, 'ERROR');
  assert.match(r.note ?? '', /5 of 5 orgs failed/);
});
