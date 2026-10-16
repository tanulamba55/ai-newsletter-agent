// Stage 3, part 2: check the triage answers, rank per category, pick the shortlist and the near-miss band.
// Run:  node src/stage3-rank.ts
// Reads data/stage3/candidates_<n>.json and data/stage3/triage_<n>.json (saved from the triage agents).
// Writes data/stage3/shortlist.json (what the review agent reads) and data/stage3/dropped_triage.json
// (every item triage dropped, with its reason; Stage 3 finish turns this into the skip log). No AI, no network.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from './lib/files.ts';
import { join as joinRows, rank } from './lib/rank.ts';
import { CandidateSchema, Stage3ConfigSchema } from './lib/schemas.ts';
import type { Triage } from './lib/schemas.ts';
import { checkTriage } from './lib/triage.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'data', 'stage3');
const cfg = Stage3ConfigSchema.parse(JSON.parse(readFileSync(join(ROOT, 'config', 'stage3.json'), 'utf8')));

// --- Check every slice. A bad or missing slice is listed so it can be re-run alone. ---
const verdicts: Triage[] = [];
const candidates = [];
const badSlices: number[] = [];
for (let n = 1; n <= cfg.slices; n++) {
  const slice = z.array(CandidateSchema).parse(JSON.parse(readFileSync(join(OUT, `candidates_${n}.json`), 'utf8')));
  candidates.push(...slice);
  const file = join(OUT, `triage_${n}.json`);
  if (!existsSync(file)) {
    console.log(`Slice ${n}: triage_${n}.json is missing`);
    badSlices.push(n);
    continue;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`Slice ${n}: triage_${n}.json is not valid JSON (${(e as Error).message})`);
    badSlices.push(n);
    continue;
  }
  const check = checkTriage(raw, slice.map((c) => c.id));
  if (check.errors.length) {
    console.log(`Slice ${n}: ${check.errors.length} problem(s)`);
    for (const e of check.errors.slice(0, 5)) console.log(`  - ${e}`);
    badSlices.push(n);
    continue;
  }
  console.log(`Slice ${n}: OK, ${check.rows.length} verdicts`);
  verdicts.push(...check.rows);
}
if (badSlices.length) {
  console.log(`\nStopped: re-run triage for slice(s) ${badSlices.join(', ')} alone, then run this again.`);
  process.exit(1);
}

// --- Rank ---
const rows = joinRows(candidates, verdicts);
const { shortlist, near_miss } = rank(rows, { per_category: cfg.shortlist_per_category, near_miss_min_score: cfg.near_miss_min_score, near_miss_max: cfg.near_miss_max });

// What the review agent sees: the candidate fields plus the triage verdict.
const show = (r: (typeof shortlist)[number]) => ({ ...r.candidate, same_story: (r.merged ?? []).map((m) => ({ id: m.id, outlet: m.outlet, title: m.title })), triage: { keep: r.triage.keep, category: r.triage.category, score: r.triage.score, group: r.triage.group, reason: r.triage.reason } });
writeJsonAtomic(join(OUT, 'shortlist.json'), { shortlist: shortlist.map(show), near_miss: near_miss.map(show) });
writeJsonAtomic(
  join(OUT, 'dropped_triage.json'),
  rows.filter((r) => !r.triage.keep).map((r) => ({ id: r.candidate.id, title: r.candidate.title, outlet: r.candidate.outlet, published_at: r.candidate.published_at, score: r.triage.score, reason: r.triage.reason })),
);

// --- Report ---
const kept = rows.filter((r) => r.triage.keep);
console.log(`\nTriage: ${rows.length} items, ${kept.length} kept, ${rows.length - kept.length} dropped`);
const cats = [...new Set(kept.map((r) => r.triage.category))].sort((a, b) => a - b);
for (const c of cats) {
  console.log(`  category ${c}: ${kept.filter((r) => r.triage.category === c).length} kept, ${shortlist.filter((r) => r.triage.category === c).length} on the shortlist`);
}
console.log(`Shortlist: ${shortlist.length} items. Near-miss band: ${near_miss.length} items.`);
console.log(`Written to ${OUT}`);
