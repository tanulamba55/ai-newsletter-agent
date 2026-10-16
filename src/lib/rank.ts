// Stage 3: rank the triage verdicts per category and pick the shortlist plus a "near miss" band.
// Pure code, no AI and no network. The review agent (pass 2) later looks at both lists.
import type { Candidate, Triage } from './schemas.ts';

export type Ranked = { candidate: Candidate; triage: Triage; merged?: Candidate[] }; // merged = other copies of the same story (same triage group)

export type RankOptions = {
  per_category: number; // shortlist size per category (4 means about 30 items for 8 categories)
  near_miss_min_score: number; // lowest score that can enter the near-miss band
  near_miss_max: number; // size of the near-miss band
};

// Join each verdict with its candidate (same id). Verdicts without a candidate are ignored.
export function join(candidates: Candidate[], verdicts: Triage[]): Ranked[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const out: Ranked[] = [];
  for (const t of verdicts) {
    const candidate = byId.get(t.id);
    if (candidate) out.push({ candidate, triage: t });
  }
  return out;
}

// Order: higher score first, then more outlets covering it, then official source, then newest.
export function compare(a: Ranked, b: Ranked): number {
  if (b.triage.score !== a.triage.score) return b.triage.score - a.triage.score;
  const outletsA = a.candidate.covered_by.length;
  const outletsB = b.candidate.covered_by.length;
  if (outletsB !== outletsA) return outletsB - outletsA;
  const officialA = a.candidate.outlet_type === 'official' ? 1 : 0;
  const officialB = b.candidate.outlet_type === 'official' ? 1 : 0;
  if (officialB !== officialA) return officialB - officialA;
  return b.candidate.published_at.localeCompare(a.candidate.published_at);
}

// Triage gave items of the same story one shared `group`. Keep only the best item of each group
// and note the other copies in `merged`, so the shortlist holds one entry per story, not one per outlet.
// (Slices cannot see each other, so the same story can still appear under two groups; the review agent merges those.)
export function collapseGroups(rows: Ranked[]): Ranked[] {
  const groups = new Map<string, Ranked[]>();
  for (const r of rows) groups.set(r.triage.group, [...(groups.get(r.triage.group) ?? []), r]);
  return [...groups.values()].map((members) => {
    const sorted = [...members].sort(compare);
    return { ...sorted[0], merged: sorted.slice(1).map((m) => m.candidate) };
  });
}

export function rank(allRows: Ranked[], opts: RankOptions): { shortlist: Ranked[]; near_miss: Ranked[] } {
  const rows = collapseGroups(allRows);
  const shortlist: Ranked[] = [];
  const rest: Ranked[] = [];

  // Kept items: top N per category go to the shortlist, the others wait for the near-miss band.
  const categories = [...new Set(rows.filter((r) => r.triage.keep).map((r) => r.triage.category))].sort((a, b) => a - b);
  for (const cat of categories) {
    const inCat = rows.filter((r) => r.triage.keep && r.triage.category === cat).sort(compare);
    shortlist.push(...inCat.slice(0, opts.per_category));
    rest.push(...inCat.slice(opts.per_category));
  }

  // Dropped items that scored just under the cutoff, and a real category fit (not "no category"), are rescue candidates.
  rest.push(...rows.filter((r) => !r.triage.keep && r.triage.score >= opts.near_miss_min_score && !/no category/i.test(r.triage.reason)));

  const near_miss = rest.sort(compare).slice(0, opts.near_miss_max);
  return { shortlist, near_miss };
}
