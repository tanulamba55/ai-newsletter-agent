# Stage 3: Process items into stories

Status: tested (demo scope, 16 Oct 2026). 142 offline tests pass. Real runs: Claude Code agents (15 Oct morning, and a live rehearsal 15 Oct evening, 12 stories) and Gemini through `llm.ts` (15 Oct, 12 stories). You reviewed stories.json, the PDF, the links and the skip log. NOT yet tested: an unattended weekly run, a complete Gemini run on a stronger model (the finished Gemini run used `gemini-flash-lite-latest` for all three steps; the `gemini-3.5-flash` attempt stopped on overload errors), and the new saved-answer, backup-model and skip-busy-model behaviour against the real API (tested offline only)
Depends on (SPEC.md): Categories + precedence, Selection rules, Importance rubric, Story date, AI engine, Story + Skipped contracts
Known gaps (open-questions.md): Q14, Q15, Q16, Q18, Q19, Q21

## Demo scope (15 Oct 2026)
The full design below stays the target. For the demo it is cut down; every cut is listed in docs/deferred.md.
- **AI through `src/lib/llm.ts`, any provider** (SPEC.md AI engine; settings in `config/llm.json`, keys in `.env`; busy-model handling is described in SPEC.md). The first real run (15 Oct) used independent Claude Code agents because no key existed (Q21). Code and AI meet only through files in `data/stage3/`.
- **Two ways to run the AI steps** (full command lists in README, "How to run"): (A) Gemini or any provider from the terminal, `npm run all` or `npm run stage3`; (B) live Claude Code agents ("demo mode"): agents write `triage_<n>.json`, `review.json` and `summaries_<n>.json`, and the code steps check them (`--use-saved`; `summarize --inputs-only` only prepares the agents' input).
- **Run commands:** `npm run stage3` runs all steps; `npm run stage3 -- --from <step>` resumes; `npm run stage3:<step>` runs one. AI steps take `--use-saved` (use answer files already there), `--only <n>` (one slice or part); `summarize` also takes `--inputs-only`.
- **Steps and files** (one program each, `src/stage3-<step>.ts`; the runner is `src/stage3.ts`):

| Step | Program | Spec steps | Reads | Writes | By |
|---|---|---|---|---|---|
| prepare | `stage3-prepare.ts` | 0, 1, 2, 2b | `items.json`, `items_extra.json`, health files, `config/stage3.json` | `candidates.json`, `candidates_1..4.json`, `skipped_prepare.json` | code |
| triage | `stage3-triage.ts` | 3 | `docs/prompts/stage3-triage.md`, `candidates_<n>.json` | `triage_<n>.json` | AI, one call per slice |
| rank | `stage3-rank.ts` | 3 check, 4 | `triage_<n>.json` | `shortlist.json` (top 4 per category plus near-miss band; copies of one story collapsed), `dropped_triage.json` | code |
| review | `stage3-review.ts` | pass 2 | `docs/prompts/stage3-review.md`, `shortlist.json` | `review.json`, `selected.json` (max 3 per category), `dropped_review.json` | AI (one call), then code applies it |
| fetch | `stage3-fetch.ts` | 5 | `selected.json`, item files | `articles.json` | code |
| summarize | `stage3-summarize.ts` | 6 | `docs/prompts/stage3-summary.md`, `selected.json`, `articles.json` | `summary_input_<n>.json`, `summaries_<n>.json` | AI, 4 calls |
| finish | `stage3-finish.ts` | 7, 8 | `summaries_<n>.json`, `articles.json`, `config/source_rules.json`, drop lists | `data/stories.json`, `data/skipped.json` | code |

  `prepare` deletes every older Stage 3 file first, so a saved answer is only ever reused within the same run.
- Categories in the demo: 1-7 and 9 (new: AI infrastructure and research, SPEC.md). Triage is 4 independent slices; a review pass over the shortlist plus a near-miss band (items scoring just under the cutoff) fixes score drift between slices, merges same-story items from different slices and rescues wrongly dropped items. The optional consistency check (a second run on 30 items of slice 1) is not built.
- Cut: category 8 and the YC tagger (step 2c; cat 4 launches still arrive tagged from Stage 2), number check, token budget, golden set, Readability/cheerio/jsdom (light own HTML-to-text and link extraction). The one AI retry on a bad answer IS built (in `llm.ts`). The Q19 shortlist dedupe is built, as the group collapse in `rank` plus the review pass.
- Kept: health guard, date filter, URL and title dedupe, item cap (about 500), ranking, top 4 per category then trim to 2-3, original-source rule with aggregator blocklist and trusted outlets (`config/source_rules.json`), supporting-quote check, skip log merge.
- Known weakness (accepted for the demo, 16 Oct): the original-source rule loses many good stories. Morning run 15 of 23 selected; Gemini run 12 of 23; live rehearsal 12 of 23 (about 9 lost to "no original source link found", 2 skipped as too thin), with categories 2 and 7 empty. Causes: pages that could not be fetched (Pandaily), and news articles without a link to the original. The rule is strict on purpose; losses are listed in `skipped.json`. Options not built: relax the rule for trusted outlets (needs a SPEC.md change), a better summary prompt, fetching blocked pages another way.
- Review-prompt quality (Gemini run): the review kept a biotech financing (not AI), a low-quality outlet post and a minor Facebook feature. Prompt fix not done.

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
Any model, set per step in `config/llm.json` (SPEC.md AI engine). Calls go only through `src/lib/llm.ts`, which waits and retries on rate limits (HTTP 429), retries a bad answer once, and prints tokens used per call. The hard token budget is deferred (docs/deferred.md). A full run is about 9 calls (4 triage, 1 review, 4 summaries); free tiers allow this, but their limits change often (LESSONS.md), so check the provider's page before relying on them.

## Cache
Fetched pages and AI answers go in `data/cache/`, so reruns cost nothing.

## Files
Programs: `src/stage3.ts` (runner) and `src/stage3-<step>.ts` (see the table in Demo scope). Libraries in `src/lib/`: `prepare.ts`, `dedupe.ts`, `triage.ts`, `rank.ts`, `review.ts`, `fetchPage.ts`, `finish.ts`, `llm.ts`, `llmSetup.ts`, `schemas.ts`, `files.ts`, `dates.ts`, `rss.ts`, `urls.ts`. Config: `config/stage3.json`, `config/llm.json`, `config/source_rules.json`. Prompts: `docs/prompts/stage3-triage.md`, `stage3-review.md`, `stage3-summary.md`. Tests: `tests/stage3-*.test.ts`, `tests/llm.test.ts`.

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
Free: Node 23.6 built-ins (including `fetch` and `process.loadEnvFile`), `zod`. HTML-to-text and link extraction are our own small code (no cheerio, readability or jsdom). No AI SDK and no agent framework: `llm.ts` uses plain `fetch`. A paid provider is optional; model names, prices and limits are checked on the provider's own page at the time, not guessed.

## Risks (top first)
1. **AI invents facts.** Summaries only from fetched text, plus the supporting-quote and number checks.
2. **AI invents the original-source link.** Code accepts only a link that actually appears on the fetched page, is reachable, and is not an aggregator domain.
3. **Prompt injection from article text, titles and snippets.** Passed as data only, the model has no tools, output must pass zod.
4. **Cost or quota overrun.** Item cap, slices, tokens printed per call, rate-limit waits. On a paid provider also set a spend cap in the provider's console; a hard token budget in code is deferred.
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
