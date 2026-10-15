// Stage 3, code half 1: health guard, date filter, duplicates, item cap, sorting and slicing.
// No network and no AI. The triage step (independent agents) reads the files this produces.
// Rules: docs/specs/stage3-process.md (steps 0 to 2b) and docs/SPEC.md (Whole pipeline: health guard).
import { checkWindow } from './dates.ts';
import { clusterTitles } from './dedupe.ts';
import type { Candidate, Health, Health2, Item, Skipped, Stage3Config } from './schemas.ts';

// --- Step 0: health guard ---------------------------------------------------------------

// Returns the reasons to stop (empty list = go on). Missing health files count as a problem:
// we cannot tell whether Stages 1 and 2 worked.
export function checkHealth(h1: Health | null, h2: Health2 | null, totalItems: number, cfg: Stage3Config): string[] {
  const problems: string[] = [];
  if (!h1) problems.push('data/health_stage1.json is missing or unreadable (run Stage 1)');
  else if (h1.feeds_error > cfg.max_feeds_error) problems.push(`${h1.feeds_error} Stage 1 feeds are in ERROR (limit ${cfg.max_feeds_error})`);
  if (!h2) problems.push('data/health_stage2.json is missing or unreadable (run Stage 2)');
  else {
    const status = (name: string) => h2.providers.find((p) => p.name === name)?.status;
    if (status('Bing News') === 'ERROR' && status('Google News') === 'ERROR') problems.push('Bing and Google News both failed in Stage 2');
  }
  if (totalItems < cfg.min_items) problems.push(`only ${totalItems} items arrived from Stages 1 and 2 (minimum ${cfg.min_items})`);
  return problems;
}

// --- Steps 1 to 2b -------------------------------------------------------------------------

export type Funnel = {
  input: number; // items from Stages 1 and 2
  too_old: number; // counted, not logged
  in_date: number;
  duplicates_url: number; // same URL in both stages
  duplicates_title: number; // near-identical title (merged into the kept item's covered_by)
  over_item_cap: number;
  candidates: number;
};

export type Prepared = { candidates: Candidate[]; slices: Candidate[][]; skipped: Skipped[]; funnel: Funnel };

// Which copy of a story to keep: official source first, then one with a snippet, then the earliest.
const rank = (i: Item) => (i.outlet_type === 'official' ? 2 : 0) + (i.snippet ? 1 : 0);
function better(a: Item, b: Item): boolean {
  return rank(a) !== rank(b) ? rank(a) > rank(b) : a.published_at <= b.published_at;
}

const skip = (reason: Skipped['reason'], item: Item): Skipped => ({ reason, title: item.title, url: item.url, feed: item.outlet, published_at: item.published_at });

type Kept = { item: Item; covered_by: Candidate['covered_by'] };

// Merge `dup` into `keep`: remember where else the story ran (other outlets only).
function absorb(keep: Kept, dup: Kept): void {
  const seen = new Set(keep.covered_by.map((c) => c.url));
  for (const c of [{ outlet: dup.item.outlet, url: dup.item.url, published_at: dup.item.published_at }, ...dup.covered_by]) {
    if (c.url !== keep.item.url && !seen.has(c.url)) {
      keep.covered_by.push(c);
      seen.add(c.url);
    }
  }
}

export function prepare(items: Item[], cfg: Stage3Config, now: Date): Prepared {
  const skipped: Skipped[] = [];
  const funnel: Funnel = { input: items.length, too_old: 0, in_date: 0, duplicates_url: 0, duplicates_title: 0, over_item_cap: 0, candidates: 0 };

  // Step 1: date filter. Stages 1 and 2 already filtered, but a rerun later in the week may let items age out.
  const inDate: Item[] = [];
  for (const item of items) {
    const age = checkWindow(new Date(item.published_at), now);
    if (age === 'too_old') funnel.too_old++;
    else if (age === 'future') skipped.push({ ...skip('undated', item) });
    else inDate.push(item);
  }
  funnel.in_date = inDate.length;

  // Step 2a: same URL (found by both stages).
  const byUrl = new Map<string, Kept>();
  for (const item of inDate) {
    const have = byUrl.get(item.url);
    if (!have) {
      byUrl.set(item.url, { item, covered_by: [] });
      continue;
    }
    funnel.duplicates_url++;
    const dup: Kept = { item, covered_by: [] };
    if (better(item, have.item)) {
      absorb(dup, have);
      byUrl.set(item.url, dup);
      skipped.push(skip('duplicate', have.item));
    } else {
      skipped.push(skip('duplicate', item));
    }
  }

  // Step 2b: near-identical titles = the same story from another outlet. Keep the best copy and
  // remember the others (they count as extra coverage and give "other links" later).
  const unique = [...byUrl.values()];
  const same = clusterTitles(unique.map((k) => k.item.title), cfg.title_duplicate_similarity);
  const groups = new Map<number, Kept[]>();
  unique.forEach((k, i) => groups.set(same[i], [...(groups.get(same[i]) ?? []), k]));
  let kept: Kept[] = [];
  for (const group of groups.values()) {
    let best = group[0];
    for (const k of group.slice(1)) if (better(k.item, best.item)) best = k;
    for (const k of group) {
      if (k === best) continue;
      absorb(best, k);
      funnel.duplicates_title++;
      skipped.push(skip('duplicate', k.item));
    }
    kept.push(best);
  }

  // Step 2c: item cap. Official first, then newest. The rest are logged.
  if (kept.length > cfg.item_cap) {
    kept.sort((a, b) => (a.item.outlet_type === b.item.outlet_type ? b.item.published_at.localeCompare(a.item.published_at) : a.item.outlet_type === 'official' ? -1 : 1));
    for (const k of kept.slice(cfg.item_cap)) {
      funnel.over_item_cap++;
      skipped.push(skip('over_item_cap', k.item));
    }
    kept = kept.slice(0, cfg.item_cap);
  }

  // Step 3 prep: put similar titles next to each other (clusters), newest cluster first, so that
  // the same story lands in the same triage slice.
  const near = clusterTitles(kept.map((k) => k.item.title), cfg.cluster_similarity);
  const clusters = new Map<number, Kept[]>();
  kept.forEach((k, i) => clusters.set(near[i], [...(clusters.get(near[i]) ?? []), k]));
  const ordered = [...clusters.values()]
    .map((members) => members.sort((a, b) => b.item.published_at.localeCompare(a.item.published_at)))
    .sort((a, b) => b[0].item.published_at.localeCompare(a[0].item.published_at));

  const candidates: Candidate[] = [];
  ordered.forEach((members, number) => {
    for (const { item, covered_by } of members) {
      const c: Candidate = {
        id: item.id,
        title: item.title,
        outlet: item.outlet,
        outlet_type: item.outlet_type,
        published_at: item.published_at,
        snippet: item.snippet.length > cfg.snippet_chars ? item.snippet.slice(0, cfg.snippet_chars - 1).trimEnd() + '…' : item.snippet,
        cluster: number,
        covered_by,
      };
      if (item.lane) c.lane = item.lane;
      if (item.region) c.region = item.region;
      if (item.category_hint) c.category_hint = item.category_hint;
      if (item.yc_match) c.yc_match = item.yc_match;
      candidates.push(c);
    }
  });
  funnel.candidates = candidates.length;
  return { candidates, slices: toSlices(candidates, cfg.slices), skipped, funnel };
}

// Cut the ordered list into `count` slices of similar size. Cuts only fall between clusters,
// so one story is never split across two slices.
export function toSlices(candidates: Candidate[], count: number): Candidate[][] {
  const slices: Candidate[][] = [[]];
  // Each slice aims at an even share of what is left, so the last slice is not left with scraps.
  let target = Math.ceil(candidates.length / count);
  for (let i = 0; i < candidates.length; i++) {
    const current = slices[slices.length - 1];
    const startsNewCluster = i > 0 && candidates[i].cluster !== candidates[i - 1].cluster;
    if (current.length >= target && startsNewCluster && slices.length < count) {
      slices.push([]);
      target = Math.ceil((candidates.length - i) / (count - slices.length + 1));
    }
    slices[slices.length - 1].push(candidates[i]);
  }
  return slices.filter((s) => s.length > 0);
}
