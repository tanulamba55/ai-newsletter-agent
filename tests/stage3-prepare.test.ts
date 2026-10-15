// Stage 3 part 1 tests (health guard, dedupe, cap, clusters, slices). No network and no AI: made-up items.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clusterTitles, similarity, titleWords } from '../src/lib/dedupe.ts';
import { checkHealth, prepare, toSlices } from '../src/lib/prepare.ts';
import { CandidateSchema, Health2Schema, HealthSchema, Stage3ConfigSchema } from '../src/lib/schemas.ts';
import type { Candidate, Item } from '../src/lib/schemas.ts';

const NOW = new Date('2026-10-15T12:00:00Z');
const cfg = Stage3ConfigSchema.parse(JSON.parse(readFileSync(new URL('../config/stage3.json', import.meta.url), 'utf8')));

let n = 0;
function item(over: Partial<Item> = {}): Item {
  n++;
  return { id: `id${n}`, title: `Unrelated story number ${n} about topic${n} things${n}`, url: `https://example.com/${n}`, outlet: 'Outlet', outlet_type: 'media', published_at: '2026-10-14T10:00:00.000Z', snippet: '', ...over };
}
const health1 = (feeds_error: number) => HealthSchema.parse({ stage: 1, run_at: NOW.toISOString(), total_items: 200, feeds: [], feeds_error, fallbacks_fired: 0, undecodable_links: 0, not_ai: 0, undated: 0 });
const health2 = (bing: 'OK' | 'ERROR', google: 'OK' | 'ERROR') =>
  Health2Schema.parse({ stage: 2, run_at: NOW.toISOString(), total_items: 200, providers: [{ name: 'Bing News', status: bing, queries: 1, items: 0 }, { name: 'Google News', status: google, queries: 1, items: 0 }], providers_error: 0, fallbacks_fired: 0, undecodable_links: 0 });

// ---------- step 0: health guard ----------
test('health guard: healthy input passes', () => {
  assert.deepEqual(checkHealth(health1(1), health2('OK', 'OK'), 400, cfg), []);
});

test('health guard: more than 3 feeds in ERROR stops', () => {
  assert.equal(checkHealth(health1(3), health2('OK', 'OK'), 400, cfg).length, 0); // exactly 3 is allowed
  assert.match(checkHealth(health1(4), health2('OK', 'OK'), 400, cfg)[0], /4 Stage 1 feeds are in ERROR/);
});

test('health guard: Bing and Google both failed stops, one failing does not', () => {
  assert.match(checkHealth(health1(0), health2('ERROR', 'ERROR'), 400, cfg)[0], /Bing and Google News both failed/);
  assert.deepEqual(checkHealth(health1(0), health2('ERROR', 'OK'), 400, cfg), []);
});

test('health guard: too few items stops', () => {
  assert.match(checkHealth(health1(0), health2('OK', 'OK'), cfg.min_items - 1, cfg)[0], /only 149 items/);
});

test('health guard: a missing health file is a problem, and several problems are all listed', () => {
  const problems = checkHealth(null, null, 10, cfg);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /health_stage1\.json is missing/);
});

// ---------- title similarity ----------
test('similarity: same story with different wording is high, different stories are low, tiny titles are never similar', () => {
  const a = titleWords('OpenAI launches GPT-6 with longer memory');
  const b = titleWords('OpenAI Launches GPT-6 With Longer Memory!'); // same words, different case and punctuation
  const b2 = titleWords('OpenAI launches GPT-6 with longer memory, says report'); // two extra words
  const c = titleWords('Nvidia earnings beat expectations again');
  assert.equal(similarity(a, b), 1);
  assert.ok(similarity(a, b2) >= 0.5 && similarity(a, b2) < 0.8); // same cluster (sorted together), but not merged as identical
  assert.ok(similarity(a, c) < 0.2);
  assert.equal(similarity(titleWords('AI news'), titleWords('AI news')), 0);
});

test('clusters: similar titles share a number, numbering follows first appearance', () => {
  const ids = clusterTitles(['Nvidia earnings beat expectations again', 'OpenAI launches GPT-6 with longer memory', 'OpenAI launches GPT-6 with longer memory today', 'Nvidia earnings beat expectations again, says CEO'], 0.5);
  assert.deepEqual(ids, [0, 1, 1, 0]);
});

// ---------- steps 1 to 2b ----------
test('date filter: items that aged out are counted, not logged', () => {
  const r = prepare([item(), item({ published_at: '2026-10-01T10:00:00.000Z' })], cfg, NOW);
  assert.equal(r.funnel.too_old, 1);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.skipped.length, 0);
});

test('same URL from Stage 1 and Stage 2: one item, the official or snippet copy wins, the other is logged duplicate', () => {
  const a = item({ url: 'https://example.com/same', snippet: '' });
  const b = item({ url: 'https://example.com/same', snippet: 'has a snippet', lane: 'china' });
  const r = prepare([a, b], cfg, NOW);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].snippet, 'has a snippet');
  assert.equal(r.funnel.duplicates_url, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['duplicate']);
});

test('near-identical titles: one candidate, the official copy wins, the other outlets are kept in covered_by', () => {
  const title = 'Mistral releases new open-weights model for coding tasks';
  const media1 = item({ title, outlet: 'TechCrunch', url: 'https://tc.example.com/a' });
  const official = item({ title, outlet: 'Mistral', outlet_type: 'official', url: 'https://mistral.example.com/a', published_at: '2026-10-14T12:00:00.000Z' });
  const media2 = item({ title: title + ' - report', outlet: 'The Verge', url: 'https://verge.example.com/a', published_at: '2026-10-13T12:00:00.000Z' });
  const r = prepare([media1, official, media2], cfg, NOW);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].outlet, 'Mistral');
  assert.deepEqual(r.candidates[0].covered_by.map((c) => c.outlet).sort(), ['TechCrunch', 'The Verge']);
  assert.equal(r.candidates[0].covered_by.find((c) => c.outlet === 'The Verge')?.published_at, '2026-10-13T12:00:00.000Z'); // kept for the story date
  assert.equal(r.funnel.duplicates_title, 2);
  assert.equal(r.skipped.filter((s) => s.reason === 'duplicate').length, 2);
});

test('different stories are not merged', () => {
  const r = prepare([item({ title: 'Nvidia earnings beat expectations again' }), item({ title: 'OpenAI launches GPT-6 with longer memory' })], cfg, NOW);
  assert.equal(r.candidates.length, 2);
  assert.equal(r.funnel.duplicates_title, 0);
});

test('item cap: official items stay first, then newest; the rest are logged over_item_cap', () => {
  const small = { ...cfg, item_cap: 3 };
  const items = [
    item({ published_at: '2026-10-10T00:00:00.000Z' }),
    item({ published_at: '2026-10-14T00:00:00.000Z' }),
    item({ published_at: '2026-10-12T00:00:00.000Z' }),
    item({ outlet_type: 'official', published_at: '2026-10-09T00:00:00.000Z' }),
    item({ published_at: '2026-10-13T00:00:00.000Z' }),
  ];
  const r = prepare(items, small, NOW);
  assert.equal(r.candidates.length, 3);
  assert.ok(r.candidates.some((c) => c.outlet_type === 'official')); // old, but official
  assert.ok(r.candidates.some((c) => c.published_at.startsWith('2026-10-14'))); // newest
  assert.equal(r.funnel.over_item_cap, 2);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['over_item_cap', 'over_item_cap']);
});

// ---------- clusters and slices ----------
test('candidates: similar titles sit next to each other, newest story first; hints and snippet cap are kept', () => {
  const a1 = item({ title: 'Nvidia earnings beat expectations again as demand grows', published_at: '2026-10-12T00:00:00.000Z' });
  const b = item({ title: 'EU AI Act enforcement starts for general purpose models', published_at: '2026-10-14T00:00:00.000Z', category_hint: '3', lane: 'topic' });
  const a2 = item({ title: 'Nvidia earnings beat expectations again as demand soars', published_at: '2026-10-13T00:00:00.000Z', snippet: 'x'.repeat(1000), yc_match: { company: 'Acme', batch: 'F26' } });
  const r = prepare([a1, b, a2], { ...cfg, title_duplicate_similarity: 0.95 }, NOW); // keep the Nvidia pair apart from dedupe so they stay as two candidates
  const titles = r.candidates.map((c) => c.title);
  assert.deepEqual(titles, [b.title, a2.title, a1.title]); // newest cluster first; the pair is adjacent
  assert.equal(r.candidates[1].cluster, r.candidates[2].cluster);
  assert.notEqual(r.candidates[0].cluster, r.candidates[1].cluster);
  assert.equal(r.candidates[0].category_hint, '3');
  assert.deepEqual(r.candidates[1].yc_match, { company: 'Acme', batch: 'F26' });
  assert.ok(r.candidates[1].snippet.length <= cfg.snippet_chars);
  for (const c of r.candidates) CandidateSchema.parse(c);
});

test('slices: sizes are similar, nothing is lost, and a cluster is never split', () => {
  const list: Candidate[] = [];
  for (let c = 0; c < 20; c++) for (let k = 0; k < (c % 3) + 1; k++) list.push(CandidateSchema.parse({ id: `c${c}-${k}`, title: `t${c}`, outlet: 'o', outlet_type: 'media', published_at: '2026-10-14T00:00:00.000Z', snippet: '', cluster: c }));
  const slices = toSlices(list, 4);
  assert.equal(slices.length, 4);
  assert.equal(slices.flat().length, list.length);
  const sliceOf = new Map<number, Set<number>>(); // cluster number -> the slices it appears in
  slices.forEach((s, i) => s.forEach((x) => sliceOf.set(x.cluster, (sliceOf.get(x.cluster) ?? new Set()).add(i))));
  for (const where of sliceOf.values()) assert.equal(where.size, 1);
  const sizes = slices.map((s) => s.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 6, `sizes ${sizes}`);
});

test('slices: fewer candidates than slices still works', () => {
  assert.equal(toSlices([], 4).length, 0);
  const one = [CandidateSchema.parse({ id: 'a', title: 'a', outlet: 'o', outlet_type: 'media', published_at: '2026-10-14T00:00:00.000Z', snippet: '', cluster: 0 })];
  assert.equal(toSlices(one, 4).length, 1);
});
