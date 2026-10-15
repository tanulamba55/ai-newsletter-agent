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

// A dropped item with the reason (skipped_stage1.json, skipped_stage2.json).
// Reasons used in Stages 1 and 2 are listed here; the full list lives in docs/SPEC.md.
export const SkippedSchema = z.object({
  reason: z.enum(['undated', 'not_ai', 'undecodable_link', 'aggregator', 'too_old', 'duplicate', 'minor', 'over_category_cap', 'no_original_source', 'fetch_failed', 'quote_not_found', 'over_item_cap']),
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

// --- Stage 3 ---

// config/stage3.json
export const Stage3ConfigSchema = z.object({
  min_items: z.number(), // health guard: stop if fewer items than this arrive from Stages 1 and 2
  max_feeds_error: z.number(), // health guard: stop if more Stage 1 feeds than this are in ERROR
  item_cap: z.number(), // most candidates sent to triage; the rest are logged over_item_cap
  slices: z.number(), // triage is split into this many independent slices
  snippet_chars: z.number(), // snippet length shown to triage
  title_duplicate_similarity: z.number(), // titles at least this similar (0-1) are the same story
  cluster_similarity: z.number(), // titles at least this similar are placed next to each other
});
export type Stage3Config = z.infer<typeof Stage3ConfigSchema>;

// One candidate for triage (data/stage3/candidates.json): an Item, shortened, plus what the merge learned.
export const CandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  outlet: z.string(),
  outlet_type: z.enum(['media', 'official']),
  published_at: z.string(),
  snippet: z.string(),
  lane: z.string().optional(),
  region: z.literal('china').optional(),
  category_hint: z.string().optional(), // advice from Stage 2, not binding
  yc_match: z.object({ company: z.string(), batch: z.string() }).optional(),
  cluster: z.number(), // items with the same cluster number have similar titles (probably the same story)
  covered_by: z.array(z.object({ outlet: z.string(), url: z.string(), published_at: z.string() })).default([]), // other copies of the same story (other outlets), merged into this item
});
export type Candidate = z.infer<typeof CandidateSchema>;

// --- Stage 2 ---

// One search in config/searches.json.
export const SearchConfigSchema = z.object({
  lane: z.enum(['china', 'official', 'topic', 'yc', 'outlet']),
  query: z.string(),
  category_hint: z.string().optional(), // category number as text, for example "7"; advice for Stage 3 only
  max_results: z.number().default(10),
  prefilter: z.boolean().default(false), // keep only items that look AI-related (general-news outlets)
});
export type SearchConfig = z.infer<typeof SearchConfigSchema>;

// What Stage 2 reports per provider (inside health_stage2.json).
export const ProviderHealthSchema = z.object({
  name: z.string(), // for example "Bing News", "Google News"
  status: z.enum(['OK', 'ERROR']),
  queries: z.number(), // how many times this provider was asked
  items: z.number(), // items it returned (before merging)
  note: z.string().optional(), // for example "3 of 28 queries failed"
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

// Health guard file that Stage 3 reads (data/health_stage2.json). Shape described in docs/SPEC.md.
export const Health2Schema = z.object({
  stage: z.literal(2),
  run_at: z.string(),
  total_items: z.number(),
  providers: z.array(ProviderHealthSchema),
  providers_error: z.number(),
  fallbacks_fired: z.number(), // queries where the Google News backup ran
  undecodable_links: z.number(),
});
export type Health2 = z.infer<typeof Health2Schema>;

// config/yc.json: how many recent YC batches count as "YC-backed", and which launch tags mean AI.
export const YcConfigSchema = z.object({
  recent_batches: z.number(),
  ai_tags: z.array(z.string()),
});
export type YcConfig = z.infer<typeof YcConfigSchema>;

// One page of ycombinator.com/launches.json (unofficial, Q10). Only the fields we use; zod fails loudly if they change.
export const LaunchesPageSchema = z.object({
  page: z.number(), // starts at 0
  nbPages: z.number(),
  hits: z.array(
    z.object({
      title: z.string(),
      tagline: z.string().nullish(),
      slug: z.string(),
      created_at: z.string(),
      search_path: z.string().nullish(), // the launch page address
      company: z.object({ name: z.string(), url: z.string().nullish(), batch: z.string().nullish(), tags: z.array(z.string()).default([]) }),
    }),
  ),
});

// One page of api.ycombinator.com/v0.1/companies (unofficial, Q10). Newest batch first.
export const CompaniesPageSchema = z.object({
  totalPages: z.number(),
  companies: z.array(z.object({ name: z.string(), batch: z.string(), website: z.string().nullish(), tags: z.array(z.string()).default([]) })),
});

// federalregister.gov/api/v1/documents.json (official US government API). Only the fields we use.
export const FederalRegisterSchema = z.object({
  results: z.array(z.object({ title: z.string(), abstract: z.string().nullish(), html_url: z.string(), publication_date: z.string(), type: z.string().nullish() })),
});

// What we keep in data/cache/yc-companies.json for the Stage 3 YC tagger.
export const YcCompanySchema = z.object({ name: z.string(), batch: z.string(), website: z.string().nullable(), tags: z.array(z.string()) });
export type YcCompany = z.infer<typeof YcCompanySchema>;

export const KeywordsSchema = z.object({
  case_sensitive: z.array(z.string()), // matched exactly, e.g. "AI"
  case_insensitive: z.array(z.string()), // matched ignoring case
});
export type Keywords = z.infer<typeof KeywordsSchema>;
