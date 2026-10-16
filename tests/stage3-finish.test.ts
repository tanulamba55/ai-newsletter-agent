// Stage 3 finish tests (quote matcher, source checker, story date, zod shapes). No network, no AI.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, earliestDate, normalize, quoteFound } from '../src/lib/finish.ts';
import { StorySchema, SummarySchema } from '../src/lib/schemas.ts';

const RULES = { aggregator_hosts: ['msn.com', 'news.google.com'], trusted_outlets: ['Reuters', 'SCMP'] };
const media = { url: 'https://blog.example/post', outlet: 'Some Blog', outlet_type: 'media' as const };
const official = { url: 'https://openai.com/x', outlet: 'OpenAI', outlet_type: 'official' as const };

test('quote: found despite case, punctuation and spacing', () => {
  assert.ok(quoteFound('Modal  announced, on October 14, that it raised $750 million.', 'modal announced on october 14 that it RAISED $750 million'));
});
test('quote: reworded or missing is not found; very short quotes never count', () => {
  assert.equal(quoteFound('Modal raised a lot of money in a big round', 'Modal secured a large sum of money recently'), false);
  assert.equal(quoteFound('Modal raised money', 'Modal'), false);
});
test('quote: works for Chinese text', () => {
  assert.ok(quoteFound('阿里巴巴今天发布了新的千问眼镜，并表示将在中国上市销售。', '阿里巴巴今天发布了新的千问眼镜'));
  assert.equal(normalize('A-b, C!'), 'abc');
});

test('source: official item uses its own address', () => {
  assert.deepEqual(checkSource('self', official, [], RULES), { ok: true, url: official.url, scoop: false });
});
test('source: media item "self" only for trusted outlets (scoop)', () => {
  assert.equal(checkSource('self', media, [], RULES).ok, false);
  assert.deepEqual(checkSource('self', { ...media, outlet: 'Reuters' }, [], RULES), { ok: true, url: media.url, scoop: true });
});
test('source: a link must be on the page and not an aggregator', () => {
  assert.equal(checkSource('https://a.com/x', media, ['https://a.com/x'], RULES).ok, true);
  assert.equal(checkSource('https://a.com/invented', media, ['https://a.com/x'], RULES).ok, false);
  assert.equal(checkSource('https://www.msn.com/y', media, ['https://www.msn.com/y'], RULES).ok, false);
  assert.equal(checkSource(null, media, [], RULES).ok, false);
});

test('story date: the earliest copy wins', () => {
  assert.equal(earliestDate(['2026-10-14T10:00:00.000Z', '2026-10-12T08:00:00.000Z']), '2026-10-12T08:00:00.000Z');
});

test('zod: bad shapes are rejected', () => {
  assert.equal(StorySchema.safeParse({ title: 't', category: 8, summary: 's', why_it_matters: 'w', source_url: 'https://a.com', date: 'd' }).success, false);
  assert.equal(StorySchema.safeParse({ title: 't', category: 9, summary: 's', why_it_matters: 'w', source_url: 'not a url', date: 'd' }).success, false);
  assert.equal(SummarySchema.safeParse({ id: 'a', skip: false }).success, false);
});
