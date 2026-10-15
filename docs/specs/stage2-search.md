# Stage 2: Search lanes to fill gaps

Status: built (15 Oct 2026; 74 automated tests pass, user manual checks done, known gaps Q10, Q11, Q12, Q15, Q20 accepted as non-blocking; not yet run in an end-to-end week)
Depends on (SPEC.md): Categories + precedence, Item contract, Selection rules
Known gaps (open-questions.md): Q10, Q11, Q12, Q15, Q20 (plus Q8, Q9 for the shared link decoder)
Run order: after Stage 1 (build order). Stage 2 does not read Stage 1's output; the YC tagger runs in Stage 3.

## Purpose
Add items that the RSS feeds miss: YC news, Chinese companies, official announcements without RSS, and categories 2 and 3.

## Input
`config/searches.json`: list of `{lane, query, category_hint, max_results}`.

## Output
`data/items_extra.json`: Items (same shape as Stage 1) with optional `lane`, `category_hint`, and `yc_match` (set only on YC launch items). The hint advises Stage 3 triage; it is not binding.
Also `data/skipped_stage2.json` (dropped items) and `data/health_stage2.json` (shape in SPEC.md Whole pipeline).

## Why fixed searches
Stage 2 runs the same searches every time. It does not wait to learn which categories are thin after Stage 3, since that would be circular. No re-search loop: a category still thin after Stage 3 is skipped.

## Lanes
1. **YC lane (no search tool):**
   - Read `ycombinator.com/launches.json` (last 7 days) as items, hint cat 4. Checked 14 Oct 2026: 20 hits per page (Algolia-style `hits`, `nbPages`), so page until items are older than 7 days. Each hit has `created_at`, `title`, `tagline`, `slug`, and `company {name, url, batch, tags}`. Keep only launches whose company tags include Artificial Intelligence or Machine Learning (decided 14 Oct; the rest are logged `not_ai`). `url` = the YC launch page (`ycombinator.com/launches/<slug>`); the company site goes in the snippet. `yc_match` = company name and batch.
   - Download the YC company directory (`api.ycombinator.com/v0.1/companies`) once a day to `data/cache/yc-companies.json`.
   - The YC tagger (matching company names against all items) runs in Stage 3, using this cache. Launch items get `yc_match` here directly.
   - Extras: YC blog RSS (`ycombinator.com/blog/rss`), Launch HN as backup (Q10). Hacker News is used for Launch HN only, nothing else (decided 14 Oct). General startup and funding feeds live in Stage 1 (`lane: yc`) and pass through the Stage 3 tagger.
2. **China lane:** company-name searches (DeepSeek, Qwen/Alibaba, Moonshot/Kimi, Zhipu, MiniMax, ByteDance Doubao, Tencent Hunyuan, Baidu Ernie). Hint cat 7. China media feeds and Chinese-lab model releases (Hugging Face API) are in Stage 1.
3. **Official lane:** searches for companies with no RSS: AMD, Databricks. Meta AI also keeps a search as backup (decided 14 Oct): the Stage 1 feed `about.fb.com` is a general newsroom with prefilter and `ai.meta.com` has no feed. Apple, Microsoft and Anthropic also keep a search as backup to their Stage 1 feeds (duplicates are expected; Stage 3 dedupes). No hint.
4. **Topic lane:** cat 2 (Sora, Runway, Figma, Adobe, Midjourney) and cat 3 (EU AI Act, US federal/state, China rules). Cat 3 also reads two official sources directly: Federal Register API and EU Commission digital RSS (`digital-strategy.ec.europa.eu/en/rss.xml`), kept only if the title matches AI keywords (the bare term matches unrelated rules: on 14 Oct the Federal Register term search returned an ITC patent notice first; both endpoints answered 200). Cat 3 originals are government or legal sites.
5. **Outlet gap-fill lane:** Bing `site:` queries (`site:scmp.com`, `site:venturebeat.com`) that backfill the Stage 1 Google News fallbacks if the link decoder fails (Q15). Always on; Stage 3 dedupes. Tested 13 and 14 Oct 2026 (7-day filter, one machine; counts move day to day): scmp.com 12, venturebeat.com 3 then 6-7, technode.com 7 then 1, pandaily.com 0. The Stage 1 decoder now works on real articles, so this lane is a backup, not the main route. SCMP is general news and Stage 1 runs the keyword prefilter on it; Decided 14 Oct: Stage 2 applies the same prefilter (`lib/prefilter.ts`, `config/keywords.json`) to general-news outlets (scmp.com); dropped items are logged `not_ai`. Pandaily is not covered by Bing (Q13). Searching by outlet name instead of `site:` was tested and is worse (mostly other outlets).

## Search tool
`src/lib/search.ts` is the only file that knows the providers. It runs several and merges the results, so one failing provider never stops the stage:
1. **Bing News RSS (main):** `bing.com/news/search?q=...&format=rss&mkt=en-US&qft=interval%3d%227%22`. The `qft` part is the 7-day filter (without it Bing returns old items; "past week" in the query and `sortbydate` do nothing). About 12 results per query, each with title, date and a short description. The real article URL is inside the link's `url=` part, so decoding is trivial.
2. **Google News RSS (backup):** `q=...+when:7d`. Title, date, link, no snippet. Links need `lib/resolveUrl.ts`. Decided 14 Oct: runs for a query only when Bing errors or returns fewer than about 3 results for it (the decoder costs 1.5 s per link). It still counts as a provider in the health file.
3. **Hacker News Algolia API:** free, no key, real URLs. Launch HN only (cat 4 backup, Q10); `numericFilters` must be URL-encoded (`created_at_i%3E<unix time>`). Not used for China or topic queries (decided 14 Oct).

**Bing outlet handling (decided 14 Oct):** drop aggregator hosts (`msn.com` and a small blocklist in config, logged in `skipped_stage2.json`); outlet = Bing's own source name.

GDELT was tested and dropped (throttled). If recall is poor, swap in or add a keyed API, for example Claude web search (Q11). Items without a snippet are triaged on title only; items without a date are dropped (logged `undated`).

## Limits
About 25 queries x `max_results` 10 each, about 250 raw items before dedupe (decided 14 Oct; Stage 3's item cap is raised to match). Polite delay between queries. Stage 3 dedupes.

## Files
`src/stage2-search.ts`, `src/lib/yc.ts`, `src/lib/search.ts`, `src/lib/resolveUrl.ts`, `config/searches.json`.

## Decisions made
- 14 Oct 2026 (requirements session): Google News only as backup; prefilter on general-news outlets; aggregator hosts dropped, Bing source name kept; YC launches AI-tagged only with the YC page as url; HN for Launch HN only; 10 results per query and Stage 3 cap about 500; providers-list health file; Meta search kept; query list drafted by Claude and reviewed by the user before build; weekly host is the dev machine for now (Bing re-test on the real host is a Stage 5 gate, Q20).
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

## Built and first live run (15 Oct 2026)
Built: `src/stage2-search.ts` (`npm run search`, `--offline` replay), `src/lib/search.ts`, `src/lib/yc.ts`, `src/lib/government.ts`, `src/lib/stage2.ts`, `config/searches.json` (29 queries), `config/yc.json`, `config/aggregators.json`. 74 automated tests pass (all offline, real saved responses in `tests/fixtures/`).
Final live run (one machine, about 2.5 min): 234 items, 0 providers in ERROR, 0 undecodable links, 0 duplicate URLs, none older than 7 days; offline replay gives identical items. Bing answered all queries; the Google backup ran twice. Dropped: 72 aggregator results (MSN, Yahoo, note.com), 15 not_ai, 11 too old. YC directory: about 1,700 companies from the last 12 batches cached. 16 YC launch items.
Items by lane: topic 79, china 69, official 53, yc 18 (news searches, no YC marker; the 16 YC launches carry `yc_match`), outlet 10. Federal Register gave 0 items (5 full-text hits that week, none with AI in the title; a low-yield source, not a broken one). EU feed gave 2.
Changes after the first run (15 Oct): a YC launch counts as AI if it has an AI tag OR the keyword matcher finds AI in its title or tagline; `note.com` added to the aggregator list; the query `AI regulation Congress OR White House` split into two precise queries because the `OR` returned general politics.
Known weak points kept: about a third of items have no English AI keyword (some noise such as politics, some real AI stories the keyword list cannot see, for example "Eight states sue OpenAI"); Stage 3 triage drops the noise. The outlet lane lets non-AI TechNode items through (only SCMP is filtered); Chinese-language titles are kept on purpose (the AI step reads Chinese).
Known gaps Q10, Q11, Q12, Q15, Q20 accepted by the user on 15 Oct 2026 as non-blocking for the demo (docs/deferred.md).

## Out of scope
Summaries and categorization (Stage 3).
