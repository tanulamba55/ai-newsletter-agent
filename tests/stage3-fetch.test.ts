// Stage 3 page fetching tests. No network: fake download function and made-up pages.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks, fetchArticle, htmlToText } from '../src/lib/fetchPage.ts';

const BODY = 'Real article sentence about a new model. '.repeat(20);

test('htmlToText: keeps the article, drops scripts, nav and footer', () => {
  const html = `<html><nav>MENU LINKS</nav><script>var x=1</script><article><h1>Title</h1><p>${BODY}</p></article><footer>COPYRIGHT</footer></html>`;
  const text = htmlToText(html);
  assert.match(text, /Real article sentence/);
  assert.doesNotMatch(text, /MENU|COPYRIGHT|var x/);
});

test('htmlToText: no <article> falls back to the whole page; length is capped', () => {
  const text = htmlToText(`<body><div>${BODY}</div></body>`, 100);
  assert.ok(text.length <= 100);
  assert.match(text, /Real article/);
});

test('extractLinks: absolute, cleaned, no duplicates, no mailto, not the page itself', () => {
  const html = `<a href="/other?utm_source=x">a</a><a href="https://example.com/a/">b</a><a href="https://example.com/a">c</a><a href="mailto:x@y.z">d</a><a href="#top">e</a><a href="https://blog.org/post?id=1&amp;x=2">f</a>`;
  assert.deepEqual(extractLinks(html, 'https://example.com/a'), ['https://example.com/other', 'https://blog.org/post?id=1&x=2']);
});

test('fetchArticle: first address works', async () => {
  const getText = async () => `<article>${BODY}</article>`;
  const { article, errors } = await fetchArticle('id1', ['https://a.com/1', 'https://b.com/2'], 'snip', getText);
  assert.equal(article.via, 'own');
  assert.equal(article.fetched_from, 'https://a.com/1');
  assert.deepEqual(errors, []);
});

test('fetchArticle: own address fails, another outlet is tried next', async () => {
  const getText = async (u: string) => {
    if (u.includes('a.com')) throw new Error('HTTP 403');
    return `<article>${BODY}</article>`;
  };
  const { article, errors } = await fetchArticle('id1', ['https://a.com/1', 'https://b.com/2'], 'snip', getText);
  assert.equal(article.via, 'other_outlet');
  assert.equal(article.fetched_from, 'https://b.com/2');
  assert.match(errors[0], /a\.com.*403/);
});

test('fetchArticle: everything fails, the snippet is used', async () => {
  const getText = async () => {
    throw new Error('HTTP 404');
  };
  const { article } = await fetchArticle('id1', ['https://a.com/1'], 'the snippet', getText);
  assert.equal(article.via, 'snippet');
  assert.equal(article.text, 'the snippet');
  assert.equal(article.fetched_from, null);
});

test('fetchArticle: a page with almost no text counts as failed', async () => {
  const { article } = await fetchArticle('id1', ['https://a.com/1'], 'snip', async () => '<html><body>Please enable JavaScript</body></html>');
  assert.equal(article.via, 'snippet');
});
