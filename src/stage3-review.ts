// Stage 3, review (AI step, then code): the AI merges same-story items from different slices, fixes score drift and
// rescues near-misses; code checks the answer and applies it.
// Run:  npm run stage3:review            (flag: --use-saved = keep review.json if it is already there)
// Reads docs/prompts/stage3-review.md and data/stage3/shortlist.json. Writes review.json, selected.json (the stories that go
// on to page fetching and summaries) and dropped_review.json.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from './lib/files.ts';
import { readPrompt, reportUsage, runStep, setupLlm, USE_SAVED } from './lib/llmSetup.ts';
import { applyReview, checkReview } from './lib/review.ts';
import type { ShortItem } from './lib/review.ts';
import { CandidateSchema, Stage3ConfigSchema } from './lib/schemas.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'data', 'stage3');
const cfg = Stage3ConfigSchema.parse(JSON.parse(readFileSync(join(ROOT, 'config', 'stage3.json'), 'utf8')));

const ItemSchema = CandidateSchema.extend({ same_story: z.array(z.object({ id: z.string(), outlet: z.string(), title: z.string() })) });
const lists = z.object({ shortlist: z.array(ItemSchema), near_miss: z.array(ItemSchema) }).parse(JSON.parse(readFileSync(join(OUT, 'shortlist.json'), 'utf8')));
const items: ShortItem[] = [...lists.shortlist, ...lists.near_miss];

// The AI part: one call about the whole shortlist (skipped with --use-saved when review.json is already there).
const reviewFile = join(OUT, 'review.json');
const ids = items.map((i) => i.id);
if (!(USE_SAVED && existsSync(reviewFile))) {
  await runStep(async () => {
    const { llm } = setupLlm();
    console.log(`review: ${items.length} items`);
    const result = await llm.askJson('review', readPrompt('stage3-review.md'), readFileSync(join(OUT, 'shortlist.json'), 'utf8'), (raw) => checkReview(raw, ids));
    writeJsonAtomic(reviewFile, result.rows);
    reportUsage('review', 'shortlist', result);
  });
} else console.log('using saved review.json');

const check = checkReview(JSON.parse(readFileSync(reviewFile, 'utf8')), ids);
if (check.errors.length) {
  console.log(`Review answer has ${check.errors.length} problem(s):`);
  for (const e of check.errors.slice(0, 10)) console.log(`  - ${e}`);
  console.log('\nStopped: run npm run stage3:review again (without --use-saved).');
  process.exit(1);
}

const { selected, dropped } = applyReview(items, check.rows, cfg.stories_per_category);
writeJsonAtomic(join(OUT, 'selected.json'), selected);
writeJsonAtomic(join(OUT, 'dropped_review.json'), dropped.map((d) => ({ id: d.item.id, title: d.item.title, outlet: d.item.outlet, published_at: d.item.published_at, reason: d.reason })));

console.log(`Review: ${items.length} items in, ${selected.length} selected, ${dropped.length} dropped, ${check.rows.filter((r) => r.action === 'merge').length} merged into another story`);
for (const s of selected) console.log(`  cat ${s.category} score ${s.score} +${s.same_story.length} ${s.outlet} | ${s.title.slice(0, 70)}`);
console.log(`Written to ${OUT}`);
