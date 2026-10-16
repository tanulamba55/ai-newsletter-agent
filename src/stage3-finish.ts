// Stage 3, last part: check the summaries and write the final files.
// Run:  node src/stage3-finish.ts             (add --offline to skip the "is the source link reachable" check)
// Reads data/stage3/selected.json, articles.json, summaries_<n>.json and the drop lists of the earlier parts.
// Checks per story: summary shape (zod), quote found in the article, original source (rules in config/source_rules.json),
// source link reachable. Writes data/stories.json and data/skipped.json (all stages' drops merged). No AI.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { checkSource, earliestDate, isAggregator, quoteFound } from './lib/finish.ts';
import { writeJsonAtomic } from './lib/files.ts';
import { CandidateSchema, ItemSchema, SkippedSchema, SourceRulesSchema, StorySchema, SummarySchema } from './lib/schemas.ts';
import type { Skipped, Story } from './lib/schemas.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'data');
const S3 = join(DATA, 'stage3');
const OFFLINE = process.argv.includes('--offline');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

const rules = SourceRulesSchema.parse(readJson(join(ROOT, 'config', 'source_rules.json')));
const SelectedSchema = CandidateSchema.extend({ category: z.number(), same_story: z.array(z.object({ id: z.string(), outlet: z.string(), title: z.string() })) });
const selected = z.array(SelectedSchema).parse(readJson(join(S3, 'selected.json')));
const articles = new Map(z.array(z.object({ id: z.string(), via: z.string(), text: z.string(), links: z.array(z.string()) })).parse(readJson(join(S3, 'articles.json'))).map((a) => [a.id, a]));

// id -> full item (web address, date) from both stages.
const items = new Map<string, z.infer<typeof ItemSchema>>();
for (const f of ['items.json', 'items_extra.json']) if (existsSync(join(DATA, f))) for (const it of z.array(ItemSchema).parse(readJson(join(DATA, f)))) items.set(it.id, it);

// All summaries from the agents. Bad shapes are logged, not fatal.
const summaries = new Map<string, z.infer<typeof SummarySchema>>();
const problems: string[] = [];
for (let n = 1; existsSync(join(S3, `summaries_${n}.json`)); n++) {
  const raw = readJson(join(S3, `summaries_${n}.json`));
  for (const r of Array.isArray(raw) ? raw : []) {
    const p = SummarySchema.safeParse(r);
    if (p.success) summaries.set(p.data.id, p.data);
    else problems.push(`summaries_${n}.json: ${p.error.issues[0]?.path.join('.')} ${p.error.issues[0]?.message}`);
  }
}

// A link counts as reachable unless it is gone (404/410) or does not answer.
async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36' } });
    return res.status !== 404 && res.status !== 410 && res.status < 500;
  } catch {
    return false;
  }
}

const skipLog: Skipped[] = [];
const skip = (reason: Skipped['reason'], s: { id: string; title: string; outlet: string; published_at: string }, why: string) => {
  const it = items.get(s.id);
  skipLog.push({ reason, title: s.title, url: it?.url ?? '', feed: `${s.outlet} (${why})`, published_at: s.published_at });
};

const stories: Story[] = [];
for (const s of selected) {
  const sum = summaries.get(s.id);
  const item = items.get(s.id);
  const art = articles.get(s.id);
  if (!sum || !item || !art) {
    problems.push(`${s.id}: no summary, item or article`);
    continue;
  }
  if (sum.skip) {
    skip('minor', s, `summary agent skipped: ${sum.note}`);
    continue;
  }
  if (!quoteFound(art.text, sum.quote)) {
    skip('quote_not_found', s, 'quote not in the article text');
    continue;
  }
  const src = checkSource(sum.source_url, item, art.links, rules);
  if (!src.ok) {
    skip('no_original_source', s, src.why);
    continue;
  }
  if (!OFFLINE && src.url !== item.url && !(await reachable(src.url))) {
    skip('no_original_source', s, `source link not reachable: ${src.url}`);
    continue;
  }

  // Other coverage (other outlets), no aggregators, not the source itself, at most 3.
  const others = [...s.covered_by.map((c) => c.url), ...s.same_story.map((m) => items.get(m.id)?.url ?? '')].filter((u) => u && u !== src.url && !isAggregator(u, rules.aggregator_hosts));
  const other_links = [...new Set([...(src.url !== item.url ? [item.url] : []), ...others])].slice(0, 3);
  const dates = [s.published_at, ...s.covered_by.map((c) => c.published_at), ...s.same_story.map((m) => items.get(m.id)?.published_at ?? '')].filter(Boolean);

  stories.push(StorySchema.parse({
    title: sum.title,
    category: s.category,
    summary: sum.summary,
    why_it_matters: sum.why_it_matters,
    source_url: src.url,
    other_links: other_links.length ? other_links : undefined,
    date: earliestDate(dates),
  }));
}
stories.sort((a, b) => (a.category === 9 ? 8 : a.category) - (b.category === 9 ? 8 : b.category)); // order 1-7, then 9
writeJsonAtomic(join(DATA, 'stories.json'), stories);

// --- Skip log: this stage's drops plus the earlier parts and stages ---
const reasonFor = (score: number): Skipped['reason'] => (score <= 2 ? 'not_ai' : 'minor');
const fromIds = (rows: { id: string; title: string; outlet: string; published_at: string }[], reason: (r: never) => Skipped['reason'], why: (r: never) => string) =>
  rows.forEach((r) => skipLog.push({ reason: reason(r as never), title: r.title, url: items.get(r.id)?.url ?? '', feed: `${r.outlet} (${why(r as never)})`, published_at: r.published_at }));
const triageDrops = existsSync(join(S3, 'dropped_triage.json')) ? (readJson(join(S3, 'dropped_triage.json')) as { id: string; title: string; outlet: string; published_at: string; score: number; reason: string }[]) : [];
fromIds(triageDrops, (r: { score: number }) => reasonFor(r.score), (r: { reason: string }) => `triage: ${r.reason}`);
const reviewDrops = existsSync(join(S3, 'dropped_review.json')) ? (readJson(join(S3, 'dropped_review.json')) as { id: string; title: string; outlet: string; published_at: string; reason: string }[]) : [];
fromIds(reviewDrops, (r: { reason: string }) => (/over the \d+ stories/.test(r.reason) ? 'over_category_cap' : 'minor'), (r: { reason: string }) => `review: ${r.reason}`);
const reviewRows = existsSync(join(S3, 'review.json')) ? (readJson(join(S3, 'review.json')) as { id: string; action: string; merge_into: string | null }[]) : [];
for (const r of reviewRows.filter((x) => x.action === 'merge')) {
  const it = items.get(r.id);
  if (it) skipLog.push({ reason: 'duplicate', title: it.title, url: it.url, feed: `${it.outlet} (same story as ${r.merge_into})`, published_at: it.published_at });
}
const earlier: Skipped[] = [];
for (const f of ['skipped_stage1.json', join('stage3', 'skipped_prepare.json'), 'skipped_stage2.json']) if (existsSync(join(DATA, f))) earlier.push(...z.array(SkippedSchema).parse(readJson(join(DATA, f))));
writeJsonAtomic(join(DATA, 'skipped.json'), z.array(SkippedSchema).parse([...skipLog, ...earlier]));

// --- Report ---
const mine = skipLog.filter((x) => x.reason === 'quote_not_found' || x.reason === 'no_original_source');
console.log(`Stories written: ${stories.length} of ${selected.length} selected`);
for (const c of [1, 2, 3, 4, 5, 6, 7, 9]) console.log(`  category ${c}: ${stories.filter((s) => s.category === c).length}`);
console.log(`Dropped at this step: ${mine.length + skipLog.filter((x) => x.feed.includes('summary agent skipped')).length}`);
for (const x of skipLog.filter((x) => x.reason === 'quote_not_found' || x.reason === 'no_original_source' || x.feed.includes('summary agent skipped'))) console.log(`  ${x.reason}: ${x.title.slice(0, 55)}  [${x.feed.slice(0, 110)}]`);
if (problems.length) {
  console.log(`Problems (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);
}
console.log(`skipped.json: ${skipLog.length + earlier.length} entries (${skipLog.length} from Stage 3, ${earlier.length} from earlier steps)`);
