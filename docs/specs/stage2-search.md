# Stage 2: Search lanes to fill gaps

Status: approved (plan) - not built
Depends on (SPEC.md): Categories + precedence, Item contract, Selection rules
Known gaps (open-questions.md): Q10, Q11, Q12, Q15, Q20 (plus Q8, Q9 for the shared link decoder)
Run order: after Stage 1 (build order). Stage 2 does not read Stage 1's output; the YC tagger runs in Stage 3.

## Purpose
Add items that the RSS feeds miss: YC news, Chinese companies, official announcements without RSS, and categories 2 and 3.

## Input
`config/searches.json`: list of `{lane, query, category_hint, max_results}`.

## Output
`data/items_extra.json`: Items (same shape as Stage 1) with optional `lane`, `category_hint`, and `yc_match` (set only on YC launch items). The hint advises Stage 3 triage; it is not binding.
Also `data/skipped_stage2.json` (dropped items) and `data/health_stage2.json` (providers that failed, item count; see SPEC.md Whole pipeline).

## Why fixed searches
Stage 2 runs the same searches every time. It does not wait to learn which categories are thin after Stage 3, since that would be circular. No re-search loop: a category still thin after Stage 3 is skipped.

## Lanes
1. **YC lane (no search tool):**
   - Read `ycombinator.com/launches` JSON (last 7 days) as items, hint cat 4.
   - Download the YC company directory (`api.ycombinator.com/v0.1/companies`) once a day to `data/cache/yc-companies.json`.
   - The YC tagger (matching company names against all items) runs in Stage 3, using this cache. Launch items get `yc_match` here directly.
   - Extras: YC blog RSS (`ycombinator.com/blog/rss`), Launch HN as backup (Q10). General startup and funding feeds live in Stage 1 (`lane: yc`) and pass through the Stage 3 tagger.
2. **China lane:** company-name searches (DeepSeek, Qwen/Alibaba, Moonshot/Kimi, Zhipu, MiniMax, ByteDance Doubao, Tencent Hunyuan, Baidu Ernie). Hint cat 7. China media feeds and lab GitHub release feeds are in Stage 1.
3. **Official lane:** searches for companies with no RSS: AMD, Databricks, Meta AI. Apple, Microsoft and Anthropic also keep a search as backup to their Stage 1 feeds (duplicates are expected; Stage 3 dedupes). No hint.
4. **Topic lane:** cat 2 (Sora, Runway, Figma, Adobe, Midjourney) and cat 3 (EU AI Act, US federal/state, China rules). Cat 3 also reads two official sources directly: Federal Register API and EU Commission digital RSS (`digital-strategy.ec.europa.eu/en/rss.xml`), kept only if the title matches AI keywords (the bare term matches unrelated rules). Cat 3 originals are government or legal sites.
5. **Outlet gap-fill lane:** Bing `site:` queries (`site:scmp.com`, `site:venturebeat.com`) that backfill the Stage 1 Google News fallbacks if the link decoder fails (Q15). Always on; Stage 3 dedupes. Tested Oct 2026 (7-day filter, one machine): scmp.com 12 results, venturebeat.com 3, technode.com 7, pandaily.com 0. Pandaily is not covered by Bing (Q13). Searching by outlet name instead of `site:` was tested and is worse (mostly other outlets).

## Search tool
`src/lib/search.ts` is the only file that knows the providers. It runs several and merges the results, so one failing provider never stops the stage:
1. **Bing News RSS (main):** `bing.com/news/search?q=...&format=rss&mkt=en-US&qft=interval%3d%227%22`. The `qft` part is the 7-day filter (without it Bing returns old items; "past week" in the query and `sortbydate` do nothing). About 12 results per query, each with title, date and a short description. The real article URL is inside the link's `url=` part, so decoding is trivial.
2. **Google News RSS (backup):** `q=...+when:7d`. Title, date, link, no snippet. Links need `lib/resolveUrl.ts`.
3. **Hacker News Algolia API:** free, no key, real URLs.

GDELT was tested and dropped (throttled). If recall is poor, swap in or add a keyed API, for example Claude web search (Q11). Items without a snippet are triaged on title only; items without a date are dropped (logged `undated`).

## Limits
About 25 queries x about 12 results each, under 300 raw items. Polite delay between queries. Stage 3 dedupes.

## Files
`src/stage2-search.ts`, `src/lib/yc.ts`, `src/lib/search.ts`, `src/lib/resolveUrl.ts`, `config/searches.json`.

## Decisions made
- Free search first, several providers merged (Bing main); YC from YC's own JSON; China feeds in Stage 1; topic lane added for cats 2 and 3.
- Cat 3 reads Federal Register and EU Commission directly, with a title filter.
- Cat 8: startup feeds in Stage 1 feed the YC tagger; cat 8 is kept and skipped when empty (Q12 default).
- Tagger uses recent batches only and needs the name in title or snippet. It runs in Stage 3 so Stage 2 does not depend on Stage 1's file.
- Apple, Microsoft, Meta, Anthropic keep both feed and search; Stage 3 dedupes.

## Success check
Categories 2, 3, 4, 7, 8 each have at least 1 story when news exists (cat 8 may be empty, see Q12).

## Tools
All free. Node 23.6 built-ins (`fetch`, `node:test`), `rss-parser` (Bing and Google News results, EU feed), `zod`. Hacker News Algolia API and Federal Register API (free, no key). No AI in Stage 2: plain code with fixed rules, no model judgment, no per-use cost.

## Risks (top first)
0. **FLAG: THE MAIN YC NEWS SOURCE IS MISSING.** Tested Oct 2026: no dedicated feed of regular YC-company news exists. We have the YC launches JSON (cat 4 launches only) and the YC company directory (names only, no news). Cat 8 (funding, hiring, acquisitions of YC-backed companies) has no primary source, so it is the weakest category and may often be thin. Fallback ladder, best first:
   - (a) Search `"YC-backed"` and `"Y Combinator" AI` (Bing, Google News).
   - (b) General startup and funding feeds in Stage 1, with the YC name tagger picking out YC companies.
   - (c) TechCrunch Y Combinator tag feed (works but sparse: 20 items, last post Sep 18). Plain RSS, lives in Stage 1 with `lane: yc`.
   - (d) YC blog RSS (official but mostly YC corporate news such as partner hires). Also in Stage 1.
   - (e) Hacker News search (Algolia) for "Launch HN" and YC-tagged titles (cat 4 leaning). hnrss.org returned HTTP 502, so not used.
   Product Hunt is not YC-specific, so skipped. Tracked as Q12; measured in the known-news check.
1. **YC endpoints are unofficial and may change** (Q10). zod check, loud failure, Launch HN fallback, saved fixture so tests still run.
2. **YC name collisions** (generic names tagged wrongly). Tagger only suggests; name must be in title or snippet; Stage 3 confirms; test with collision names.
3. **Search providers are unofficial** (Bing, Google News) and can block fast callers or change format (Q20). Several providers merged, polite delay, cache, date filter, known-news check.
4. **Search items add AI cost.** Cap about 300 raw items; Stage 3 dedupes before the AI calls.
5. **Company lists go stale** (China labs, YC batches). Lists live in config/searches.json; review monthly.
6. **Terms of use.** Fine for personal use; re-check before Stage 5 publishes publicly.
7. **Hint misleads triage.** The hint is advice only.

## Testing
- **Automated:** YC JSON parse from a saved file; Bing and Hacker News results parse from saved files (real URL taken from `url=`); Google News parse from a saved file; undated items dropped; cat 3 title filter on saved Federal Register results; item shape matches Stage 1 (zod).
- **You (manual):** run and read per-lane counts (including the outlet lane); re-run the Bing queries at full volume (about 25) from the machine that will run weekly, since only a small test was done (Q20); open 5 results per lane (real, within 7 days); compare the YC lane with ycombinator.com/launches in your browser; **known-news check:** list 8-10 big AI stories from that week (across cats 2, 3, 4, 7, 8) and count how many the pipeline found. In the benchmark week, also check against the independent list from paid web search (SPEC.md Whole pipeline).
- **Pass:** all lanes run; shape valid; known-news check finds 70% or more (below that, consider a keyed search API, Q11).

## Out of scope
Summaries and categorization (Stage 3).
