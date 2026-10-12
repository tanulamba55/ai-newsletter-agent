# Stage 2: Search lanes to fill gaps

Status: approved (plan) - not built
Depends on (SPEC.md): Categories + precedence, Item contract, Selection rules

## Purpose
Add items that the RSS feeds miss: YC news, Chinese companies, official announcements without RSS, and categories 2 and 3.

## Input
`config/searches.json`: list of `{lane, query, category_hint, max_results}`.

## Output
`data/items_extra.json`: Items (same shape as Stage 1) with optional `lane`, `category_hint`, `yc_match`. The hint advises Stage 3 triage; it is not binding.

## Why fixed searches
Stage 2 runs the same searches every time. It does not wait to learn which categories are thin after Stage 3, since that would be circular. No re-search loop: a category still thin after Stage 3 is skipped.

## Lanes
1. **YC lane (no search tool):**
   - Read `ycombinator.com/launches` JSON (last 7 days) as items, hint cat 4.
   - Download the YC company directory (`api.ycombinator.com/v0.1/companies`) once a day to `data/cache/yc-companies.json`.
   - **YC tagger:** match company names against ALL items (Stage 1 + 2) and add `yc_match {company, batch}`. Generic names can collide; Stage 3 triage confirms.
   - Extras: YC blog RSS (`ycombinator.com/blog/rss`), Launch HN as backup (Q10).
2. **China lane:** company-name searches (DeepSeek, Qwen/Alibaba, Moonshot/Kimi, Zhipu, MiniMax, ByteDance Doubao, Tencent Hunyuan, Baidu Ernie). Hint cat 7. China media feeds are in Stage 1.
3. **Official lane:** searches for companies with no RSS: AMD, Databricks, Meta AI, Apple, Microsoft, Anthropic (backup to community feed). No hint.
4. **Topic lane:** cat 2 (Sora, Runway, Figma, Adobe, Midjourney) and cat 3 (EU AI Act, US federal/state, China rules). Cat 3 originals are government or legal sites.

## Search tool
`src/lib/search.ts` is the only file that knows the provider. Start with free Google News RSS search (`q=...+when:7d`: title, date, link, no snippet) plus the Hacker News Algolia API. Swap in a keyed API only if recall is poor (Q11). Search items without a snippet are triaged on title only; items without a date are dropped. Google News links are decoded with `lib/resolveUrl.ts`.

## Limits
About 25 queries x 10 results each, under 250 raw items. Stage 3 dedupes.

## Files
`src/stage2-search.ts`, `src/lib/yc.ts`, `src/lib/search.ts`, `src/lib/resolveUrl.ts`, `config/searches.json`.

## Decisions made
- Free search first; YC from YC's own JSON; China feeds in Stage 1; topic lane added for cats 2 and 3.

## Success check
Categories 2, 3, 4, 7, 8 each have at least 1 story when news exists; every story has source_is_original = true.

## Tools
All free. Node 23.6 built-ins (`fetch`, `node:test`), `rss-parser` (Google News results), `zod`. Hacker News Algolia API (free, no key). No AI in Stage 2.

## Risks (top first)
0. **FLAG: THE MAIN YC NEWS SOURCE IS MISSING.** Tested Oct 2026: no dedicated feed of regular YC-company news exists. We have the YC launches JSON (cat 4 launches only) and the YC company directory (names only, no news). Cat 8 (funding, hiring, acquisitions of YC-backed companies) has no primary source, so it is the weakest category and may often be thin. Fallback ladder, best first:
   - (a) Google News searches `"YC-backed"` and `"Y Combinator" AI` (tested: 7 days, recent, Business Insider, Yahoo Finance, Dealroom).
   - (b) TechCrunch Y Combinator tag feed (works but sparse: 20 items, last post Sep 18). Plain RSS, lives in Stage 1 with `lane: yc`.
   - (c) YC blog RSS (official but mostly YC corporate news such as partner hires). Also in Stage 1.
   - (d) Hacker News search (Algolia) for "Launch HN" and YC-tagged titles. (hnrss.org returned HTTP 502, so not used.)
   - (e) YC name tagger over all other feeds.
   Product Hunt and general startup feeds are not YC-specific, so skipped. Tracked as Q12; measured in the known-news check.
1. **YC endpoints are unofficial and may change** (Q10). zod check, loud failure, Launch HN fallback, saved fixture so tests still run.
2. **YC name collisions** (generic names tagged wrongly). Tagger only suggests; Stage 3 confirms; test with collision names.
3. **Google News search is junk, old, non-English, snippet-less, or blocks fast callers** (Q11). Polite delay between queries, cache, region parameters, date filter, known-news check.
4. **Search items add AI cost.** Cap about 250 raw items; dedupe before AI.
5. **Company lists go stale** (China labs, YC batches). Lists live in config/searches.json; review monthly.
6. **Terms of use.** Fine for personal use; re-check before Stage 5 publishes publicly.
7. **Hint misleads triage.** The hint is advice only.

## Testing
- **Automated:** YC JSON parse from a saved file; tagger on sample names including collisions; search results parse from saved Google News and Hacker News files; undated items dropped; item shape matches Stage 1 (zod).
- **You (manual):** run and read per-lane counts; open 5 results per lane (real, within 7 days); compare the YC lane with ycombinator.com/launches in your browser; **known-news check:** list 8-10 big AI stories from that week (across cats 2, 3, 4, 7, 8) and count how many the pipeline found.
- **Pass:** all lanes run; shape valid; known-news check finds 70% or more (below that, consider a keyed search API, Q11).

## Out of scope
Summaries and categorization (Stage 3).
