// The government part of the Stage 2 topic lane (category 3, regulation and policy).
// Two official sources are read directly instead of through news search:
//   1. Federal Register API (US rules, notices, presidential documents)
//   2. European Commission digital-strategy RSS
// A search for "artificial intelligence" in the Federal Register matches the full text of every
// document, so most hits are unrelated (14 Oct 2026: a patent investigation, a crypto rule, ...).
// Therefore an item is kept only if its TITLE matches the AI keywords (config/keywords.json).
import Parser from 'rss-parser';
import { z } from 'zod';
import { checkWindow, parseDate } from './dates.ts';
import { stripHtml } from './rss.ts';
import type { GetText } from './rss.ts';
import { cleanUrl, makeId } from './urls.ts';
import { FederalRegisterSchema } from './schemas.ts';
import type { Item, ProviderHealth, Skipped } from './schemas.ts';

const SNIPPET_MAX = 400;
const EU_URL = 'https://digital-strategy.ec.europa.eu/en/rss.xml';

export type GovDeps = {
  getText: GetText;
  now: Date;
  matcher: (text: string) => boolean; // AI keyword matcher
  log?: (msg: string) => void;
};

export type GovResult = { items: Item[]; skipped: Skipped[]; tooOld: number; providers: ProviderHealth[] };

type Parts = { items: Item[]; skipped: Skipped[]; tooOld: number };

// Shared rule: keep an item if the title matches the AI keywords, else log it as not_ai.
function keepOrLog(parts: Parts, item: Item, feed: string, deps: GovDeps): void {
  if (deps.matcher(item.title)) parts.items.push(item);
  else parts.skipped.push({ reason: 'not_ai', title: item.title, url: item.url, feed, published_at: item.published_at });
}

// --- Federal Register ----------------------------------------------------------------------

export function federalRegisterUrl(now: Date): string {
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
  return `https://www.federalregister.gov/api/v1/documents.json?conditions[term]=%22artificial+intelligence%22&conditions[publication_date][gte]=${since}&per_page=100&order=newest`;
}

export function federalRegisterToItems(json: unknown, deps: GovDeps): Parts {
  const parts: Parts = { items: [], skipped: [], tooOld: 0 };
  for (const doc of FederalRegisterSchema.parse(json).results) {
    const date = parseDate(doc.publication_date);
    const url = cleanUrl(doc.html_url);
    const title = stripHtml(doc.title, 500);
    if (!date) {
      parts.skipped.push({ reason: 'undated', title, url, feed: 'Federal Register' });
      continue;
    }
    if (checkWindow(date, deps.now) === 'too_old') {
      parts.tooOld++;
      continue;
    }
    keepOrLog(parts, {
      id: makeId(url),
      title,
      url, // the government page is the original source for category 3
      outlet: 'Federal Register',
      outlet_type: 'official',
      published_at: date.toISOString(), // the Register gives a day, not a time
      snippet: stripHtml(doc.abstract ?? '', SNIPPET_MAX),
      lane: 'topic',
      category_hint: '3',
    }, 'Federal Register', deps);
  }
  return parts;
}

// --- EU Commission feed --------------------------------------------------------------------

const parser = new Parser({ customFields: { item: ['description'] } });

// The EU description is the whole page as HTML. Its short teaser sentence is the useful part.
export function euSnippet(description: string): string {
  const teaser = description.match(/<p class="[^"]*description[^"]*">([\s\S]*?)<\/p>/);
  return stripHtml(teaser ? teaser[1] : '', SNIPPET_MAX);
}

export async function euFeedToItems(xml: string, deps: GovDeps): Promise<Parts> {
  const parts: Parts = { items: [], skipped: [], tooOld: 0 };
  for (const e of (await parser.parseString(xml)).items) {
    const title = stripHtml(e.title, 500);
    if (!title || !e.link) continue;
    const url = cleanUrl(e.link);
    const date = parseDate(e.isoDate) ?? parseDate(e.pubDate);
    if (!date) {
      parts.skipped.push({ reason: 'undated', title, url, feed: 'EU Commission' });
      continue;
    }
    if (checkWindow(date, deps.now) === 'too_old') {
      parts.tooOld++;
      continue;
    }
    keepOrLog(parts, {
      id: makeId(url),
      title,
      url,
      outlet: 'European Commission',
      outlet_type: 'official',
      published_at: date.toISOString(),
      snippet: euSnippet((e as { description?: string }).description ?? ''),
      lane: 'topic',
      category_hint: '3',
    }, 'EU Commission', deps);
  }
  return parts;
}

// --- Both sources ----------------------------------------------------------------------------

// One failing source never stops the other.
export async function collectGovernment(deps: GovDeps): Promise<GovResult> {
  const result: GovResult = { items: [], skipped: [], tooOld: 0, providers: [] };
  const err = (e: unknown) => (e instanceof z.ZodError ? `unexpected shape: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : (e as Error).message);
  const sources: { name: string; read: () => Promise<Parts> }[] = [
    { name: 'Federal Register', read: async () => federalRegisterToItems(JSON.parse(await deps.getText(federalRegisterUrl(deps.now))), deps) },
    { name: 'EU Commission feed', read: async () => euFeedToItems(await deps.getText(EU_URL), deps) },
  ];
  for (const s of sources) {
    try {
      const p = await s.read();
      result.items.push(...p.items);
      result.skipped.push(...p.skipped);
      result.tooOld += p.tooOld;
      result.providers.push({ name: s.name, status: 'OK', queries: 1, items: p.items.length });
    } catch (e) {
      result.providers.push({ name: s.name, status: 'ERROR', queries: 1, items: 0, note: err(e) });
    }
  }
  return result;
}

export const euFeedUrl = EU_URL;
