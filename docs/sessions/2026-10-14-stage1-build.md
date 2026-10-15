# Handoff: build Stage 1 (Collect)

Written 14 Oct 2026, updated the same day after the pre-build audit. For a fresh Claude Code session. Everything needed to build Stage 1 is here or linked.

## Read first (and only these)
0. [LESSONS.md](../../LESSONS.md): what past sessions learned, with sources. Then check the newest file in `data/health/`: if it is under about 24 hours old with no fail, trust it and skip the run; otherwise run `npm run health:full` (about 10 s) and confirm nothing new is broken.
1. [CLAUDE.md](../../CLAUDE.md): working rules (simple, plain-language comments; user reviews code, does not write it; build one stage, wait for approval; explain what you build in plain language).
2. [SPEC.md](../SPEC.md): shared rules. Needed parts: Item contract, Skipped contract, Whole pipeline (cache, atomic writes, health guard), Selection rules (7-day window).
3. [docs/specs/stage1-collect.md](../specs/stage1-collect.md): the stage spec (updated 14 Oct 2026 with the decisions below).
4. [open-questions.md](../open-questions.md): entries Q7, Q8, Q9, Q13, Q15, Q16, Q17 (Stage 1 gaps).
5. [scripts/spikes/decode-spike.mjs](../../scripts/spikes/decode-spike.mjs): working Google News link decoder spike (95 of 95 links decoded). Reuse its logic for `src/lib/resolveUrl.ts`.

Do not read the Stage 2 or 3 specs. Do not build them.

## Before you build (pre-build audit, 14 Oct 2026)
Result: ready to build, after these steps. Do them first, tell the user what changed.

**A. Fix the Stage 1 spec (docs/specs/stage1-collect.md), it is out of date:**
1. Feed addresses that now redirect (HTTP 301, all end at 200): SCMP `https://www.scmp.com/rss/5/feed/` (trailing slash); Google AI `https://blog.google/innovation-and-ai/technology/ai/rss/`; Mistral `https://mistral.ai/news/rss`. Use the new addresses in the spec and in `config/feeds.json`, and make the fetcher follow redirects anyway (Node `fetch` does by default).
2. "Known facts from testing" says raw GitHub was refused from the dev machine. On 14 Oct it returned 200. Reword to: "refused once; may be intermittent; the jsDelivr mirror stays as `fallback_url`". Same fix in Q9 of docs/open-questions.md ("Update 14 Oct") only if the user agrees; otherwise leave Q9 and mention it in LESSONS.md (already there).
3. SCMP is general news and is not on the prefilter list. Decision: Stage 1 does not prefilter it; Stage 3 triage drops non-AI items. Write this one line into the Stage 1 spec (SCMP row) so Stage 3 is not surprised. If the user prefers a Stage 1 filter, add SCMP to the `prefilter` feeds instead.

**B. Needs the user's OK first:**
- `npm install rss-parser zod` (needs network). `package.json` already exists (scripts `health` and `health:full`); add scripts `collect` and `test` to it, do not replace it.
- At the end, the user accepts the known gaps: Q7, Q8, Q9, Q12, Q13, Q16, Q17 (statuses DEFERRED, TEMPORARY, DEFAULT APPLIES, WATCH). Q14 is resolved. Q18 and Q19 are Stage 3.

**C. Housekeeping that is already done (do not redo):**
- Repo restructured: documents in `docs/` (SPEC.md, open-questions.md, specs/, sessions/), the spike in `scripts/spikes/`, code goes in `src/`, settings in `config/`, tests in `tests/`, generated output in `data/` (git-ignored). No new files in the repo root.
- `tests/health.ts` checks the free outside services (`npm run health`, `npm run health:full`). It only reports and saves results in `data/health/`; do not edit docs from its results without asking the user.
- Health on 14 Oct: 32 pass, 1 warn (Bing `site:pandaily.com` gives 0 items, a known gap, Q20). Re-run it only if the newest result in `data/health/` is older than about a day or showed a fail.
- Not committed on purpose: this file and `scripts/spikes/decode-spike.mjs` (the user keeps handoff files out of commits for now; ask before committing the spike). Plan: when `src/lib/resolveUrl.ts` exists, delete the spike and make `tests/health.ts` import the real decoder instead of its own compact copy.

**D. At the end of the Stage 1 session (CLAUDE.md "Session routine"):** add new lessons to LESSONS.md (source plus status for each), write a short dated handoff note in `docs/sessions/`.

## Goal
`node src/stage1-collect.ts` reads `config/feeds.json`, collects the last 7 days of items, and writes:
- `data/items.json` (Items per SPEC.md)
- `data/skipped_stage1.json` (dropped items with a reason)
- `data/health_stage1.json` (health guard input)
- a console table per feed: status, item count, oldest and newest date, fallbacks used.
No AI, no paid service in Stage 1.

## Decisions already made (do not re-ask)
- Lab model releases come from the **Hugging Face API**, not GitHub releases (spec, "Lab model releases").
- Anthropic community feed: raw GitHub address first, jsDelivr mirror as `fallback_url` (raw GitHub is refused from the dev machine).
- Extra feeds added: TechCrunch AI, Crunchbase News (plus TechCrunch Startups, YC feeds, as in the spec).
- Skip log is one file per stage; health guard files as in SPEC.md Whole pipeline.
- KnowTechie is skipped (Q7). VentureBeat has no working own feed; use Google News (Q8).
- YC tagging is NOT in Stage 1 (it runs in Stage 3).
- `too_old` items are not logged (too many); only counted in the report.

## Feed list for `config/feeds.json`
All tested 14 Oct 2026 and returning HTTP 200 unless noted (re-verified 14 Oct with `npm run health`; three addresses redirect, see the changed rows).

| Name | Address | type | extra |
|---|---|---|---|
| MarkTechPost | `https://www.marktechpost.com/feed/` | media | paging `paged` (`?paged=N`, stop when items older than 7 days, max 15 pages; only ~2 days per page set) |
| AI Business | `https://aibusiness.com/rss.xml` | media | none-needed (50 items, about a month) |
| AI Models (Substack) | `https://aimodels.substack.com/feed` | media | none-needed (quiet this week) |
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` | media | none-needed |
| VentureBeat | Google News only: `https://news.google.com/rss/search?q=site:venturebeat.com+when:7d&hl=en-US&gl=US&ceid=US:en` | media | paging `google-news` (own feed gives 429) |
| SCMP | own `https://www.scmp.com/rss/5/feed/` (the address without the slash redirects) plus Google News `site:scmp.com` | media, region china | paging `google-news` (own feed only ~3 days). General news, not only AI: no prefilter here, Stage 3 triage drops the non-AI items |
| TechNode | `https://technode.com/feed/` | media, region china | none-needed |
| Pandaily | own `https://pandaily.com/feed/` plus Google News `site:pandaily.com` | media, region china | paging `google-news` (own feed only ~2 days) |
| ChinaTalk | `https://www.chinatalk.media/feed` | media, region china | none-needed |
| OpenAI | `https://openai.com/news/rss.xml` | official | none-needed |
| Google AI | `https://blog.google/innovation-and-ai/technology/ai/rss/` (old address `blog.google/technology/ai/rss/` redirects here) | official | prefilter on |
| Nvidia | `https://blogs.nvidia.com/feed/` | official | prefilter on |
| Hugging Face blog | `https://huggingface.co/blog/feed.xml` | official | none-needed |
| Mistral | `https://mistral.ai/news/rss` (old address `mistral.ai/rss.xml` redirects here) | official | none-needed |
| Apple ML | `https://machinelearning.apple.com/rss.xml` | official | none-needed |
| Meta | `https://about.fb.com/news/feed/` | official | prefilter on |
| Microsoft | `https://news.microsoft.com/source/topics/ai/feed/` | official | prefilter on |
| Anthropic (community) | `https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml`, `fallback_url` `https://cdn.jsdelivr.net/gh/Olshansk/rss-feeds@main/feeds/feed_anthropic_news.xml` | official | temporary (Q9); newest item 8 Oct |
| TechCrunch Y Combinator tag | `https://techcrunch.com/tag/y-combinator/feed/` | media, lane yc | sparse (last post 18 Sep) |
| YC blog | `https://www.ycombinator.com/blog/rss` | media, lane yc | corporate news |
| TechCrunch Startups | `https://techcrunch.com/category/startups/feed/` | media, lane yc | |
| Crunchbase News | `https://news.crunchbase.com/feed/` | media, lane yc | 10 items per fetch |
| Hugging Face models (kind `hf-models`) | `https://huggingface.co/api/models?author=<org>&sort=createdAt&direction=-1&limit=50` per org | official | China orgs get region china. Orgs China: deepseek-ai, Qwen, moonshotai, zai-org, MiniMaxAI, tencent, baidu, ByteDance-Seed, XiaomiMiMo, stepfun-ai, inclusionAI. Open-weights: mistralai, meta-llama, openai, google, allenai |

For SCMP and Pandaily: fetch both the own feed and the Google News query, merge, and drop exact-URL duplicates keeping the copy that has a snippet (Google News items have title and date only).

## Hugging Face item mapping
title = model id (e.g. `Qwen/Qwen-Image-2.1-Turbo`); url = `https://huggingface.co/<id>`; outlet = `Hugging Face (<org>)`; outlet_type official; published_at = `createdAt`; snippet = pipeline tag and library name if present, else empty. Catch: `createdAt` is repo creation, not necessarily public release.

## Google News link decoder (`src/lib/resolveUrl.ts`)
Working method, proven in `scripts/spikes/decode-spike.mjs` (95 of 95 on 13 Oct 2026):
1. Article id = last path part of `https://news.google.com/rss/articles/<id>`.
2. Old-style ids: base64url-decode and look for an `http` URL inside. If found, done.
3. New-style ids (most): GET `https://news.google.com/rss/articles/<id>` with a browser User-Agent; read the `data-n-a-sg` (signature) and `data-n-a-ts` (timestamp) attributes.
4. POST form `f.req` to `https://news.google.com/_/DotsSplashUi/data/batchexecute` (exact body is in the spike); read the real URL after `garturlres` in the response; unescape `=` and `&`.
5. 1.5 s pause between links. Cache decoded results by article id (in `data/cache/`) so reruns cost nothing.
6. Failure: log `undecodable_link` and drop the item. The decoder uses an undocumented Google endpoint and can break; the health file must show how many links failed.
Also: Google News titles usually end with ` - <Outlet>`; strip that suffix and use the `<source>` element for the outlet name (check on real data).

## Rules to implement
- Rolling 7 days from run time (UTC). Parse RFC 822 and ISO dates. Missing or invalid date: drop and log `undated`.
- Browser-like User-Agent, 25 s timeout, retry once after a short pause, then try `fallback_url` if present. One bad feed never stops the run.
- Strip HTML from snippets; cap snippet at about 400 characters.
- URL cleaning: drop fragment and tracking params (`utm_*`, `fbclid`, `gclid`, `ref`), lowercase host, remove trailing slash (not root). Exact-URL duplicates removed.
- Item `id` = first 12 hex characters of sha1 of the cleaned URL.
- Keyword prefilter only for feeds flagged `prefilter` (Google AI, Nvidia, Microsoft, Meta). Keep an item if title or snippet matches the list in `config/keywords.json`; log the rest as `not_ai`. Proposed list (user skims the skip log, Q17): `AI` (case-sensitive word), `artificial intelligence`, `machine learning`, `deep learning`, `LLM`, `GPT`, `Gemini`, `Gemma`, `Claude`, `Llama`, `Copilot`, `chatbot`, `generative`, `neural`, `foundation model`, `agent` / `agentic`, `inference`, `GPU`. Google AI and Microsoft feeds are already AI-topic feeds, so few drops are expected.
- Cache raw downloads in `data/cache/<date>/`; support `--offline` to replay from cache.
- Write each output file to a temp name, then rename (no half files).
- Health file `data/health_stage1.json`: `{stage, run_at, total_items, feeds: [{name, status, items, oldest, newest, fallback_used}], feeds_error, fallbacks_fired, undecodable_links, not_ai, undated}`. Stage 3 reads it (SPEC.md Whole pipeline).
- Skipped entry: `{reason, title, url, feed, published_at?}`. Reasons used here: `undated`, `not_ai`, `undecodable_link`.

## Files to create
`package.json` already exists (`"type": "module"`, health scripts): add deps `rss-parser` and `zod` and scripts `collect` and `test`; do not replace it. Create: `config/feeds.json`, `config/keywords.json`, `src/stage1-collect.ts`, `src/lib/rss.ts`, `src/lib/huggingface.ts`, `src/lib/dates.ts`, `src/lib/resolveUrl.ts`, `src/lib/files.ts`, `src/lib/schemas.ts` (zod Item, Skipped, Health), `tests/` with `tests/fixtures/` (saved real feed and API files).
Node 23.6 runs `.ts` directly: use `.ts` in import paths, `import type`, and no TypeScript-only syntax that needs compiling (no enums, no parameter properties).
Ask before running `npm install` (it needs network).

## Build order
1. Decoder first (`resolveUrl.ts`) with a test on 3 saved Google News links. This is the Q15 gate; it already passed once.
2. Dates, URL cleaning, schemas, file helpers, with tests.
3. RSS reading (RSS and Atom), paging, fallback address, Hugging Face source.
4. Prefilter, health and skipped files, console table.
5. Run live once; read the table; run the tests.

## Tests
Automated, no network (saved real files in `tests/fixtures/`): date window; RSS and Atom parsing; undated item dropped; bad feed isolated; paging stops; URL cleaning; decoding on 3 saved examples; prefilter; Hugging Face JSON to Items; `fallback_url` used when main fails.
Manual (the user does these): run once and read the table; spot-check 5 items (real link, within 7 days); run twice and confirm no duplicate URLs; break one URL in `feeds.json` and confirm only that feed shows ERROR and appears in the health file; confirm MarkTechPost's oldest item is about 7 days old; confirm Pandaily and SCMP reach about 7 days.
Pass: every working feed OK; date range covers 7 days (or the report says how far back); 0 duplicate URLs.

## When done
1. Explain in plain language what was built and what each file does.
2. Report the live run table and anything that failed. Do not hide errors.
3. List the known gaps for the user to accept: Q7, Q8, Q9, Q12, Q13, Q16 (default), Q17. Q18 and Q19 are Stage 3.
4. Set the Stage 1 Status line to `built` only after the user accepts. Wait for approval before touching Stage 2.
5. Do not edit Stage 2 or 3 specs. If a shared fact must change, edit SPEC.md only (CLAUDE.md rule).

## Known catches (from testing)
- `raw.githubusercontent.com` was refused earlier from the dev machine (connection reset) but returned 200 on 14 Oct, so it is probably intermittent. Keep the jsDelivr mirror as `fallback_url` (it also works).
- Bing `site:` counts move a lot day to day (technode 7 -> 1, venturebeat 3 -> 7 between 13 and 14 Oct). Treat them as a rough guide.
- Bing `site:` backup for SCMP and VentureBeat is a Stage 2 lane, not Stage 1.
- TechNode, OpenAI and Hugging Face blog feeds hold hundreds to thousands of items; the date filter handles this.
- AI Models Substack and Mistral have nothing newer than 6 Oct, so zero items is normal for them this week.
