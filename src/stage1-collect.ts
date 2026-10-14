// Stage 1: collect the last 7 days of items from RSS feeds, Google News queries and Hugging Face.
// Run:  node src/stage1-collect.ts            (download live)
//       node src/stage1-collect.ts --offline  (replay today's cached downloads, no network)
// Writes data/items.json, data/skipped_stage1.json, data/health_stage1.json and prints a table.
// No AI and no paid service here. Rules: docs/SPEC.md and docs/specs/stage1-collect.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { cacheDirFor, writeJsonAtomic } from './lib/files.ts';
import { collectHf } from './lib/huggingface.ts';
import { makeMatcher } from './lib/prefilter.ts';
import { collectRss, makeGetText } from './lib/rss.ts';
import type { CollectResult, Deps } from './lib/rss.ts';
import { makeResolver } from './lib/resolveUrl.ts';
import { FeedConfigSchema, HealthSchema, ItemSchema, KeywordsSchema, SkippedSchema } from './lib/schemas.ts';
import type { FeedHealth, Item, Skipped } from './lib/schemas.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OFFLINE = process.argv.includes('--offline');
const now = new Date();

function readConfig<T>(name: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(join(ROOT, 'config', name), 'utf8')));
}

const feeds = readConfig('feeds.json', z.array(FeedConfigSchema));
const keywords = readConfig('keywords.json', KeywordsSchema);

const deps: Deps = {
  getText: makeGetText({ cacheDir: cacheDirFor(ROOT, now), offline: OFFLINE }),
  // Offline: the decoder may only use its saved answers, never call Google.
  resolve: makeResolver({
    cacheFile: join(ROOT, 'data', 'cache', 'google-links.json'),
    fetchFn: OFFLINE ? () => Promise.reject(new Error('offline')) : undefined,
  }).resolve,
  now,
  matcher: makeMatcher(keywords),
  log: (msg) => console.log(msg),
};

// --- Run every feed. One bad feed never stops the run. ---
const rows: FeedHealth[] = [];
const allItems: Item[] = [];
const allSkipped: Skipped[] = [];
let tooOld = 0;

for (const feed of feeds) {
  let result: CollectResult;
  try {
    result = feed.kind === 'hf-models' ? await collectHf(feed, deps) : await collectRss(feed, deps);
  } catch (e) {
    result = { items: [], skipped: [], tooOld: 0, fallbackUsed: false, status: 'ERROR', note: (e as Error).message };
  }
  const dates = result.items.map((i) => i.published_at).sort();
  rows.push({
    name: feed.name,
    status: result.status,
    items: result.items.length,
    oldest: dates[0] ?? null,
    newest: dates[dates.length - 1] ?? null,
    fallback_used: result.fallbackUsed,
    ...(result.note ? { note: result.note } : {}),
  });
  allItems.push(...result.items);
  allSkipped.push(...result.skipped);
  tooOld += result.tooOld;
}

// --- Remove exact-URL duplicates. If two copies exist, keep the one with a snippet. ---
const byUrl = new Map<string, Item>();
for (const item of allItems) {
  const have = byUrl.get(item.url);
  if (!have || (!have.snippet && item.snippet)) byUrl.set(item.url, item);
}
const duplicates = allItems.length - byUrl.size;
const items = [...byUrl.values()].sort((a, b) => b.published_at.localeCompare(a.published_at));

// --- Write files (shape-checked by zod, written atomically). ---
const count = (reason: Skipped['reason']) => allSkipped.filter((s) => s.reason === reason).length;
const health = HealthSchema.parse({
  stage: 1,
  run_at: now.toISOString(),
  total_items: items.length,
  feeds: rows,
  feeds_error: rows.filter((r) => r.status === 'ERROR').length,
  fallbacks_fired: rows.filter((r) => r.fallback_used).length,
  undecodable_links: count('undecodable_link'),
  not_ai: count('not_ai'),
  undated: count('undated'),
});
writeJsonAtomic(join(ROOT, 'data', 'items.json'), z.array(ItemSchema).parse(items));
writeJsonAtomic(join(ROOT, 'data', 'skipped_stage1.json'), z.array(SkippedSchema).parse(allSkipped));
writeJsonAtomic(join(ROOT, 'data', 'health_stage1.json'), health);

// --- Console report ---
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '-');
console.log(`\nStage 1 report (${now.toISOString()}${OFFLINE ? ', offline replay' : ''})\n`);
console.log(`${'Feed'.padEnd(42)}${'Status'.padEnd(8)}${'Items'.padStart(6)}  ${'Oldest'.padEnd(11)}${'Newest'.padEnd(11)}Fallback`);
for (const r of rows) {
  console.log(`${r.name.padEnd(42)}${r.status.padEnd(8)}${String(r.items).padStart(6)}  ${day(r.oldest).padEnd(11)}${day(r.newest).padEnd(11)}${r.fallback_used ? 'YES' : '-'}`);
}
const notes = rows.filter((r) => r.note);
if (notes.length) {
  console.log('\nNotes:');
  for (const r of notes) console.log(`  ${r.name}: ${r.note}`);
}
console.log(`\nItems written: ${items.length} (exact-URL duplicates removed: ${duplicates}, too old and not logged: ${tooOld})`);
console.log(`Feeds in ERROR: ${health.feeds_error}   Fallbacks fired: ${health.fallbacks_fired}`);
console.log(`Skipped: not_ai ${health.not_ai}, undated ${health.undated}, undecodable_link ${health.undecodable_links}`);
