// Lab model releases from the Hugging Face API (free, no key). Each new model repo becomes an Item.
// Catch: createdAt is when the repo was created, not always the public release date.
import { z } from 'zod';
import { checkWindow, parseDate } from './dates.ts';
import { cleanUrl, makeId } from './urls.ts';
import type { CollectResult, Deps } from './rss.ts';
import type { FeedConfig, Item } from './schemas.ts';

// Only the fields we use. If the API changes shape, zod fails and the org shows as an error.
const ModelListSchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.string().optional(),
    pipeline_tag: z.string().optional(),
    library_name: z.string().optional(),
  }),
);

export function apiUrl(org: string): string {
  return `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&sort=createdAt&direction=-1&limit=50`;
}

// Map one org's API answer (JSON text) to Items inside the 7-day window.
export function modelsToItems(json: string, org: string, feed: FeedConfig, now: Date): { items: Item[]; tooOld: number; undated: number } {
  const models = ModelListSchema.parse(JSON.parse(json));
  const items: Item[] = [];
  let tooOld = 0;
  let undated = 0;
  for (const m of models) {
    const date = parseDate(m.createdAt);
    if (!date) {
      undated++;
      continue;
    }
    if (checkWindow(date, now) !== 'ok') {
      tooOld++;
      continue;
    }
    const url = cleanUrl(`https://huggingface.co/${m.id}`);
    const item: Item = {
      id: makeId(url),
      title: m.id,
      url,
      outlet: `Hugging Face (${org})`,
      outlet_type: feed.type,
      published_at: date.toISOString(),
      snippet: [m.pipeline_tag, m.library_name].filter(Boolean).join(', '),
    };
    if (feed.region) item.region = feed.region;
    if (feed.lane) item.lane = feed.lane;
    items.push(item);
  }
  return { items, tooOld, undated };
}

// One feed entry in feeds.json lists several orgs. A failing org is named in the note;
// the feed is ERROR only if every org failed.
export async function collectHf(feed: FeedConfig, deps: Deps): Promise<CollectResult> {
  const orgs = feed.orgs ?? [];
  let items: Item[] = [];
  let tooOld = 0;
  const failed: string[] = [];
  let inARow = 0; // failures in a row: after 3 the API looks down, so we stop waiting on timeouts
  for (const org of orgs) {
    if (inARow >= 3) {
      failed.push(`${org} (not tried, API looks down)`);
      continue;
    }
    try {
      const r = modelsToItems(await deps.getText(apiUrl(org)), org, feed, deps.now);
      items = items.concat(r.items);
      tooOld += r.tooOld;
      inARow = 0;
    } catch (e) {
      inARow++;
      failed.push(`${org} (${(e as Error).message.slice(0, 60)})`);
    }
  }
  const status = orgs.length > 0 && failed.length === orgs.length ? 'ERROR' : 'OK';
  const note = failed.length ? `${failed.length} of ${orgs.length} orgs failed: ${failed.join(', ')}` : undefined;
  return { items, skipped: [], tooOld, fallbackUsed: false, status, note };
}
