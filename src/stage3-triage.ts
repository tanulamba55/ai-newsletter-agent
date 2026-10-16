// Stage 3, triage (AI step): score every candidate and pick a category.
// Run:  npm run stage3:triage            (flags: --only 3  = just slice 3;  --use-saved = use triage_<n>.json files already there)
// Reads docs/prompts/stage3-triage.md and data/stage3/candidates_<n>.json. Writes data/stage3/triage_<n>.json.
// One slice at a time (free AI tiers allow few requests a minute). Answers are saved, so after a failure the same
// command only asks the slices that are still missing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from './lib/files.ts';
import { onlyNumber, readPrompt, reportUsage, ROOT, runStep, S3, setupLlm, USE_SAVED } from './lib/llmSetup.ts';
import { CandidateSchema, Stage3ConfigSchema } from './lib/schemas.ts';
import { checkTriage } from './lib/triage.ts';

await runStep(async () => {
  const cfg3 = Stage3ConfigSchema.parse(JSON.parse(readFileSync(join(ROOT, 'config', 'stage3.json'), 'utf8')));
  const { llm } = setupLlm();
  const instructions = readPrompt('stage3-triage.md');
  const only = onlyNumber();

  for (let n = 1; n <= cfg3.slices; n++) {
    if (only && only !== n) continue;
    const out = join(S3, `triage_${n}.json`);
    const slice = z.array(CandidateSchema).parse(JSON.parse(readFileSync(join(S3, `candidates_${n}.json`), 'utf8')));
    if (USE_SAVED && existsSync(out)) {
      console.log(`slice ${n}: using saved ${out.split('/').pop()}`);
      continue;
    }
    console.log(`slice ${n}: ${slice.length} items`);
    const ids = slice.map((c) => c.id);
    const result = await llm.askJson('triage', instructions, JSON.stringify(slice), (raw) => checkTriage(raw, ids));
    writeJsonAtomic(out, result.rows);
    reportUsage('triage', `slice ${n}`, result);
  }
  console.log('triage done. Next: npm run stage3:rank');
});
