// Stage 4 rendering tests. No network, no Chrome: made-up stories.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, renderNewsletter } from '../src/lib/render.ts';
import type { Story } from '../src/lib/schemas.ts';

const story = (over: Partial<Story> = {}): Story => ({ title: 'A title', category: 5, summary: 'A summary.', why_it_matters: 'It matters.', source_url: 'https://blog.example.com/post', date: '2026-10-14T10:00:00.000Z', ...over });

test('escaping: tags and quotes in titles and summaries cannot break the page', () => {
  const html = renderNewsletter([story({ title: '<script>alert("x")</script>', summary: 'Tom & "Jerry"' })], '2026-10-15');
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Tom &amp; &quot;Jerry&quot;/);
  assert.equal(esc(`a'b`), 'a&#39;b');
});

test('empty categories are left out, the others come in order 1-7 then 9', () => {
  const html = renderNewsletter([story({ category: 9 }), story({ category: 1 }), story({ category: 7 })], '2026-10-15');
  assert.doesNotMatch(html, /AI regulations and policy/); // category 3 has no stories
  const at = (name: string) => html.indexOf(`<h2>${name}</h2>`);
  assert.ok(at('Funding and startups') < at('China models and updates'));
  assert.ok(at('China models and updates') < at('AI infrastructure and research'));
});

test('links: source link and other coverage are clickable', () => {
  const html = renderNewsletter([story({ other_links: ['https://www.techcrunch.com/a'] })], '2026-10-15');
  assert.match(html, /<a href="https:\/\/blog\.example\.com\/post">Source: blog\.example\.com<\/a>/);
  assert.match(html, /<a href="https:\/\/www\.techcrunch\.com\/a">techcrunch\.com<\/a>/);
});

test('cover: issue date, 7-day range and story count', () => {
  const html = renderNewsletter([story(), story()], '2026-10-15');
  assert.match(html, /Issue date: 2026-10-15/);
  assert.match(html, /Covering 2026-10-08 to 2026-10-15/);
  assert.match(html, /2 stories/);
});
