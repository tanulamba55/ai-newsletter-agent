// The shapes of our JSON files, checked with zod. JSON files are the contract between stages
// (see docs/SPEC.md). If a file does not match, zod throws and we know early.
import { z } from 'zod';

// One story candidate (items.json). Shape per docs/SPEC.md "Item".
export const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  outlet: z.string(),
  outlet_type: z.enum(['media', 'official']),
  published_at: z.string(), // ISO date, UTC
  snippet: z.string(), // may be empty
  region: z.literal('china').optional(),
  lane: z.string().optional(),
  category_hint: z.string().optional(),
  yc_match: z.object({ company: z.string(), batch: z.string() }).optional(),
});
export type Item = z.infer<typeof ItemSchema>;

// A dropped item with the reason (skipped_stage1.json). Reasons used in Stage 1 are listed here.
export const SkippedSchema = z.object({
  reason: z.enum(['undated', 'not_ai', 'undecodable_link']),
  title: z.string(),
  url: z.string(),
  feed: z.string(),
  published_at: z.string().optional(),
});
export type Skipped = z.infer<typeof SkippedSchema>;

// What Stage 1 reports per feed (inside health_stage1.json).
export const FeedHealthSchema = z.object({
  name: z.string(),
  status: z.enum(['OK', 'ERROR']),
  items: z.number(),
  oldest: z.string().nullable(),
  newest: z.string().nullable(),
  fallback_used: z.boolean(),
  note: z.string().optional(), // for example the error message, or "2 of 11 orgs failed"
});
export type FeedHealth = z.infer<typeof FeedHealthSchema>;

// Health guard file that Stage 3 reads (data/health_stage1.json).
export const HealthSchema = z.object({
  stage: z.literal(1),
  run_at: z.string(),
  total_items: z.number(),
  feeds: z.array(FeedHealthSchema),
  feeds_error: z.number(),
  fallbacks_fired: z.number(),
  undecodable_links: z.number(),
  not_ai: z.number(),
  undated: z.number(),
});
export type Health = z.infer<typeof HealthSchema>;

// One entry in config/feeds.json.
export const FeedConfigSchema = z.object({
  name: z.string(),
  type: z.enum(['media', 'official']),
  kind: z.enum(['rss', 'hf-models']).default('rss'),
  url: z.string().url().optional(), // rss feeds
  fallback_url: z.string().url().optional(), // tried once if url fails
  google_news_url: z.string().url().optional(), // extra Google News query merged in (feeds that cannot page)
  orgs: z.array(z.string()).optional(), // hf-models: Hugging Face organisations
  paging: z.enum(['paged', 'none-needed', 'google-news']).default('none-needed'),
  region: z.literal('china').optional(),
  lane: z.string().optional(),
  prefilter: z.boolean().default(false), // keep only items that look AI-related
});
export type FeedConfig = z.infer<typeof FeedConfigSchema>;

export const KeywordsSchema = z.object({
  case_sensitive: z.array(z.string()), // matched exactly, e.g. "AI"
  case_insensitive: z.array(z.string()), // matched ignoring case
});
export type Keywords = z.infer<typeof KeywordsSchema>;
