// Stage 3 triage checker tests. No network and no AI: made-up agent answers.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTriage } from '../src/lib/triage.ts';

const row = (id: string, over: Record<string, unknown> = {}) => ({ id, keep: true, category: 5, score: 7, group: id, reason: 'new model release', ...over });

test('triage check: a correct answer has no errors', () => {
  const r = checkTriage([row('a'), row('b', { category: 9 })], ['a', 'b']);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 2);
});

test('triage check: category 8 is rejected (reserved)', () => {
  assert.match(checkTriage([row('a', { category: 8 })], ['a']).errors[0], /category/);
});

test('triage check: score outside 1-10 is rejected', () => {
  assert.match(checkTriage([row('a', { score: 11 })], ['a']).errors[0], /score/);
});

test('triage check: missing, extra and duplicate ids are reported', () => {
  const r = checkTriage([row('a'), row('a'), row('z')], ['a', 'b']);
  assert.ok(r.errors.some((e) => /1 ids missing/.test(e)));
  assert.ok(r.errors.some((e) => /1 ids not in the input/.test(e)));
  assert.ok(r.errors.some((e) => /1 ids appear more than once/.test(e)));
});

test('triage check: not an array is an error', () => {
  assert.deepEqual(checkTriage({ id: 'a' }, ['a']).errors, ['answer is not a JSON array']);
});
