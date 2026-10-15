// The YC lane of Stage 2 (also used by the Stage 3 YC tagger, which reads the company cache this file writes).
//   1. YC launches: ycombinator.com/launches.json, last 7 days, AI-tagged only -> items for category 4.
//   2. YC company directory: api.ycombinator.com, recent batches only -> data/cache/yc-companies.json.
//   3. Hacker News "Launch HN" posts: backup, only used when the launches list fails (Q10).
// Both YC endpoints are unofficial and can change (Q10): zod checks every page and fails loudly.
import { z } from 'zod';
import { checkWindow, parseDate } from './dates.ts';
import { writeJsonAtomic } from './files.ts';
import { stripHtml } from './rss.ts';
import type { GetText } from './rss.ts';
import { cleanUrl, makeId } from './urls.ts';
import { CompaniesPageSchema, LaunchesPageSchema } from './schemas.ts';
import type { Item, ProviderHealth, Skipped, YcCompany, YcConfig } from './schemas.ts';

const LAUNCHES_URL = 'https://www.ycombinator.com/launches.json';
const COMPANIES_URL = 'https://api.ycombinator.com/v0.1/companies';
const MAX_LAUNCH_PAGES = 10; // 20 launches per page, about 3 pages cover a week
const MAX_DIRECTORY_PAGES = 150; // 25 companies per page, about 10 pages per batch
const SNIPPET_MAX = 400;

export type YcDeps = {
  getText: GetText;
  now: Date;
  config: YcConfig;
  matcher?: (text: string) => boolean; // AI keyword matcher: second chance for launches without an AI tag, and the filter for the Launch HN backup (no tags)
  pauseMs?: number; // pause between pages
  log?: (msg: string) => void;
};

export type YcResult = {
  items: Item[];
  skipped: Skipped[];
  tooOld: number; // counted, not logged
  providers: ProviderHealth[]; // one row per source used
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- 1. Launches ---------------------------------------------------------------------------

const hasAiTag = (tags: string[], aiTags: string[]) => tags.some((t) => aiTags.some((a) => a.toLowerCase() === t.toLowerCase()));

// One page of launches -> Items. A launch counts as AI if it has an AI tag OR the AI keyword matcher
// finds AI in its title or tagline (15 Oct 2026: clearly AI launches often carry no AI tag).
// Non-AI launches are logged as not_ai.
export function launchesToItems(page: z.infer<typeof LaunchesPageSchema>, config: YcConfig, now: Date, matcher?: (text: string) => boolean) {
  const items: Item[] = [];
  const skipped: Skipped[] = [];
  let tooOld = 0;
  let sawOld = false;
  for (const hit of page.hits) {
    const date = parseDate(hit.created_at);
    const url = cleanUrl(hit.search_path || `https://www.ycombinator.com/launches/${hit.slug}`);
    if (!date) {
      skipped.push({ reason: 'undated', title: hit.title, url, feed: 'YC launches' });
      continue;
    }
    const age = checkWindow(date, now);
    if (age === 'too_old') {
      tooOld++;
      sawOld = true;
      continue;
    }
    if (age === 'future') {
      skipped.push({ reason: 'undated', title: hit.title, url, feed: 'YC launches', published_at: date.toISOString() });
      continue;
    }
    if (!hasAiTag(hit.company.tags, config.ai_tags) && !matcher?.(`${hit.title} ${hit.tagline ?? ''}`)) {
      skipped.push({ reason: 'not_ai', title: hit.title, url, feed: 'YC launches', published_at: date.toISOString() });
      continue;
    }
    // Snippet: the one-line pitch, then where the company's own site is.
    const site = hit.company.url ? ` Company site: ${hit.company.url}` : '';
    const snippet = stripHtml(`${hit.tagline ?? ''}${site}`, SNIPPET_MAX);
    const item: Item = {
      id: makeId(url),
      title: hit.title,
      url, // the YC launch page (decided 14 Oct 2026); the company site is in the snippet
      outlet: 'YC Launches',
      outlet_type: 'official',
      published_at: date.toISOString(),
      snippet,
      lane: 'yc',
      category_hint: '4',
    };
    // yc_match: batch is written as YC writes it on the launch page (for example "Fall 2026").
    item.yc_match = { company: hit.company.name, batch: hit.company.batch ?? '' };
    items.push(item);
  }
  return { items, skipped, tooOld, sawOld };
}

// Read launch pages (page numbers start at 0) until a page reaches items older than 7 days.
export async function collectLaunches(deps: YcDeps) {
  const items: Item[] = [];
  const skipped: Skipped[] = [];
  let tooOld = 0;
  let pages = 0;
  for (let n = 0; n < MAX_LAUNCH_PAGES; n++) {
    if (n > 0) await pause(deps.pauseMs ?? 300);
    const page = LaunchesPageSchema.parse(JSON.parse(await deps.getText(n === 0 ? LAUNCHES_URL : `${LAUNCHES_URL}?page=${n}`)));
    pages++;
    const r = launchesToItems(page, deps.config, deps.now, deps.matcher);
    items.push(...r.items);
    skipped.push(...r.skipped);
    tooOld += r.tooOld;
    if (r.sawOld || n >= page.nbPages - 1) break;
  }
  return { items, skipped, tooOld, pages };
}

// --- 2. Company directory ------------------------------------------------------------------

// Read directory pages (newest batch first) until more than config.recent_batches different batches were seen.
// Returns only companies of the recent batches. Throws if a page is missing or not the expected shape,
// so a half-read directory is never saved.
export async function collectDirectory(deps: YcDeps) {
  const companies: YcCompany[] = [];
  const batches: string[] = []; // different batches, in the order they appear
  let pages = 0;
  for (let n = 1; n <= MAX_DIRECTORY_PAGES; n++) {
    if (n > 1) await pause(deps.pauseMs ?? 300);
    const page = CompaniesPageSchema.parse(JSON.parse(await deps.getText(`${COMPANIES_URL}?page=${n}`)));
    pages++;
    let reachedOld = false;
    for (const c of page.companies) {
      if (!batches.includes(c.batch)) batches.push(c.batch);
      if (batches.length > deps.config.recent_batches) {
        reachedOld = true;
        break;
      }
      companies.push({ name: c.name, batch: c.batch, website: c.website ?? null, tags: c.tags });
    }
    if (reachedOld || n >= page.totalPages) break;
  }
  return { companies, batches, pages };
}

// --- 3. Launch HN backup -------------------------------------------------------------------

const HnPageSchema = z.object({
  hits: z.array(z.object({ title: z.string().nullish(), url: z.string().nullish(), created_at: z.string(), objectID: z.string(), story_text: z.string().nullish() })),
});

// "Launch HN: Consus (YC F24) – LLM gateway ..." -> company and batch. Other posts (Show HN, ...) give null.
export function parseLaunchHnTitle(title: string): { company: string; batch: string } | null {
  const m = title.match(/^Launch HN: (.+?) \(YC ([A-Z]\d{2})\)/);
  return m ? { company: m[1].trim(), batch: m[2] } : null;
}

export function launchHnToItems(json: unknown, deps: Pick<YcDeps, 'now' | 'matcher'>) {
  const page = HnPageSchema.parse(json);
  const items: Item[] = [];
  const skipped: Skipped[] = [];
  let tooOld = 0;
  for (const hit of page.hits) {
    const title = hit.title ?? '';
    const yc = parseLaunchHnTitle(title); // the search also returns Show HN and other posts: only real Launch HN count
    if (!yc) continue;
    const date = parseDate(hit.created_at);
    const url = cleanUrl(hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`);
    if (!date) {
      skipped.push({ reason: 'undated', title, url, feed: 'Hacker News' });
      continue;
    }
    if (checkWindow(date, deps.now) !== 'ok') {
      tooOld++;
      continue;
    }
    const snippet = stripHtml(hit.story_text ?? '', SNIPPET_MAX);
    if (deps.matcher && !deps.matcher(`${title} ${snippet}`)) {
      skipped.push({ reason: 'not_ai', title, url, feed: 'Hacker News', published_at: date.toISOString() });
      continue;
    }
    items.push({
      id: makeId(url),
      title,
      url,
      outlet: 'Hacker News',
      outlet_type: 'media',
      published_at: date.toISOString(),
      snippet,
      lane: 'yc',
      category_hint: '4',
      yc_match: yc,
    });
  }
  return { items, skipped, tooOld };
}

export function launchHnUrl(now: Date): string {
  const since = Math.floor(now.getTime() / 1000) - 7 * 24 * 3600;
  // numericFilters must be URL-encoded (created_at_i%3E<unix time>); an unencoded ">" gives HTTP 400.
  return `https://hn.algolia.com/api/v1/search_by_date?query=Launch%20HN&tags=story&numericFilters=created_at_i%3E${since}&hitsPerPage=50`;
}

// --- The whole lane --------------------------------------------------------------------------

// Runs launches (backup: Launch HN) and the directory. One failing part never stops the others.
// cacheFile: where to save the company list (data/cache/yc-companies.json). Left untouched if the directory fails.
export async function collectYc(deps: YcDeps, cacheFile?: string): Promise<YcResult> {
  const result: YcResult = { items: [], skipped: [], tooOld: 0, providers: [] };
  const err = (e: unknown) => (e instanceof z.ZodError ? `unexpected shape: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : (e as Error).message);

  let launchesOk = false;
  try {
    const r = await collectLaunches(deps);
    result.items.push(...r.items);
    result.skipped.push(...r.skipped);
    result.tooOld += r.tooOld;
    result.providers.push({ name: 'YC launches', status: 'OK', queries: r.pages, items: r.items.length });
    launchesOk = true;
  } catch (e) {
    result.providers.push({ name: 'YC launches', status: 'ERROR', queries: 1, items: 0, note: err(e) });
  }

  if (!launchesOk) {
    try {
      const r = launchHnToItems(JSON.parse(await deps.getText(launchHnUrl(deps.now))), deps);
      result.items.push(...r.items);
      result.skipped.push(...r.skipped);
      result.tooOld += r.tooOld;
      result.providers.push({ name: 'Hacker News', status: 'OK', queries: 1, items: r.items.length, note: 'backup for the YC launches list' });
    } catch (e) {
      result.providers.push({ name: 'Hacker News', status: 'ERROR', queries: 1, items: 0, note: err(e) });
    }
  } else {
    result.providers.push({ name: 'Hacker News', status: 'OK', queries: 0, items: 0, note: 'not needed' });
  }

  try {
    const d = await collectDirectory(deps);
    if (cacheFile) writeJsonAtomic(cacheFile, d.companies);
    result.providers.push({ name: 'YC directory', status: 'OK', queries: d.pages, items: d.companies.length, note: `${d.batches.slice(0, deps.config.recent_batches).length} recent batches` });
  } catch (e) {
    result.providers.push({ name: 'YC directory', status: 'ERROR', queries: 1, items: 0, note: err(e) });
  }
  return result;
}
