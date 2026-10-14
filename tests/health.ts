// Health check for the free outside services this project depends on.
// Run:  node tests/health.ts          (quick: status + newest item date)
//       node tests/health.ts --full   (also: Google link decoder, Bing site: counts, Jina)
// It only READS and REPORTS. It never edits docs. Results are saved in data/health/<date>.json
// so a later session can read them and we can discuss what to do.
import { mkdirSync, writeFileSync } from 'node:fs';

const FULL = process.argv.includes('--full');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

type Status = 'pass' | 'warn' | 'fail';
type Result = { name: string; q: string; status: Status; note: string };

// fetch with a timeout, following redirects (some feeds moved addresses).
// A dropped connection gets one retry after a short pause (one-off network blips are common).
async function get(url: string, init: RequestInit = {}) {
  const run = () => fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': UA, ...(init.headers ?? {}) } });
  try {
    return await run();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return run();
  }
}

// readable reason for a failed request (Node hides the real cause inside e.cause)
function why(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  return err.cause?.code ?? err.cause?.message ?? err.message ?? String(e);
}

// newest date found in an RSS/Atom text, as a Date (or null)
function newestDate(xml: string): Date | null {
  const dates = [...xml.matchAll(/<(?:pubDate|published|updated|dc:date)>([^<]+)</g)]
    .map((m) => new Date(m[1].trim()))
    .filter((d) => !isNaN(d.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

// --- 1. Feeds: must answer 200 and have a recent item. maxAge = days before we warn.
const FEEDS: { name: string; url: string; q: string; maxAge?: number }[] = [
  { name: 'MarkTechPost', url: 'https://www.marktechpost.com/feed/', q: 'Q4' },
  { name: 'AI Business', url: 'https://aibusiness.com/rss.xml', q: '' },
  { name: 'AI Models Substack', url: 'https://aimodels.substack.com/feed', q: 'Q2', maxAge: 21 },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', q: '' },
  { name: 'SCMP', url: 'https://www.scmp.com/rss/5/feed', q: 'Q13' },
  { name: 'TechNode', url: 'https://technode.com/feed/', q: '' },
  { name: 'Pandaily', url: 'https://pandaily.com/feed/', q: 'Q13' },
  { name: 'ChinaTalk', url: 'https://www.chinatalk.media/feed', q: '', maxAge: 21 },
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', q: '' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', q: '' },
  { name: 'Nvidia', url: 'https://blogs.nvidia.com/feed/', q: '' },
  { name: 'Hugging Face blog', url: 'https://huggingface.co/blog/feed.xml', q: '' },
  { name: 'Mistral', url: 'https://mistral.ai/rss.xml', q: '', maxAge: 21 },
  { name: 'Apple ML', url: 'https://machinelearning.apple.com/rss.xml', q: '', maxAge: 30 },
  { name: 'Meta', url: 'https://about.fb.com/news/feed/', q: '' },
  { name: 'Microsoft', url: 'https://news.microsoft.com/source/topics/ai/feed/', q: '' },
  { name: 'Anthropic (raw GitHub)', url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml', q: 'Q9', maxAge: 21 },
  { name: 'Anthropic (jsDelivr mirror)', url: 'https://cdn.jsdelivr.net/gh/Olshansk/rss-feeds@main/feeds/feed_anthropic_news.xml', q: 'Q9', maxAge: 21 },
  { name: 'TechCrunch YC tag', url: 'https://techcrunch.com/tag/y-combinator/feed/', q: 'Q12', maxAge: 60 },
  { name: 'YC blog', url: 'https://www.ycombinator.com/blog/rss', q: 'Q12', maxAge: 45 },
  { name: 'TechCrunch Startups', url: 'https://techcrunch.com/category/startups/feed/', q: '' },
  { name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', q: '' },
];

async function checkFeed(f: (typeof FEEDS)[number]): Promise<Result> {
  try {
    const res = await get(f.url);
    if (!res.ok) return { name: f.name, q: f.q, status: 'fail', note: `HTTP ${res.status}` };
    const newest = newestDate(await res.text());
    if (!newest) return { name: f.name, q: f.q, status: 'warn', note: 'answers 200 but no item dates found' };
    const age = Math.round((Date.now() - newest.getTime()) / 86400000);
    const moved = res.redirected ? ' (address redirects)' : '';
    const old = age > (f.maxAge ?? 14);
    return { name: f.name, q: f.q, status: old ? 'warn' : 'pass', note: `newest item ${age}d old${moved}` };
  } catch (e) {
    return { name: f.name, q: f.q, status: 'fail', note: why(e) };
  }
}

// --- 2. Other services
async function checkHuggingFace(): Promise<Result> {
  const name = 'Hugging Face models API';
  try {
    const res = await get('https://huggingface.co/api/models?author=Qwen&sort=createdAt&direction=-1&limit=5');
    const data = await res.json();
    const ok = res.ok && Array.isArray(data) && data[0]?.id && data[0]?.createdAt;
    return { name, q: '', status: ok ? 'pass' : 'fail', note: ok ? 'has id and createdAt' : `unexpected shape (HTTP ${res.status})` };
  } catch (e) {
    return { name, q: '', status: 'fail', note: why(e) };
  }
}

async function checkYc(name: string, url: string): Promise<Result> {
  try {
    const res = await get(url);
    const data = await res.json(); // must be valid JSON
    return { name, q: 'Q10', status: res.ok ? 'pass' : 'fail', note: res.ok ? `valid JSON (${Array.isArray(data) ? data.length + ' items' : Object.keys(data).slice(0, 4).join(',')})` : `HTTP ${res.status}` };
  } catch (e) {
    return { name, q: 'Q10', status: 'fail', note: why(e) };
  }
}

// Expected to be blocked today. Warn (good news) if it starts working.
async function checkStillBlocked(name: string, url: string, q: string): Promise<Result> {
  try {
    const res = await get(url);
    return res.ok ? { name, q, status: 'warn', note: 'now answers 200: revisit the workaround' } : { name, q, status: 'pass', note: `still blocked (HTTP ${res.status}), as expected` };
  } catch {
    return { name, q, status: 'pass', note: 'still blocked (no connection), as expected' };
  }
}

// --- 3. Full-only checks
// Compact copy of the decoder idea in scripts/spikes/decode-spike.mjs (new-style Google News links).
async function decodeGoogleLink(link: string): Promise<string | null> {
  const id = new URL(link).pathname.split('/').pop()!;
  const html = await (await get(`https://news.google.com/rss/articles/${id}`)).text();
  const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sig || !ts) return null;
  const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sig]);
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
  const res = await get('https://news.google.com/_/DotsSplashUi/data/batchexecute', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
  const m = (await res.text()).match(/garturlres\\",\\"(https?:[^\\]+)/);
  return m ? m[1] : null;
}

async function checkDecoder(): Promise<Result> {
  const name = 'Google News link decoder';
  try {
    const xml = await (await get('https://news.google.com/rss/search?q=site:venturebeat.com+when:7d&hl=en-US&gl=US&ceid=US:en')).text();
    const links = [...xml.matchAll(/<link>(https:\/\/news\.google\.com\/rss\/articles\/[^<]+)<\/link>/g)].map((m) => m[1]).slice(0, 3);
    if (links.length < 3) return { name, q: 'Q15', status: 'fail', note: `Google News search gave only ${links.length} links` };
    let ok = 0;
    for (const l of links) {
      const url = await decodeGoogleLink(l);
      if (url && !url.includes('news.google.com')) ok++;
      await new Promise((r) => setTimeout(r, 1500)); // polite pause
    }
    return { name, q: 'Q15', status: ok === 3 ? 'pass' : ok > 0 ? 'warn' : 'fail', note: `${ok} of 3 links decoded` };
  } catch (e) {
    return { name, q: 'Q15', status: 'fail', note: why(e) };
  }
}

async function checkBing(domain: string): Promise<Result> {
  const name = `Bing site:${domain}`;
  try {
    const res = await get(`https://www.bing.com/news/search?q=site%3A${domain}&format=rss&qft=interval%3D%227%22`);
    const n = [...(await res.text()).matchAll(/<item>/g)].length;
    // counts move a lot day to day, so this is only a rough guide
    return { name, q: 'Q20', status: !res.ok ? 'fail' : n === 0 ? 'warn' : 'pass', note: res.ok ? `${n} items in 7 days` : `HTTP ${res.status}` };
  } catch (e) {
    return { name, q: 'Q20', status: 'fail', note: why(e) };
  }
}

async function checkJina(): Promise<Result> {
  const name = 'Jina Reader (Pandaily)';
  try {
    const res = await get('https://r.jina.ai/https://pandaily.com/');
    const len = (await res.text()).length;
    return { name, q: 'Q7', status: res.ok && len > 500 ? 'pass' : 'warn', note: `HTTP ${res.status}, ${len} characters` };
  } catch (e) {
    return { name, q: 'Q7', status: 'fail', note: why(e) };
  }
}

// --- Run everything
const tasks: Promise<Result>[] = [
  ...FEEDS.map(checkFeed),
  checkHuggingFace(),
  checkYc('YC launches JSON', 'https://www.ycombinator.com/launches.json'),
  checkYc('YC companies API', 'https://api.ycombinator.com/v0.1/companies'),
  checkStillBlocked('VentureBeat own feed', 'https://venturebeat.com/feed', 'Q8'),
  checkStillBlocked('KnowTechie', 'https://knowtechie.com/', 'Q7'),
];
if (FULL) {
  // run the slow ones one after another to stay polite
  tasks.push((async () => checkDecoder())());
  for (const d of ['scmp.com', 'technode.com', 'venturebeat.com', 'pandaily.com']) tasks.push(checkBing(d));
  tasks.push(checkJina());
}
const results = await Promise.all(tasks);

const count = (s: Status) => results.filter((r) => r.status === s).length;
const bad = results.filter((r) => r.status !== 'pass');
const when = new Date().toISOString();

if (bad.length === 0) {
  console.log(`health (${FULL ? 'full' : 'quick'}): ${results.length}/${results.length} OK  ${when.slice(0, 10)}`);
} else {
  console.log(`health (${FULL ? 'full' : 'quick'}): ${count('pass')} pass, ${count('warn')} warn, ${count('fail')} fail  ${when.slice(0, 10)}`);
  for (const r of bad) console.log(`  ${r.status.toUpperCase().padEnd(4)} ${r.name}${r.q ? ' [' + r.q + ']' : ''}: ${r.note}`);
}

// Keep the results (one file per run, so we can compare runs and discuss them later)
mkdirSync('data/health', { recursive: true });
const file = `data/health/${when.replace(/[:.]/g, '-')}-${FULL ? 'full' : 'quick'}.json`;
writeFileSync(file, JSON.stringify({ run_at: when, mode: FULL ? 'full' : 'quick', results }, null, 2));
console.log(`saved: ${file}`);
process.exitCode = count('fail') > 0 ? 1 : 0;
