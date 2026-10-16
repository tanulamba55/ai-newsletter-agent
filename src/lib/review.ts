// Stage 3: check the review agent's answer and apply it to the shortlist. Pure code, no AI, no network.
import { ReviewSchema } from './schemas.ts';
import type { Candidate, Review } from './schemas.ts';

// An item as written to data/stage3/shortlist.json by stage3-rank.ts.
export type ShortItem = Candidate & { same_story: { id: string; outlet: string; title: string }[] };
// An item after the review: category and score are the reviewed ones.
export type Selected = ShortItem & { category: number; score: number; review_reason: string };

export type ReviewCheck = { rows: Review[]; errors: string[] };

// One valid verdict per input id; a merge must point at another item that is kept.
export function checkReview(raw: unknown, inputIds: string[]): ReviewCheck {
  if (!Array.isArray(raw)) return { rows: [], errors: ['answer is not a JSON array'] };
  const errors: string[] = [];
  const rows: Review[] = [];
  raw.forEach((r, i) => {
    const parsed = ReviewSchema.safeParse(r);
    if (parsed.success) rows.push(parsed.data);
    else errors.push(`row ${i}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
  });

  const wanted = new Set(inputIds);
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  const missing = inputIds.filter((id) => !seen.has(id));
  const extra = [...seen.keys()].filter((id) => !wanted.has(id));
  const twice = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (missing.length) errors.push(`${missing.length} ids missing, for example ${missing.slice(0, 3).join(', ')}`);
  if (extra.length) errors.push(`${extra.length} ids not in the input, for example ${extra.slice(0, 3).join(', ')}`);
  if (twice.length) errors.push(`${twice.length} ids appear more than once, for example ${twice.slice(0, 3).join(', ')}`);

  const keptIds = new Set(rows.filter((r) => r.action === 'keep').map((r) => r.id));
  for (const r of rows) {
    if (r.action !== 'merge') continue;
    if (!r.merge_into) errors.push(`${r.id}: merge without merge_into`);
    else if (!keptIds.has(r.merge_into)) errors.push(`${r.id}: merge_into ${r.merge_into} is not a kept item`);
  }
  return { rows, errors };
}

// Order inside a category: higher score, then more outlets, then official source, then newest.
function compare(a: Selected, b: Selected): number {
  if (b.score !== a.score) return b.score - a.score;
  const outlets = (x: Selected) => x.covered_by.length + x.same_story.length;
  if (outlets(b) !== outlets(a)) return outlets(b) - outlets(a);
  const official = (x: Selected) => (x.outlet_type === 'official' ? 1 : 0);
  if (official(b) !== official(a)) return official(b) - official(a);
  return b.published_at.localeCompare(a.published_at);
}

export function applyReview(items: ShortItem[], reviews: Review[], perCategory: number): { selected: Selected[]; dropped: { item: ShortItem; reason: string }[] } {
  const verdict = new Map(reviews.map((r) => [r.id, r]));
  const kept = new Map<string, Selected>();
  const dropped: { item: ShortItem; reason: string }[] = [];

  for (const item of items) {
    const v = verdict.get(item.id);
    if (!v) continue;
    if (v.action === 'keep') kept.set(item.id, { ...item, same_story: [...item.same_story], category: v.category, score: v.score, review_reason: v.reason });
    else if (v.action === 'drop') dropped.push({ item, reason: v.reason });
  }
  // Merged items become extra copies of their target (more outlets = more important).
  for (const item of items) {
    const v = verdict.get(item.id);
    if (v?.action !== 'merge' || !v.merge_into) continue;
    kept.get(v.merge_into)?.same_story.push({ id: item.id, outlet: item.outlet, title: item.title }, ...item.same_story);
  }

  // At most N stories per category, best first. The rest are dropped with a reason.
  const selected: Selected[] = [];
  const all = [...kept.values()];
  for (const cat of [...new Set(all.map((s) => s.category))].sort((a, b) => a - b)) {
    const inCat = all.filter((s) => s.category === cat).sort(compare);
    selected.push(...inCat.slice(0, perCategory));
    for (const over of inCat.slice(perCategory)) dropped.push({ item: over, reason: `over the ${perCategory} stories per category` });
  }
  return { selected, dropped };
}
