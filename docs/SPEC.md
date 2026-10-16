# Spec: Weekly AI Newsletter Agent

Shared rules live here. Each stage has its own file in `specs/`.
Rule: one home per fact. Stage files link here and never copy these rules.
Unresolved decisions: open-questions.md.

## Purpose
Find the most important AI stories of the last 7 days and turn them
into a one-PDF newsletter, each story with a summary, why it matters,
and a link to the original source.

## Pipeline

| Stage | What | Spec file | Output |
|---|---|---|---|
| 1 | Collect RSS items | [specs/stage1-collect.md](specs/stage1-collect.md) | items.json |
| 2 | Search lanes to fill gaps | [specs/stage2-search.md](specs/stage2-search.md) | items_extra.json |
| 3 | Health check, dedupe, tag YC companies, categorize, find original source, summarize | [specs/stage3-process.md](specs/stage3-process.md) | stories.json |
| 4 | UI skill: stories.json to PDF | [specs/stage4-pdf.md](specs/stage4-pdf.md) | PDF |
| 5 | Publish + schedule weekly | [specs/stage5-publish.md](specs/stage5-publish.md) | published PDF |

Build order = run order: 1, 2, 3, 4, 5. One stage at a time, wait for approval.
Stage 3 reads the output of Stages 1 and 2, so it processes everything once.
JSON files are the contract between stages. Code shapes live in
`src/lib/schemas.ts` (zod) once built; this file describes them in words.

## Categories (9 defined; 8 active in the demo: 1-7 and 9)
Demo scope (15 Oct 2026): category 8 is deferred (see docs/deferred.md). Until it returns, rule 1
below applies only to YC product launches (-> cat 4); any other news about a YC company goes
through rules 2-8 like every other item. Stage 4 leaves out a category with no stories.
Category 9 (AI infrastructure and research) was added on 15 Oct 2026 after the first real week
showed important chip, data-center and research stories with no category (about 41 of 466 titles
mentioned chips, infrastructure or research). It takes the number 9 so that 8 stays reserved for
YC-backed startups.

Each story gets exactly ONE category. Precedence (first match wins):
1. YC-backed company: product launch -> cat 4, anything else -> cat 8
   ("YC-backed" = batches from roughly the last 3 years; cutoff lives in config.
   Applies only if the company name appears in the item's title or snippet)
2. Chinese company or model -> cat 7 (even if open-source or funding)
3. Regulation or policy -> cat 3
4. Open-weights model release -> cat 6
5. Closed/frontier LLM update -> cat 5
6. AI video, UI or design tool -> cat 2
7. Funding and startups (non-YC) -> cat 1
8. Chips, data centers and other AI infrastructure, or research (papers, benchmarks,
   studies) -> cat 9

Names:
1. Funding and startups
2. AI in video, UI and design
3. AI regulations and policy
4. New AI product launches in YC (launches only)
5. LLM model updates
6. Open-source model updates
7. China models and updates
8. YC-backed AI startups (everything except launches: funding, hiring,
   acquisitions, etc.) - deferred for the demo
9. AI infrastructure and research (chips, data centers, papers, benchmarks) - added 15 Oct 2026

## Selection rules
- Last 7 days only (rolling window from run time)
- Prioritize major product launches, new models, important research,
  significant company announcements
- 2-3 stories per category, major ones only (skip a category if nothing
  important)
- Remove duplicates (same story from multiple outlets = one entry)
- Skip minor announcements
- Every story must have an original source (company blog, paper, repo,
  press release; or the outlet itself if it broke the news). No original
  source found = story dropped and logged in skipped.json

## Importance rubric (scored 1-10 within a category)
Important: new frontier model or major version; major launch from a big
company; funding or acquisition of $100M+ (YC startups exempt from the
threshold); new law, ruling or government action; research with a real
result (code, weights, benchmark record); notable open-weights release;
big chip, infrastructure or partnership deals. Bonus: several outlets
cover it, or the source is official.
Unimportant: minor features and version bumps; opinion, tutorials,
listicles, reviews; event promos; small funding; staff changes below CEO;
unsourced rumours; recaps of old news.

## Story date
`date` = earliest publish date among items about the story (when the
news broke). The 7-day check uses this date.

## AI engine
Provider-agnostic. Every AI step of Stage 3 (triage, review, summaries) goes through one file,
`src/lib/llm.ts`. Which AI is used is set in `config/llm.json`: a provider and a model per step
(a small, cheap model for triage, a stronger one for summaries if wanted). Keys live in `.env` and
are never printed or stored in config. Two kinds of provider:
- `openai`: any chat endpoint in the OpenAI format (Gemini, Groq, OpenRouter, local Ollama, OpenAI and others). Free tiers and paid plans work the same way.
- `command`: a program that reads the prompt on stdin and prints the answer (any agent command line).

The instruction text of each step is a file in `docs/prompts/`. Every AI answer is a JSON array that
code checks with zod (right shape, one answer per input item); a bad answer is retried once with the
reason, then the run stops. Saved answer files in `data/stage3/` can be reused instead of a new call
(`--use-saved`), so an answer from any other agent or model can be dropped in (this is how the live
Claude Code agent demo works: agents write the files, code checks them). A paid Claude API is one
possible provider, not a requirement (docs/deferred.md, Q21).

Busy or failing models (free tiers are overloaded at times):
- Every checked answer is saved in `data/cache/ai/`, keyed by the question. Asking the same question again returns the file, so a rerun never repeats a call that worked.
- A step may list backup models (`fallbacks` in `config/llm.json`, any provider). A model that stays unavailable (HTTP 429, 5xx, timeout) after 2 quick retries is skipped for the rest of the run.
- If every model is unavailable the step stops with one clear message; running the same command again continues with what is missing.
- `data/stage3/ai-log.json` records which model answered what (or that a saved answer was reused).

## Resources and approvals
What is free is not enough on its own. These need a decision or a purchase.

| Item | Status | Why | Details |
|---|---|---|---|
| AI provider key (free tier or paid) | Required for weekly automated runs; a free-tier key (for example Gemini) is enough to start. A paid plan needs a spend cap | Stage 3 triage, review and summaries | AI engine, above |
| Claude web search (paid) | Conditional; deferred (not used in the demo) | Recall benchmark in the test week; backup search if the Q11 or Q20 triggers fire | Whole pipeline (benchmark), Q11, Q20. Price checked at build time |
| Terms-of-use decision | Required before Stage 5 | Bing and Google News RSS feed a publicly published product. Your senior decides | Stage 2 Risk 6 |
| Real-browser fetch tool (for example Firecrawl) | Optional, test first | Helps blocked or paywalled pages (KnowTechie, some articles). Renders a page like a real browser | Q7 (free tiers and test plan) |

### Item (items.json, items_extra.json)
- id, title, url, outlet
- outlet_type: "media" or "official"
- published_at (UTC)
- snippet (may be empty)
- optional: region ("china"), lane, category_hint, yc_match {company, batch}
  (yc_match: set by Stage 2 for YC launches, by the Stage 3 tagger for everything else)

### Story (stories.json)
- title
- category
- summary (2-3 sentences)
- why_it_matters (1-2 sentences)
- source_url (original source)
- other_links (optional, e.g. coverage by outlets)
- date

### Skipped (skipped.json)
Dropped items with a reason: too_old, duplicate, minor,
over_category_cap, no_original_source, fetch_failed, quote_not_found,
not_ai, undated, undecodable_link, over_item_cap, number_not_found,
aggregator (Stage 2: result hosted on an aggregator such as msn.com).
Reserved, not emitted yet: `number_not_found` (the number check is deferred; it is not in the code's reason list) and `fetch_failed` (in the list, but a failed page fetch currently falls back to the snippet without a log entry).
Stage 3 also logs triage and review drops as `not_ai` (score 2 or less) or `minor`, review merges as `duplicate`, and category-cap drops as `over_category_cap`.
Counted but not logged in Stages 1 and 2: too_old, and exact-URL duplicates.
File layout: one file per stage. Stage 1 writes `data/skipped_stage1.json`,
Stage 2 writes `data/skipped_stage2.json`, Stage 3 writes `data/skipped.json`
(its own drops merged with the two stage files, for your audit).

## Whole pipeline
- Raw downloads are saved to `data/cache/<date>/` so any run can be replayed offline.
- Each stage writes a temp file, then renames it, so a crash never leaves half a file.
- After Stages 1-3 are built: one end-to-end run on a real week; read stories.json top to bottom and ask "would I send this?".
- Benchmark week (re-verifies the free resources): with paid Claude web search, build an independent list of that week's big AI stories and compare it with what the free pipeline found. Report recall per category and the reason for each miss (provider blocked, decoder failed, dropped by triage, wrong category, no original source). Run it in the first real test week, again whenever a trigger fires (recall under 70%, a provider errors in 2 runs in a row, a format change), and as an occasional spot check (suggested monthly). Small cost, only on those weeks.
- Secrets (API key) live in `.env`, which is in `.gitignore`.
- Health guard: Stages 1 and 2 each print a health summary and write `data/health_stageN.json` (feeds or providers that failed, fallbacks that fired, item count). Stage 2's file shape: `{stage: 2, run_at, total_items, providers: [{name, status, queries, items}], providers_error, fallbacks_fired, undecodable_links}`, one row per provider (Bing, Google News, Hacker News, YC, Federal Register, EU feed). Stage 3 reads both and stops BEFORE any AI call if: more than 3 feeds ERROR, or both Bing and Google News failed in Stage 2, or total items are below a minimum (set after the first real run, lives in config). `--force` overrides the stop. A scheduled run (Stage 5) never uses `--force`.

## PDF (UI skill, built later)
Clean layout, sections by category, readable typography, clickable
source links, cover/title area with date.
