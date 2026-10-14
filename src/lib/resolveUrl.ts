// Turns a Google News link (news.google.com/rss/articles/<id>) into the real article URL.
// Google News feeds only give us redirect links, and every story needs its original source URL.
// Method proven in scripts/spikes/decode-spike.mjs (95 of 95 links on 13 Oct 2026).
// WARNING: step 2 uses an undocumented Google endpoint. It can break without notice (Q15).
import { readJsonOr, writeJsonAtomic } from './files.ts';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const PAUSE_MS = 1500; // polite pause between calls to Google

export type Resolved = { url: string } | { error: string };
export type FetchFn = typeof fetch;

// The article id is the last part of the link path.
export function articleId(link: string): string {
  return new URL(link).pathname.split('/').pop() ?? '';
}

// Old-style ids hold the real URL inside base64. No network needed.
export function tryBase64(id: string): string | null {
  const buf = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const match = buf.toString('latin1').match(/https?:\/\/[\x21-\x7e]+/);
  return match ? match[0] : null;
}

// New-style ids: ask Google. First the article page (gives a signature and timestamp),
// then the batchexecute call that returns the real URL.
export async function askGoogle(id: string, fetchFn: FetchFn = fetch): Promise<Resolved> {
  const page = await fetchFn(`https://news.google.com/rss/articles/${id}`, { headers: { 'User-Agent': UA } });
  const html = await page.text();
  const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sig || !ts) return { error: `no signature/timestamp (HTTP ${page.status})` };

  const inner = JSON.stringify([
    'garturlreq',
    [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    Number(ts),
    sig,
  ]);
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
  const res = await fetchFn('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
    body,
  });
  const out = await res.text();
  if (!res.ok) return { error: `batchexecute HTTP ${res.status}` };
  const url = readUrlFromReply(out);
  return url ? { url } : { error: 'no url in response' };
}

// The reply is JSON inside JSON: [["wrb.fr","Fbv4je","[\\"garturlres\\",\\"<url>\\",1]", ...]].
// Parse it properly. (A plain text match cuts the URL at the first escaped character such as = or &.)
export function readUrlFromReply(reply: string): string | null {
  try {
    const line = reply.split('\n').find((l) => l.startsWith('[["wrb.fr"'));
    if (line) {
      const inner = JSON.parse(JSON.parse(line)[0][2]);
      if (inner[0] === 'garturlres' && typeof inner[1] === 'string' && /^https?:/.test(inner[1])) return inner[1];
    }
  } catch {
    // fall through to the text match below
  }
  const match = reply.match(/garturlres\\",\\"(https?:[^\\]+)/);
  return match ? match[1] : null;
}

// Google News also indexes site files (scripts, images). Those are not articles.
export function looksLikeAsset(url: string): boolean {
  const { pathname } = new URL(url);
  return /\/_next\/|\/static\/|\.(js|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|json)$/i.test(pathname);
}

// A decoder that remembers answers in a JSON file (cacheFile), so reruns cost nothing.
// Cache holds only successes; failures are retried next run.
export function makeResolver(opts: { cacheFile: string; fetchFn?: FetchFn; pauseMs?: number }) {
  const fetchFn = opts.fetchFn ?? fetch;
  const pauseMs = opts.pauseMs ?? PAUSE_MS;
  const cache = readJsonOr<Record<string, string>>(opts.cacheFile, {});
  let networkCalls = 0;

  async function resolve(link: string): Promise<Resolved> {
    let id: string;
    try {
      id = articleId(link);
    } catch {
      return { error: 'bad link' };
    }
    if (!id) return { error: 'no article id' };
    if (cache[id]) return { url: cache[id] };

    let url = tryBase64(id);
    if (!url) {
      if (networkCalls > 0) await new Promise((r) => setTimeout(r, pauseMs));
      networkCalls++;
      let result: Resolved;
      try {
        result = await askGoogle(id, fetchFn);
      } catch (e) {
        result = { error: (e as Error).message };
      }
      if ('error' in result) return result;
      url = result.url;
    }
    if (url.includes('news.google.com')) return { error: 'still a google link' };
    if (looksLikeAsset(url)) return { error: 'not an article (site file)' };
    cache[id] = url;
    writeJsonAtomic(opts.cacheFile, cache);
    return { url };
  }

  return { resolve, networkCalls: () => networkCalls };
}
