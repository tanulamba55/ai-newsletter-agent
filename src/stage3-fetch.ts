// Stage 3, part 4: download the article page of every selected story.
// Run:  node src/stage3-fetch.ts             (add --offline to replay from the cache)
// Reads data/stage3/selected.json plus the item files (for the web addresses).
// Writes data/stage3/articles.json: per story the page text (about 6000 characters), its links,
// and which copy the text came from. No AI. Network: one page per story, others only if that fails.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { fetchArticle } from './lib/fetchPage.ts';
import type { Article } from './lib/fetchPage.ts';
import { cacheDirFor, writeJsonAtomic } from './lib/files.ts';
import { makeGetText } from './lib/rss.ts';
import { CandidateSchema, ItemSchema } from './lib/schemas.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'data');
const OFFLINE = process.argv.includes('--offline');

const SelectedSchema = CandidateSchema.extend({ same_story: z.array(z.object({ id: z.string(), outlet: z.string(), title: z.string() })) });
const selected = z.array(SelectedSchema).parse(JSON.parse(readFileSync(join(DATA, 'stage3', 'selected.json'), 'utf8')));

// id -> web address, from both stages' item files.
const urlOf = new Map<string, string>();
for (const f of ['items.json', 'items_extra.json']) {
  const p = join(DATA, f);
  if (existsSync(p)) for (const it of z.array(ItemSchema).parse(JSON.parse(readFileSync(p, 'utf8')))) urlOf.set(it.id, it.url);
}

const getText = makeGetText({ cacheDir: join(cacheDirFor(ROOT, new Date()), 'pages'), offline: OFFLINE });

const articles: Article[] = [];
const report: string[] = [];
// Four at a time keeps it quick without hammering any one site.
const queue = [...selected];
async function worker() {
  for (let s = queue.shift(); s; s = queue.shift()) {
    // Own address first, then the other outlets that ran the same story.
    const urls = [urlOf.get(s.id), ...s.covered_by.map((c) => c.url), ...s.same_story.map((m) => urlOf.get(m.id))].filter((u): u is string => !!u);
    const { article, errors } = await fetchArticle(s.id, [...new Set(urls)], s.snippet, getText);
    articles.push(article);
    report.push(`${article.via.padEnd(12)} ${String(article.text.length).padStart(5)} chars ${String(article.links.length).padStart(3)} links  ${s.outlet} | ${s.title.slice(0, 50)}${errors.length ? `  (${errors.length} failed)` : ''}`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

// Keep the order of selected.json.
const order = new Map(selected.map((s, i) => [s.id, i]));
articles.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
writeJsonAtomic(join(DATA, 'stage3', 'articles.json'), articles);

console.log(report.join('\n'));
const by = (v: Article['via']) => articles.filter((a) => a.via === v).length;
console.log(`\nArticles: ${articles.length} (own page ${by('own')}, other outlet ${by('other_outlet')}, snippet only ${by('snippet')})`);
