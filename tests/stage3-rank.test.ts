// Stage 3 ranking tests. No network and no AI: made-up candidates and verdicts.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, rank } from '../src/lib/rank.ts';
import type { Candidate, Triage } from '../src/lib/schemas.ts';

const OPTS = { per_category: 2, near_miss_min_score: 4, near_miss_max: 3 };

const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({ id, title: id, outlet: 'O', outlet_type: 'media', published_at: '2026-10-14T10:00:00.000Z', snippet: '', cluster: 0, covered_by: [], ...over });
const tri = (id: string, over: Partial<Triage> = {}): Triage => ({ id, keep: true, category: 5, score: 7, group: id, reason: 'ok', ...over });

function run(pairs: [Candidate, Triage][]) {
  return rank(join(pairs.map((p) => p[0]), pairs.map((p) => p[1])), OPTS);
}

test('rank: top N per category by score, each category on its own', () => {
  const r = run([
    [cand('a'), tri('a', { score: 6 })],
    [cand('b'), tri('b', { score: 9 })],
    [cand('c'), tri('c', { score: 7 })],
    [cand('d'), tri('d', { score: 5, category: 1 })],
  ]);
  assert.deepEqual(r.shortlist.filter((x) => x.triage.category === 5).map((x) => x.candidate.id), ['b', 'c']);
  assert.deepEqual(r.shortlist.filter((x) => x.triage.category === 1).map((x) => x.candidate.id), ['d']);
});

test('rank: ties go to more outlets, then official, then newest', () => {
  const r = run([
    [cand('plain', { published_at: '2026-10-10T00:00:00.000Z' }), tri('plain')],
    [cand('newer', { published_at: '2026-10-14T00:00:00.000Z' }), tri('newer')],
    [cand('official', { outlet_type: 'official', published_at: '2026-10-09T00:00:00.000Z' }), tri('official')],
    [cand('many', { covered_by: [{ outlet: 'X', url: 'u', published_at: 'p' }] }), tri('many')],
  ]);
  assert.deepEqual(r.shortlist.map((x) => x.candidate.id), ['many', 'official']);
  assert.deepEqual(r.near_miss.map((x) => x.candidate.id), ['newer', 'plain']);
});

test('near miss: dropped items scoring 4 enter, "no category" and low scores do not', () => {
  const r = run([
    [cand('low'), tri('low', { keep: false, score: 4, reason: 'small round' })],
    [cand('nocat'), tri('nocat', { keep: false, score: 4, reason: 'no category' })],
    [cand('bad'), tri('bad', { keep: false, score: 2, reason: 'not about AI' })],
  ]);
  assert.deepEqual(r.near_miss.map((x) => x.candidate.id), ['low']);
});

test('near miss: the band is capped, best first', () => {
  const pairs: [Candidate, Triage][] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => [cand(id), tri(id, { keep: false, score: 4 + (i % 2) === 4 ? 4 : 5, reason: 'x' })]);
  assert.equal(run(pairs).near_miss.length, 3);
});

test('groups: copies of one story collapse into the best item, the others are noted as merged', () => {
  const r = run([
    [cand('a'), tri('a', { score: 6, group: 'a' })],
    [cand('b'), tri('b', { score: 8, group: 'a' })],
    [cand('c'), tri('c', { score: 7, group: 'c' })],
  ]);
  assert.deepEqual(r.shortlist.map((x) => x.candidate.id), ['b', 'c']);
  assert.deepEqual(r.shortlist[0].merged?.map((m) => m.id), ['a']);
});

test('join: a verdict without a candidate is ignored', () => {
  assert.equal(join([cand('a')], [tri('a'), tri('zzz')]).length, 1);
});
