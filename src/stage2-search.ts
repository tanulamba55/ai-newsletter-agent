// Stage 2: fill the gaps the RSS feeds miss, using search and a few direct sources.
// Run:  node src/stage2-search.ts            (download live)
//       node src/stage2-search.ts --offline  (replay today's cached downloads, no network)
// Writes data/items_extra.json, data/skipped_stage2.json, data/health_stage2.json, data/cache/yc-companies.json
// and prints a table per lane and per provider.
// No AI and no paid service here. Rules: docs/SPEC.md and docs/specs/stage2-search.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { cacheDirFor, writeJsonAtomic } from './lib/files.ts';
import { collectGovernment } from './lib/government.ts';
import { makeMatcher } from './lib/prefilter.ts';
import { makeGetText } from './lib/rss.ts';
import { makeResolver } from './lib/resolveUrl.ts';
import { ItemSchema, KeywordsSchema, SearchConfigSchema, SkippedSchema, YcConfigSchema } from './lib/schemas.ts';
import { runSearches } from './lib/search.ts';
import { bothSearchProvidersFailed, combine, formatReport } from './lib/stage2.ts';
import { collectYc } from './lib/yc.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OFFLINE = process.argv.includes('--offline');
const now = new Date();

function readConfig<T>(name: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(join(ROOT, 'config', name), 'utf8')));
}

const searches = readConfig('searches.json', z.array(SearchConfigSchema));
const aggregators = readConfig('aggregators.json', z.object({ hosts: z.array(z.string()) })).hosts;
const ycConfig = readConfig('yc.json', YcConfigSchema);
const matcher = makeMatcher(readConfig('keywords.json', KeywordsSchema));

// Same download helper and Google link decoder as Stage 1 (shared cache of decoded links).
const getText = makeGetText({ cacheDir: cacheDirFor(ROOT, now), offline: OFFLINE });
const resolve = makeResolver({
  cacheFile: join(ROOT, 'data', 'cache', 'google-links.json'),
  fetchFn: OFFLINE ? () => Promise.reject(new Error('offline')) : undefined, // offline: saved answers only, never call Google
}).resolve;
const log = (msg: string) => console.log(msg);

// --- Run the three parts. A failing part is reported as ERROR; it never stops the others. ---
console.log(`Searching (${searches.length} queries, about a minute or more; Bing is asked politely, one query a second)...`);
const search = await runSearches(searches, { getText, resolve, now, aggregators, matcher, pauseMs: OFFLINE ? 0 : 1000, log });
console.log('YC launches and directory...');
const yc = await collectYc({ getText, now, config: ycConfig, matcher, pauseMs: OFFLINE ? 0 : 300, log }, join(ROOT, 'data', 'cache', 'yc-companies.json'));
console.log('Federal Register and EU Commission feed...');
const gov = await collectGovernment({ getText, now, matcher, log });

// --- Merge, check shapes with zod, write files atomically. ---
const parts = { search, yc, gov };
const combined = combine(parts, now);
writeJsonAtomic(join(ROOT, 'data', 'items_extra.json'), z.array(ItemSchema).parse(combined.items));
writeJsonAtomic(join(ROOT, 'data', 'skipped_stage2.json'), z.array(SkippedSchema).parse(combined.skipped));
writeJsonAtomic(join(ROOT, 'data', 'health_stage2.json'), combined.health);

for (const line of formatReport(parts, combined, { now, offline: OFFLINE })) console.log(line);
if (bothSearchProvidersFailed(combined.health)) process.exitCode = 1;
