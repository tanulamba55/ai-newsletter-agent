// Stage 3 runner: runs all steps in order and stops at the first one that fails.
// Run:  npm run stage3                          (everything)
//       npm run stage3 -- --from review         (start at a later step; earlier results stay as they are)
//       npm run stage3 -- --use-saved           (AI steps keep answer files that already exist)
// Steps: prepare -> triage (AI) -> rank -> review (AI) -> fetch -> summarize (AI) -> finish
import { spawnSync } from 'node:child_process';

const STEPS = ['prepare', 'triage', 'rank', 'review', 'fetch', 'summarize', 'finish'];
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const from = fromIdx >= 0 ? args[fromIdx + 1] : STEPS[0];
if (!STEPS.includes(from)) {
  console.log(`Unknown step "${from}". Steps: ${STEPS.join(', ')}`);
  process.exit(1);
}
// Everything except --from <step> is handed to each step (for example --use-saved, --offline).
const pass = fromIdx < 0 ? args : [...args.slice(0, fromIdx), ...args.slice(fromIdx + 2)];

for (const step of STEPS.slice(STEPS.indexOf(from))) {
  console.log(`\n=== stage3: ${step} ===`);
  const run = spawnSync('node', [new URL(`./stage3-${step}.ts`, import.meta.url).pathname, ...pass], { stdio: 'inherit' });
  if (run.status !== 0) {
    console.log(`\nStopped at "${step}". Fix the problem, then continue with: npm run stage3 -- --from ${step}`);
    process.exit(run.status ?? 1);
  }
}
console.log('\nStage 3 done. Next: npm run stage4');
