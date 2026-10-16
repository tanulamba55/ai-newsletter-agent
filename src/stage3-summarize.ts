// Stage 3, summarize (AI step): write summary, why it matters, a supporting quote and the source link, from the page text only.
// Run:  npm run stage3:summarize         (flags: --only 2 = just part 2;  --use-saved = use summaries_<n>.json files already there;
//                                         --inputs-only = only write the input files, no AI call)
// Reads docs/prompts/stage3-summary.md, data/stage3/selected.json and articles.json.
// Writes data/stage3/summary_input_<n>.json (what the AI is shown) and summaries_<n>.json (its answers).
// The stories are dealt into 4 parts so each AI call stays small. One part at a time.
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { checkSummaries } from './lib/finish.ts';
import { writeJsonAtomic } from './lib/files.ts';
import { onlyNumber, readPrompt, reportUsage, runStep, S3, setupLlm, USE_SAVED } from './lib/llmSetup.ts';
import { CandidateSchema } from './lib/schemas.ts';

const PARTS = 4;

// --- Build what the AI is shown: story facts + article text + the links found on the page ---
const SelectedSchema = CandidateSchema.extend({ category: z.number(), same_story: z.array(z.object({ id: z.string(), outlet: z.string(), title: z.string() })) });
const selected = z.array(SelectedSchema).parse(JSON.parse(readFileSync(join(S3, 'selected.json'), 'utf8')));
const articles = z.array(z.object({ id: z.string(), via: z.string(), text: z.string(), links: z.array(z.string()) })).parse(JSON.parse(readFileSync(join(S3, 'articles.json'), 'utf8')));
const byId = new Map(articles.map((a) => [a.id, a]));

const stories = selected.map((s) => {
  const a = byId.get(s.id)!;
  return {
    id: s.id,
    title: s.title,
    outlet: s.outlet,
    outlet_type: s.outlet_type,
    category: s.category,
    published_at: s.published_at,
    text_from: a.via === 'snippet' ? 'snippet' : 'page',
    text: a.text,
    links: a.links,
    also_covered_by: [...s.covered_by.map((c) => c.outlet), ...s.same_story.map((m) => m.outlet)],
  };
});

// Old input files go; stories are dealt out in turn so each part has a mix.
for (const f of readdirSync(S3)) if (/^summary_input_\d+\.json$/.test(f)) unlinkSync(join(S3, f));
const parts: (typeof stories)[] = Array.from({ length: PARTS }, () => []);
stories.forEach((s, i) => parts[i % PARTS].push(s));
parts.forEach((p, i) => writeJsonAtomic(join(S3, `summary_input_${i + 1}.json`), p));

// --inputs-only: stop here. Used when another agent (for example Claude Code agents in a live demo) writes the summaries_<n>.json files.
if (process.argv.includes('--inputs-only')) {
  console.log(`Inputs written: data/stage3/summary_input_1..${PARTS}.json (${stories.length} stories). Write summaries_<n>.json for each, then: npm run stage3:summarize -- --use-saved  (or go straight to npm run stage3:finish)`);
  process.exit(0);
}

// --- Ask the AI, one part at a time ---
await runStep(async () => {
  const { llm } = setupLlm();
  const instructions = readPrompt('stage3-summary.md');
  const only = onlyNumber();
  for (const [i, part] of parts.entries()) {
    const n = i + 1;
    if ((only && only !== n) || part.length === 0) continue;
    const out = join(S3, `summaries_${n}.json`);
    if (USE_SAVED && existsSync(out)) {
      console.log(`part ${n}: using saved summaries_${n}.json`);
      continue;
    }
    console.log(`part ${n}: ${part.length} stories`);
    const ids = part.map((s) => s.id);
    const result = await llm.askJson('summary', instructions, JSON.stringify(part), (raw) => checkSummaries(raw, ids));
    writeJsonAtomic(out, result.rows);
    reportUsage('summary', `part ${n}`, result);
  }
  console.log('summaries done. Next: npm run stage3:finish');
});
