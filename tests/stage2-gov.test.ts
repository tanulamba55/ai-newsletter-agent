// Stage 2 government sources tests (Federal Register, EU Commission feed). No network: real saved files in tests/fixtures/.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectGovernment, euFeedToItems, euFeedUrl, euSnippet, federalRegisterToItems, federalRegisterUrl } from '../src/lib/government.ts';
import type { GovDeps } from '../src/lib/government.ts';
import { makeMatcher } from '../src/lib/prefilter.ts';
import { ItemSchema, KeywordsSchema } from '../src/lib/schemas.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const keywords = KeywordsSchema.parse(JSON.parse(readFileSync(new URL('../config/keywords.json', import.meta.url), 'utf8')));
const NOW = new Date('2026-10-15T09:00:00Z'); // the fixtures were saved on this morning
const gov = (files: Record<string, string> = {}, calls: string[] = []): GovDeps => ({
  now: NOW,
  matcher: makeMatcher(keywords),
  getText: async (url) => {
    calls.push(url);
    if (url in files) return files[url];
    throw new Error('HTTP 500');
  },
});

// ---------- Federal Register ----------
test('Federal Register address: term, 7-day start date, one page of up to 100, newest first', () => {
  const url = federalRegisterUrl(NOW);
  assert.match(url, /^https:\/\/www\.federalregister\.gov\/api\/v1\/documents\.json\?/);
  assert.ok(url.includes('conditions[term]=%22artificial+intelligence%22'));
  assert.ok(url.includes('conditions[publication_date][gte]=2026-10-08'));
  assert.ok(url.includes('per_page=100') && url.includes('order=newest'));
});

test('real Federal Register file: none of the 5 full-text hits has AI in its title, so all are dropped or too old', () => {
  const r = federalRegisterToItems(JSON.parse(fixture('fedreg_ai.json')), gov());
  assert.equal(r.items.length, 0);
  assert.equal(r.skipped.filter((s) => s.reason === 'not_ai').length + r.tooOld, 5); // every document accounted for
  assert.ok(r.skipped.some((s) => /Vertical Power Delivery/.test(s.title))); // the unrelated patent notice from the spec
  assert.ok(r.skipped.every((s) => s.feed === 'Federal Register'));
});

test('Federal Register: a document with AI in the title becomes a category 3 Item with the government page as url', () => {
  const json = {
    results: [
      { title: 'Request for Information on the Artificial Intelligence Action Plan', abstract: 'The Office <b>seeks</b> comment on AI policy.', html_url: 'https://www.federalregister.gov/documents/2026/10/14/2026-99999/request-for-information?utm_source=x', publication_date: '2026-10-14', type: 'Notice' },
      { title: 'Crypto Asset Markets', abstract: null, html_url: 'https://www.federalregister.gov/documents/2026/10/13/2026-1/crypto', publication_date: '2026-10-13', type: 'Proposed Rule' },
    ],
  };
  const r = federalRegisterToItems(json, gov());
  assert.equal(r.items.length, 1);
  const item = ItemSchema.parse(r.items[0]);
  assert.equal(item.url, 'https://www.federalregister.gov/documents/2026/10/14/2026-99999/request-for-information'); // tracking removed
  assert.equal(item.outlet, 'Federal Register');
  assert.equal(item.outlet_type, 'official');
  assert.equal(item.category_hint, '3');
  assert.equal(item.lane, 'topic');
  assert.equal(item.published_at, '2026-10-14T00:00:00.000Z');
  assert.equal(item.snippet, 'The Office seeks comment on AI policy.');
  assert.equal(r.skipped.length, 1);
});

// ---------- EU Commission feed ----------
test('EU snippet: the short teaser sentence, not the whole page HTML', () => {
  const xml = fixture('eu_digital.xml');
  const description = xml.match(/<description>([\s\S]*?)<\/description>/g)![0].replace(/<\/?description>/g, '');
  const html = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  assert.equal(euSnippet(html), 'The Commission holds a special meeting of the Scientific Panel on artificial intelligence (AI).');
  assert.equal(euSnippet('<div>no teaser here</div>'), '');
});

test('real EU feed: only items inside 7 days with AI in the title are kept; the rest are counted or logged', async () => {
  const r = await euFeedToItems(fixture('eu_digital.xml'), gov());
  assert.deepEqual(r.items.map((i) => i.title), ['Commission holds special meeting of Scientific panel on frontier AI safety and risks']);
  const item = ItemSchema.parse(r.items[0]);
  assert.equal(item.url, 'https://digital-strategy.ec.europa.eu/en/news/commission-holds-special-meeting-scientific-panel-frontier-ai-safety-and-risks');
  assert.equal(item.outlet, 'European Commission');
  assert.equal(item.outlet_type, 'official');
  assert.equal(item.category_hint, '3');
  assert.equal(item.published_at, '2026-10-09T07:16:00.000Z');
  assert.match(item.snippet, /^The Commission holds a special meeting/);
  assert.equal(r.items.length + r.skipped.length + r.tooOld, 10); // all 10 feed entries accounted for
  assert.equal(r.tooOld, 9); // 8 Oct 07:00 is just outside the window
});

test('EU feed: a recent item without AI in its title is logged not_ai', async () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Digital Services Act: new guidelines</title><link>https://digital-strategy.ec.europa.eu/en/news/dsa</link><pubDate>Wed, 14 Oct 2026 07:00:00 +0000</pubDate></item></channel></rss>`;
  const r = await euFeedToItems(xml, gov());
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['not_ai']);
});

// ---------- both sources ----------
test('both sources: one failing source is ERROR, the other still works', async () => {
  const r = await collectGovernment(gov({ [euFeedUrl]: fixture('eu_digital.xml') })); // the Federal Register address is not served
  const [fr, eu] = r.providers;
  assert.equal(fr.name, 'Federal Register');
  assert.equal(fr.status, 'ERROR');
  assert.equal(eu.status, 'OK');
  assert.equal(eu.items, 1);
  assert.equal(r.items.length, 1);
});

test('Federal Register changes shape: ERROR with a clear note, not a crash', async () => {
  const r = await collectGovernment(gov({ [federalRegisterUrl(NOW)]: '{"results": "oops"}', [euFeedUrl]: fixture('eu_digital.xml') }));
  assert.equal(r.providers[0].status, 'ERROR');
  assert.match(r.providers[0].note ?? '', /unexpected shape/);
});

test('both sources work: Federal Register (saved file) plus EU feed', async () => {
  const calls: string[] = [];
  const r = await collectGovernment(gov({ [federalRegisterUrl(NOW)]: fixture('fedreg_ai.json'), [euFeedUrl]: fixture('eu_digital.xml') }, calls));
  assert.deepEqual(r.providers.map((p) => p.status), ['OK', 'OK']);
  assert.equal(calls.length, 2);
  assert.equal(r.items.length, 1);
});
