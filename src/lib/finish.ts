// Stage 3 finish: the code-only checks on what the summary agents wrote. No AI, no network.

import { SummarySchema } from './schemas.ts';
import type { Summary } from './schemas.ts';

// Check a summary agent's answer: valid shape, exactly one summary per story id.
export function checkSummaries(raw: unknown, inputIds: string[]): { rows: Summary[]; errors: string[] } {
  if (!Array.isArray(raw)) return { rows: [], errors: ['answer is not a JSON array'] };
  const errors: string[] = [];
  const rows: Summary[] = [];
  raw.forEach((r, i) => {
    const p = SummarySchema.safeParse(r);
    if (p.success) rows.push(p.data);
    else errors.push(`row ${i}: ${p.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
  });
  const got = rows.map((r) => r.id);
  const missing = inputIds.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !inputIds.includes(id));
  const twice = got.filter((id, i) => got.indexOf(id) !== i);
  if (missing.length) errors.push(`${missing.length} ids missing, for example ${missing.slice(0, 3).join(', ')}`);
  if (extra.length) errors.push(`${extra.length} ids not in the input, for example ${extra.slice(0, 3).join(', ')}`);
  if (twice.length) errors.push(`${twice.length} ids appear more than once`);
  return { rows, errors };
}

// Lowercase, keep only letters and digits (any language), so case, punctuation and spacing do not matter.
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// Is the quote really in the article text? Lenient: case, punctuation and spacing are ignored.
export function quoteFound(text: string, quote: string): boolean {
  const q = normalize(quote);
  return q.length >= 15 && normalize(text).includes(q); // a few words prove nothing
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isAggregator(url: string, hosts: string[]): boolean {
  const h = hostOf(url);
  return hosts.some((a) => h === a || h.endsWith(`.${a}`));
}

export type SourceRules = { aggregator_hosts: string[]; trusted_outlets: string[] };
export type SourceCheck = { ok: true; url: string; scoop: boolean } | { ok: false; why: string };

// Decide the story's source_url from what the agent proposed.
//  - "self" for an official item: its own address.
//  - "self" for a media item: allowed only as a scoop, and only for a trusted outlet.
//  - an address: must be one of the links found on the fetched page, and not an aggregator.
//  - null: no original source.
export function checkSource(proposed: string | null, item: { url: string; outlet: string; outlet_type: 'media' | 'official' }, links: string[], rules: SourceRules): SourceCheck {
  if (!proposed) return { ok: false, why: 'no original source link found' };
  if (proposed === 'self') {
    if (isAggregator(item.url, rules.aggregator_hosts)) return { ok: false, why: 'own address is an aggregator' };
    if (item.outlet_type === 'official') return { ok: true, url: item.url, scoop: false };
    if (rules.trusted_outlets.some((o) => o.toLowerCase() === item.outlet.toLowerCase())) return { ok: true, url: item.url, scoop: true };
    return { ok: false, why: `${item.outlet} is not a trusted outlet, so its own link is not accepted as original` };
  }
  if (!links.includes(proposed)) return { ok: false, why: 'address is not on the fetched page' };
  if (isAggregator(proposed, rules.aggregator_hosts)) return { ok: false, why: 'address is an aggregator' };
  return { ok: true, url: proposed, scoop: false };
}

// The story date is the earliest publish date of any copy of the story (when the news broke).
export function earliestDate(dates: string[]): string {
  return [...dates].filter((d) => !Number.isNaN(Date.parse(d))).sort()[0] ?? dates[0];
}
