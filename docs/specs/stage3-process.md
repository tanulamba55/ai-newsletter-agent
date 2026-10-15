# Stage 3: Process items into stories

Status: approved (plan); demo-scope build in progress (15 Oct 2026)
Depends on (SPEC.md): Categories + precedence, Selection rules, Importance rubric, Story date, AI engine, Story + Skipped contracts
Known gaps (open-questions.md): Q14, Q15, Q16, Q18, Q19, Q21

## Demo scope (15 Oct 2026)
The full design below stays the target. For the demo it is cut down; every cut is listed in docs/deferred.md.
- **AI steps run as independent Claude Code agents, not the API** (no key yet; Q21). Code and AI meet only through files, so the same files are filled by an API call later without rewriting anything: `data/stage3/candidates.json` (code writes) -> `triage_<n>.json` (AI) -> `articles.json` (code fetches survivors) -> `summaries_<n>.json` (AI) -> `data/stories.json` (code checks and writes). Agent instructions: `docs/prompts/stage3-triage.md` and `docs/prompts/stage3-summary.md`.
- Three code programs instead of one: `src/stage3-prepare.ts` (steps 0-2b), `src/stage3-rank.ts` (steps 3 validation, 4, 5), `src/stage3-finish.ts` (steps 7-8). `src/lib/llm.ts` is not built.
- Categories in the demo: 1-7 and 9 (new: AI infrastructure and research, SPEC.md). Triage plan: 4 independent slice agents (`docs/prompts/stage3-triage.md`), then a review pass by one fresh agent over the shortlist plus a near-miss band (items scoring just under the cutoff) to fix score drift between slices and rescue wrongly dropped items; optional consistency check (a second agent on 30 items of slice 1) to report agreement.
- Cut: category 8 and the YC tagger (step 2c; cat 4 launches still arrive tagged from Stage 2), number check, AI retries, token budget, golden set, Readability/cheerio/jsdom (light own HTML-to-text and link extraction), the optional Q19 final dedupe is built (code only) because triage slices cannot see each other.
- Kept: health guard, date filter, URL and title dedupe, item cap (about 500), ranking, top 4 per category then trim to 2-3, original-source rule with aggregator blocklist and trusted outlets, supporting-quote check, skip log merge.

## Purpose
Turn the raw items (about 400-500 after Stages 1 and 2) into at most 24 clean stories (2-3 per category), each with an original source.

## Input
`data/items.json` and `data/items_extra.json` (Stage 2, if present), `data/health_stage1.json` and `data/health_stage2.json`, `data/cache/yc-companies.json` (for the YC tagger).

## Output
`data/stories.json` (Stories) and `data/skipped.json` (Stage 3's own drops merged with `skipped_stage1.json` and `skipped_stage2.json`, for your audit; layout in SPEC.md). Console funnel, for example: `212 items -> 190 in date -> 140 after dedupe -> 58 kept by triage -> 30 shortlisted -> 22 stories`.

## Steps
Cheap code first, AI only where judgment is needed.

| # | Step | Done by | What happens |
|---|---|---|---|
| 0 | Health guard | code | Read the two health files. Stop before any AI call if the SPEC.md Whole pipeline conditions hit; `--force` overrides (never in scheduled runs; Q16). |
| 1 | Date filter | code | Drop anything older than 7 days. |
| 2 | Quick dedupe + sort | code | Same URL or near-identical title = one item. Then sort by title similarity so near-duplicates land in the same triage batch. |
| 2b | Item cap | code | If more than the cap (about 500, set at build; raised from 400 on 14 Oct 2026 because Stage 1 gives about 270 items and Stage 2 about 250 raw) remain, send newest and official first; the rest are logged `over_item_cap`. |
| 2c | YC tagger | code | Match company names from the YC directory cache (recent batches only, SPEC.md Categories) against every item and add `yc_match {company, batch}`. The name must appear in the item's title or snippet. It is a suggestion; triage confirms. Generic names can collide. |
| 3 | Triage (AI call 1) | AI, batches of ~40 | Sees title + snippet only (+ `yc_match` and `category_hint` if present). Returns keep/skip, ONE category (precedence list; YC rule needs the company name in title or snippet), importance 1-10, same-story group id. Score 5 or more keeps; the cutoff is tuned with the golden set. |
| 4 | Rank | code | Per category by score; ties by number of outlets covering it, official first. Take top 4 per category. |
| 5 | Fetch pages | code | Download full article for survivors only (~30), following normal HTTP redirects (Stage 3 does not decode Google News links; Stage 1 does). On failure: try other links in the same story group, then fall back to the snippet or search description (log `fetch_failed` only if all fail). |
| 6 | Original source + summary (AI call 2) | AI, one story at a time | From the article text only: find primary-source link, write summary and why_it_matters, return ONE supporting quote. |
| 7 | Checks | code | Original link reachable and not an aggregator. Supporting quote found in the article. Every number in the summary appears in the article. |
| 8 | Trim and write | code | Keep best 2-3 per category, validate with zod, write stories.json and the skip log. |

## Original-source rule
- Official-feed items are already original.
- For media items the AI picks the outbound link to the company blog, paper, repo or press release.
- If the outlet broke the news itself (scoop), the outlet link counts as original, but only if the outlet is on the trusted-outlets list in `config/source_rules.json`.
- `config/source_rules.json` also holds the aggregator blocklist (always rejected, for example news.google.com and bing.com).
- Nothing qualifies: story dropped, logged `no_original_source` (Q6).
- Snippet-only case: a snippet has no outbound links. If no article could be fetched, a media item survives only through the scoop rule (outlet on the trusted list); otherwise it is dropped. Official-feed items are unaffected.

## Supporting quote and number checks
The AI copies one exact sentence from the article that backs the summary's main claim. Code searches the article: case, punctuation and small wording differences ignored. On a miss: one AI retry, then drop and log `quote_not_found`.
Code also checks that every number in the summary (amounts, percentages, dates, counts) appears in the article text. On a miss: one AI retry, then drop and log `number_not_found`. It catches invented claims and wrong figures; it cannot catch every wrong detail (such as a wrong name).
If only a snippet was available (step 5 fallback), the checks run against the snippet.

## Models
Smaller Claude model for triage (call 1), larger for summaries (call 2). Calls go only through `src/lib/llm.ts`, which also enforces a hard token budget: past the limit the run stops cleanly and writes what it has. The old estimate (about 200k input tokens per run) assumed about 200 items; re-estimate at build with the item cap (verify pricing).

## Cache
Fetched pages and AI answers go in `data/cache/`, so reruns cost nothing.

## Files
`src/stage3-process.ts`, `src/lib/dedupe.ts`, `src/lib/yc.ts` (shared with Stage 2), `src/lib/llm.ts`, `src/lib/fetchPage.ts`, `src/lib/dates.ts`, `src/lib/schemas.ts`, `src/lib/files.ts`, `config/categories.json`, `config/source_rules.json`.

## Decisions made
- Over-pick 4 per category, trim to 2-3.
- $100M+ funding bar, YC exempt.
- Lenient quote match, one retry; plus a number check.
- Story date = earliest date in group.
- Drop stories with no original source.
- Sort by title similarity before batching (cheap fix for batches that cannot see each other).
- Fetch fallback: other outlet in the group, then snippet.
- Triage keep cutoff: score 5 or more.
- Scoop rule: aggregator blocklist plus trusted-outlets list.
- Hard token budget in code, item cap before triage.
- YC tagger lives here (step 2c), not in Stage 2, so Stage 2 does not depend on Stage 1's file.
- Health guard before any AI call (step 0).
- Optional, only if testing shows leftover duplicates: a final code-only dedupe of the shortlist by `source_url` (Q19).

## Success check
Stories grouped by category, 2-3 max each, each with an original-source link; no duplicates; nothing older than 7 days.

## Tools
Free: Node 23.6 built-ins, `zod`, `cheerio` (read HTML and list links), `@mozilla/readability` + `jsdom` (clean article text). **Paid per use:** `@anthropic-ai/sdk` (Claude API). Model IDs, current price and spend cap are checked at build time, not guessed. No agent framework.

## Risks (top first)
1. **AI invents facts.** Summaries only from fetched text, plus the supporting-quote and number checks.
2. **AI invents the original-source link.** Code accepts only a link that actually appears on the fetched page, is reachable, and is not an aggregator domain.
3. **Prompt injection from article text, titles and snippets.** Passed as data only, the model has no tools, output must pass zod.
4. **Cost overrun.** Item cap, batching, cache, token count printed every run, hard token budget in code, spend cap in the Anthropic console.
5. **Wrong category, or an important story dropped.** Golden set test plus a skip-log audit.
6. **Bad AI JSON or API errors.** zod check, retry with a pause, log and skip that batch, never crash the run.
7. **Article blocked or paywalled.** Other outlet in the group, then snippet; logged `fetch_failed` only if all fail. A snippet-only summary is thinner, and a media item without a fetched page can only pass via the trusted-outlet scoop rule (see Original-source rule), so paywalled media stories are often lost.
8. **Duplicates merged too much or too little.** Similarity sort before batching; group ids still only valid inside a batch (Q19); tested on real same-story groups.
9. **Different results each run.** Temperature 0 plus the cache within the week. Scores can still drift between batches (golden set tracks this).
10. **Secret leak.** `.env` listed in `.gitignore`.

## Testing
- **Automated with a FAKE AI** (canned answers, costs nothing): health guard stops on the three conditions and `--force` overrides; YC tagger on sample names including collisions and old-batch exclusion; skip files merge into `skipped.json`; date filter; dedupe; similarity sort; item cap; ranking; top 4 then trim to 2-3; keep cutoff; quote matcher (found / reworded / missing); number check; source-link verifier with blocklist and trusted outlets; fetch fallback order; token budget stops the run cleanly; zod rejects bad shapes; skip reasons.
- **Golden set (decided):** you label about 30 real items from one week once (important or not + category, about 20-30 minutes; I prepare the file; done before Stage 3 is built). We run real triage and compare with your labels. Targets: category agrees on 80% or more, and no item you marked "major" is dropped. Re-run after every prompt or model change. Fixture in `tests/fixtures/`.
- **You (manual):** read the funnel numbers; spot-check 5 stories against their source link; find one story covered by 2+ outlets and confirm one entry with the others in other_links; skim the skip log for wrongly dropped big news; check the printed token count and cost.
- **Pass:** schema valid; 2-3 per category max; every story has a working original link; nothing older than 7 days; golden-set targets met; cost within your cap.

## Out of scope
Fetching new items (Stages 1 and 2), PDF layout (Stage 4).
