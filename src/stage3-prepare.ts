// Stage 3, part 1: prepare the candidates for triage.
// Run:  node src/stage3-prepare.ts            (stops if Stages 1 and 2 look unhealthy)
//       node src/stage3-prepare.ts --force    (go on anyway; never use this in a scheduled run)
// Reads data/items.json, data/items_extra.json and the two health files.
// Writes data/stage3/candidates.json (everything), data/stage3/candidates_<n>.json (one file per
// independent triage slice) and data/stage3/skipped_prepare.json. No AI and no network.
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from './lib/files.ts';
import { checkHealth, prepare } from './lib/prepare.ts';
import { CandidateSchema, Health2Schema, HealthSchema, ItemSchema, SkippedSchema, Stage3ConfigSchema } from './lib/schemas.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'data');
const OUT = join(DATA, 'stage3');
const FORCE = process.argv.includes('--force');
const now = new Date();

// Read a JSON file and check its shape. Returns null if the file is missing or does not match.
function read<T>(path: string, schema: z.ZodType<T>): T | null {
  if (!existsSync(path)) return null;
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  return parsed.success ? parsed.data : null;
}

const cfg = Stage3ConfigSchema.parse(JSON.parse(readFileSync(join(ROOT, 'config', 'stage3.json'), 'utf8')));
const items1 = read(join(DATA, 'items.json'), z.array(ItemSchema)) ?? [];
const items2 = read(join(DATA, 'items_extra.json'), z.array(ItemSchema)) ?? [];
const all = [...items1, ...items2];

// --- Step 0: health guard ---
const problems = checkHealth(read(join(DATA, 'health_stage1.json'), HealthSchema), read(join(DATA, 'health_stage2.json'), Health2Schema), all.length, cfg);
if (problems.length) {
  console.log(`\nHealth guard: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
  if (!FORCE) {
    console.log('\nStopped before doing anything else. Fix the problem, or run with --force.');
    process.exit(1);
  }
  console.log('\n--force given: going on anyway.');
}

// --- Steps 1 to 2b ---
const result = prepare(all, cfg, now);

// A new run starts clean: remove every Stage 3 file of an older run so nothing stale is read by mistake
// (this includes saved AI answers, so --use-saved only ever reuses answers from the current run).
const STALE = /^(candidates(_\d+)?|triage_\d+|summaries_\d+|summary_input_\d+|shortlist|review|selected|articles|dropped_triage|dropped_review|ai-log)\.json$/;
if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (STALE.test(f)) unlinkSync(join(OUT, f));
writeJsonAtomic(join(OUT, 'candidates.json'), z.array(CandidateSchema).parse(result.candidates));
result.slices.forEach((slice, i) => writeJsonAtomic(join(OUT, `candidates_${i + 1}.json`), z.array(CandidateSchema).parse(slice)));
writeJsonAtomic(join(OUT, 'skipped_prepare.json'), z.array(SkippedSchema).parse(result.skipped));

// --- Console report ---
const f = result.funnel;
console.log(`\nStage 3 prepare (${now.toISOString()})\n`);
console.log(`Funnel: ${f.input} items (Stage 1: ${items1.length}, Stage 2: ${items2.length}) -> ${f.in_date} in date -> ${f.in_date - f.duplicates_url - f.duplicates_title} after dedupe -> ${f.candidates} candidates`);
console.log(`  too old (not logged): ${f.too_old}   same URL in both stages: ${f.duplicates_url}   near-identical title merged: ${f.duplicates_title}   over item cap: ${f.over_item_cap}`);
const multi = result.candidates.filter((c) => c.covered_by.length > 0).length;
console.log(`  candidates that also ran at other outlets: ${multi}`);
console.log(`Slices for triage: ${result.slices.map((s, i) => `candidates_${i + 1}.json (${s.length})`).join(', ')}`);
console.log(`Written to ${OUT}`);
