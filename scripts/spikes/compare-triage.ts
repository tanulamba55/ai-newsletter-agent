// Throwaway check: how much does a new AI's triage agree with the saved Claude-agent triage?
// Run:  node scripts/spikes/compare-triage.ts            (all slices that exist in both places)
//       node scripts/spikes/compare-triage.ts 1          (slice 1 only)
// Compares data/stage3/triage_<n>.json (new) with data/demo-2026-10-15/stage3/triage_<n>.json (saved Claude run).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CandidateSchema, TriageSchema } from '../../src/lib/schemas.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const NEW = join(ROOT, 'data', 'stage3');
const OLD = join(ROOT, 'data', 'demo-2026-10-15', 'stage3');
const only = process.argv[2] ? [Number(process.argv[2])] : [1, 2, 3, 4];
const read = <T>(p: string, s: z.ZodType<T>) => s.parse(JSON.parse(readFileSync(p, 'utf8')));

let total = 0, sameKeep = 0, bothKept = 0, sameCat = 0, oldKept = 0, newKept = 0;
const diffs: string[] = [];
for (const n of only) {
  const a = join(NEW, `triage_${n}.json`);
  const b = join(OLD, `triage_${n}.json`);
  if (!existsSync(a) || !existsSync(b)) continue;
  const cands = new Map(read(join(NEW, `candidates_${n}.json`), z.array(CandidateSchema)).map((c) => [c.id, c]));
  const oldRows = new Map(read(b, z.array(TriageSchema)).map((r) => [r.id, r]));
  for (const r of read(a, z.array(TriageSchema))) {
    const o = oldRows.get(r.id);
    if (!o) continue;
    total++;
    if (o.keep) oldKept++;
    if (r.keep) newKept++;
    if (o.keep === r.keep) sameKeep++;
    if (o.keep && r.keep) {
      bothKept++;
      if (o.category === r.category) sameCat++;
    }
    if (o.keep !== r.keep || Math.abs(o.score - r.score) >= 3) diffs.push(`  score claude ${o.score} / new ${r.score}  keep ${o.keep}->${r.keep}  ${(cands.get(r.id)?.title ?? r.id).slice(0, 70)}`);
  }
}
if (!total) {
  console.log('Nothing to compare: need data/stage3/triage_<n>.json and the saved Claude copy.');
  process.exit(1);
}
const pct = (x: number, y: number) => (y ? `${Math.round((100 * x) / y)}%` : 'n/a');
console.log(`Items compared: ${total}`);
console.log(`Keep/drop agreement: ${sameKeep}/${total} (${pct(sameKeep, total)})   kept by Claude: ${oldKept}, kept by new: ${newKept}`);
console.log(`Category agreement on items both kept: ${sameCat}/${bothKept} (${pct(sameCat, bothKept)})`);
console.log(`Biggest disagreements (keep differs or scores 3+ apart), first 20 of ${diffs.length}:`);
for (const d of diffs.slice(0, 20)) console.log(d);
