// Stage 3 review step tests. No network and no AI: made-up shortlist and review answers.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReview, checkReview } from '../src/lib/review.ts';
import type { ShortItem } from '../src/lib/review.ts';
import type { Review } from '../src/lib/schemas.ts';

const item = (id: string, over: Partial<ShortItem> = {}): ShortItem => ({ id, title: id, outlet: 'O', outlet_type: 'media', published_at: '2026-10-14T10:00:00.000Z', snippet: '', cluster: 0, covered_by: [], same_story: [], ...over });
const rev = (id: string, over: Partial<Review> = {}): Review => ({ id, action: 'keep', category: 5, score: 7, merge_into: null, reason: 'ok', ...over });

test('review check: a correct answer has no errors', () => {
  assert.deepEqual(checkReview([rev('a'), rev('b', { action: 'merge', merge_into: 'a' })], ['a', 'b']).errors, []);
});

test('review check: missing, extra and duplicate ids are reported', () => {
  const e = checkReview([rev('a'), rev('a'), rev('z')], ['a', 'b']).errors;
  assert.ok(e.some((x) => /1 ids missing/.test(x)));
  assert.ok(e.some((x) => /1 ids not in the input/.test(x)));
  assert.ok(e.some((x) => /1 ids appear more than once/.test(x)));
});

test('review check: a merge needs a kept target', () => {
  assert.match(checkReview([rev('a', { action: 'drop' }), rev('b', { action: 'merge', merge_into: 'a' })], ['a', 'b']).errors[0], /not a kept item/);
  assert.match(checkReview([rev('a', { action: 'merge' })], ['a']).errors[0], /merge without merge_into/);
});

test('apply: drop removes, merge adds the copy to the target, review category and score win', () => {
  const items = [item('a'), item('b'), item('c')];
  const { selected, dropped } = applyReview(items, [rev('a', { category: 6, score: 9 }), rev('b', { action: 'merge', merge_into: 'a' }), rev('c', { action: 'drop', reason: 'minor' })], 3);
  assert.deepEqual(selected.map((s) => [s.id, s.category, s.score]), [['a', 6, 9]]);
  assert.deepEqual(selected[0].same_story.map((m) => m.id), ['b']);
  assert.deepEqual(dropped.map((d) => [d.item.id, d.reason]), [['c', 'minor']]);
});

test('apply: at most N stories per category, best first, the rest logged', () => {
  const items = ['a', 'b', 'c'].map((id) => item(id));
  const { selected, dropped } = applyReview(items, [rev('a', { score: 6 }), rev('b', { score: 9 }), rev('c', { score: 7 })], 2);
  assert.deepEqual(selected.map((s) => s.id), ['b', 'c']);
  assert.match(dropped[0].reason, /over the 2 stories/);
});
