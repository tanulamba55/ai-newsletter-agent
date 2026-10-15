// Stage 2 glue that needs no network: merge the three parts (search, YC, government), build the
// health file, and format the console report. The main script (src/stage2-search.ts) only reads
// config, runs the parts and writes files, so this file can be tested with fake data.
import { Health2Schema } from './schemas.ts';
import type { Health2, Item, ProviderHealth, Skipped } from './schemas.ts';
import type { SearchRun } from './search.ts';
import type { YcResult } from './yc.ts';
import type { GovResult } from './government.ts';

export type Parts = { search: SearchRun; yc: YcResult; gov: GovResult };

export type Combined = {
  items: Item[];
  skipped: Skipped[];
  duplicates: number; // same URL found by two lanes (counted, not logged)
  tooOld: number; // counted, not logged
  health: Health2;
};

// Merge everything into one list. The same URL from two lanes is one item; the copy with a snippet wins,
// and on a tie the more specific lane (YC, government) wins over a news search, so yc_match and hints are kept.
export function combine(parts: Parts, now: Date): Combined {
  const byUrl = new Map<string, Item>();
  let duplicates = 0;
  for (const item of [...parts.yc.items, ...parts.gov.items, ...parts.search.items]) {
    const have = byUrl.get(item.url);
    if (!have) byUrl.set(item.url, item);
    else {
      duplicates++;
      if (!have.snippet && item.snippet) byUrl.set(item.url, item);
    }
  }
  const items = [...byUrl.values()].sort((a, b) => b.published_at.localeCompare(a.published_at));
  const skipped = [...parts.search.skipped, ...parts.yc.skipped, ...parts.gov.skipped];
  const providers: ProviderHealth[] = [...parts.search.providers, ...parts.yc.providers, ...parts.gov.providers];
  const hnBackupUsed = parts.yc.providers.some((p) => p.name === 'Hacker News' && p.queries > 0);
  const health = Health2Schema.parse({
    stage: 2,
    run_at: now.toISOString(),
    total_items: items.length,
    providers,
    providers_error: providers.filter((p) => p.status === 'ERROR').length,
    fallbacks_fired: parts.search.fallbacksFired + (hnBackupUsed ? 1 : 0), // Google backup queries, plus Launch HN if it ran
    undecodable_links: parts.search.undecodable,
  });
  return { items, skipped, duplicates, tooOld: parts.search.tooOld + parts.yc.tooOld + parts.gov.tooOld, health };
}

// SPEC.md Whole pipeline: Stage 3 stops if both Bing and Google News failed. Say so loudly here too.
export function bothSearchProvidersFailed(health: Health2): boolean {
  const status = (name: string) => health.providers.find((p) => p.name === name)?.status;
  return status('Bing News') === 'ERROR' && status('Google News') === 'ERROR';
}

// The console report: items per lane, then one row per provider, then totals.
export function formatReport(parts: Parts, c: Combined, opts: { now: Date; offline: boolean }): string[] {
  const lines: string[] = [];
  lines.push(`\nStage 2 report (${opts.now.toISOString()}${opts.offline ? ', offline replay' : ''})\n`);

  // Items per lane (before the merge across lanes).
  const lanes = new Map<string, { queries: number; items: number }>();
  const add = (lane: string, queries: number, items: number) => {
    const row = lanes.get(lane) ?? { queries: 0, items: 0 };
    lanes.set(lane, { queries: row.queries + queries, items: row.items + items });
  };
  for (const q of parts.search.perQuery) add(q.lane, 1, q.items);
  add('yc (launches / Launch HN)', parts.yc.providers.filter((p) => p.name !== 'YC directory').reduce((n, p) => n + p.queries, 0), parts.yc.items.length);
  add('government (Fed. Register, EU)', parts.gov.providers.length, parts.gov.items.length);
  lines.push(`${'Lane'.padEnd(34)}${'Requests'.padStart(9)}${'Items'.padStart(7)}`);
  for (const [lane, row] of lanes) lines.push(`${lane.padEnd(34)}${String(row.queries).padStart(9)}${String(row.items).padStart(7)}`);

  lines.push(`\n${'Provider'.padEnd(22)}${'Status'.padEnd(8)}${'Requests'.padStart(9)}${'Items'.padStart(7)}  Note`);
  for (const p of c.health.providers) lines.push(`${p.name.padEnd(22)}${p.status.padEnd(8)}${String(p.queries).padStart(9)}${String(p.items).padStart(7)}  ${p.note ?? ''}`);

  const count = (reason: Skipped['reason']) => c.skipped.filter((s) => s.reason === reason).length;
  lines.push(`\nItems written: ${c.items.length} (same URL from two lanes: ${c.duplicates}, too old and not logged: ${c.tooOld})`);
  lines.push(`Providers in ERROR: ${c.health.providers_error}   Fallbacks fired: ${c.health.fallbacks_fired}   Undecodable links: ${c.health.undecodable_links}`);
  lines.push(`Skipped: not_ai ${count('not_ai')}, aggregator ${count('aggregator')}, undated ${count('undated')}, undecodable_link ${count('undecodable_link')}`);
  if (bothSearchProvidersFailed(c.health)) lines.push('\n*** WARNING: Bing and Google News BOTH failed. Stage 3 will refuse to run without --force. ***');
  return lines;
}
