# Stage 3: Process items into stories

Status: approved (plan) - not built
Depends on (SPEC.md): Categories + precedence, Selection rules, Importance rubric, Story date, AI engine, Story + Skipped contracts

## Purpose
Turn about 150-300 raw items into at most 24 clean stories (2-3 per category), each with an original source.

## Input
`data/items.json` and `data/items_extra.json` (Stage 2, if present).

## Output
`data/stories.json` (Stories) and `data/skipped.json` (dropped items with a reason). Console funnel, for example: `212 items -> 190 in date -> 140 after dedupe -> 58 kept by triage -> 30 shortlisted -> 22 stories`.

## Steps
Cheap code first, AI only where judgment is needed.

| # | Step | Done by | What happens |
|---|---|---|---|
| 1 | Date filter | code | Drop anything older than 7 days. |
| 2 | Quick dedupe | code | Same URL or near-identical title = one item. |
| 3 | Triage (AI call 1) | AI, batches of ~40 | Sees title + snippet only (+ `yc_match` and `category_hint` if present). Returns keep/skip, ONE category (precedence list), importance 1-10, same-story group id. |
| 4 | Rank | code | Per category by score; ties by number of outlets covering it, official first. Take top 4 per category. |
| 5 | Fetch pages | code | Download full article for survivors only (~30). |
| 6 | Original source + summary (AI call 2) | AI, one story at a time | From the article text only: find primary-source link, write summary and why_it_matters, return ONE supporting quote. |
| 7 | Checks | code | Original link reachable and not an aggregator. Supporting quote found in the article. |
| 8 | Trim and write | code | Keep best 2-3 per category, validate with zod, write stories.json and skipped.json. |

## Original-source rule
- Official-feed items are already original.
- For media items the AI picks the outbound link to the company blog, paper, repo or press release.
- If the outlet broke the news itself (scoop), the outlet link counts as original.
- Nothing qualifies: story dropped, logged `no_original_source` (Q6).

## Supporting quote check
The AI copies one exact sentence from the article that backs the summary's main claim. Code searches the article: case, punctuation and small wording differences ignored. On a miss: one AI retry, then drop and log `quote_not_found`. It catches invented claims; it cannot catch every wrong detail (such as a wrong number).

## Models
Smaller Claude model for triage (call 1), larger for summaries (call 2). Calls go only through `src/lib/llm.ts`. Estimate: about 200k input tokens per weekly run (verify pricing).

## Cache
Fetched pages and AI answers go in `data/cache/`, so reruns cost nothing.

## Files
`src/stage3-process.ts`, `src/lib/dedupe.ts`, `src/lib/llm.ts`, `src/lib/fetchPage.ts`, `src/lib/dates.ts`, `src/lib/schemas.ts`, `src/lib/files.ts`, `config/categories.json`.

## Decisions made
- Over-pick 4 per category, trim to 2-3.
- $100M+ funding bar, YC exempt.
- Lenient quote match, one retry.
- Story date = earliest date in group.
- Drop stories with no original source.

## Success check
Stories grouped by category, 2-3 max each, each with an original-source link; no duplicates; nothing older than 7 days.

## Tools
Free: Node 23.6 built-ins, `zod`, `cheerio` (read HTML and list links), `@mozilla/readability` + `jsdom` (clean article text). **Paid per use:** `@anthropic-ai/sdk` (Claude API). Model IDs, current price and spend cap are checked at build time, not guessed. No agent framework.

## Risks (top first)
1. **AI invents facts.** Summaries only from fetched text, plus the supporting-quote check.
2. **AI invents the original-source link.** Code accepts only a link that actually appears on the fetched page, is reachable, and is not an aggregator domain.
3. **Prompt injection from article text.** Article is passed as data only, the model has no tools, output must pass zod.
4. **Cost overrun.** Batching, cache, token count printed every run, item limit per run, spend cap set in the Anthropic console.
5. **Wrong category, or an important story dropped.** Golden set test plus a skipped.json audit.
6. **Bad AI JSON or API errors.** zod check, retry with a pause, log and skip that batch, never crash the run.
7. **Article blocked or paywalled.** Logged `fetch_failed`; official items can fall back to the snippet.
8. **Duplicates merged too much or too little.** Tested on real same-story groups.
9. **Different results each run.** Temperature 0 plus the cache within the week.
10. **Secret leak.** `.env` listed in `.gitignore`.

## Testing
- **Automated with a FAKE AI** (canned answers, costs nothing): date filter; dedupe; ranking; top 4 then trim to 2-3; quote matcher (found / reworded / missing); source-link verifier; zod rejects bad shapes; skip reasons.
- **Golden set (decided):** you label about 30 real items from one week once (important or not + category, about 20-30 minutes; I prepare the file; done before Stage 3 is built). We run real triage and compare with your labels. Targets: category agrees on 80% or more, and no item you marked "major" is dropped. Re-run after every prompt or model change. Fixture in `tests/fixtures/`.
- **You (manual):** read the funnel numbers; spot-check 5 stories against their source link; find one story covered by 2+ outlets and confirm one entry with the others in other_links; skim skipped.json for wrongly dropped big news; check the printed token count and cost.
- **Pass:** schema valid; 2-3 per category max; every story has a working original link; nothing older than 7 days; golden-set targets met; cost within your cap.

## Out of scope
Fetching new items (Stages 1 and 2), PDF layout (Stage 4).
