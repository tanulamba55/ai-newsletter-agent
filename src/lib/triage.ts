// Checks the answer of one triage agent against the slice it was given.
// The agent must return exactly one valid verdict per input item: none missing, none extra, none twice.
import { TriageSchema } from './schemas.ts';
import type { Triage } from './schemas.ts';

export type TriageCheck = { rows: Triage[]; errors: string[] };

// `raw` is the parsed JSON from the agent. `inputIds` are the ids of the slice it was given.
export function checkTriage(raw: unknown, inputIds: string[]): TriageCheck {
  if (!Array.isArray(raw)) return { rows: [], errors: ['answer is not a JSON array'] };

  const errors: string[] = [];
  const rows: Triage[] = [];
  raw.forEach((r, i) => {
    const parsed = TriageSchema.safeParse(r);
    if (parsed.success) rows.push(parsed.data);
    else errors.push(`row ${i}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
  });

  // Count how often each id appears.
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  const wanted = new Set(inputIds);

  const missing = inputIds.filter((id) => !seen.has(id));
  const extra = [...seen.keys()].filter((id) => !wanted.has(id));
  const twice = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (missing.length) errors.push(`${missing.length} ids missing, for example ${missing.slice(0, 3).join(', ')}`);
  if (extra.length) errors.push(`${extra.length} ids not in the input, for example ${extra.slice(0, 3).join(', ')}`);
  if (twice.length) errors.push(`${twice.length} ids appear more than once, for example ${twice.slice(0, 3).join(', ')}`);

  return { rows, errors };
}
