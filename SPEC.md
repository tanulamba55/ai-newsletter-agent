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

## Categories (8)
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

Names:
1. Funding and startups
2. AI in video, UI and design
3. AI regulations and policy
4. New AI product launches in YC (launches only)
5. LLM model updates
6. Open-source model updates
7. China models and updates
8. YC-backed AI startups (everything except launches: funding, hiring,
   acquisitions, etc.)

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
Claude API, used only through one file (`src/lib/llm.ts`). Smaller model
for triage, larger for summaries. Paid per use; needs an API key in .env
and a spend cap.

## Resources and approvals
What is free is not enough on its own. These need a decision or a purchase.

| Item | Status | Why | Details |
|---|---|---|---|
| Claude API key and spend cap | Required | Stage 3 triage and summaries | AI engine, above |
| Claude web search (paid) | Conditional | Recall benchmark in the test week; backup search if the Q11 or Q20 triggers fire | Whole pipeline (benchmark), Q11, Q20. Price checked at build time |
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
not_ai, undated, undecodable_link, over_item_cap, number_not_found.
File layout: one file per stage. Stage 1 writes `data/skipped_stage1.json`,
Stage 2 writes `data/skipped_stage2.json`, Stage 3 writes `data/skipped.json`
(its own drops merged with the two stage files, for your audit).

## Whole pipeline
- Raw downloads are saved to `data/cache/<date>/` so any run can be replayed offline.
- Each stage writes a temp file, then renames it, so a crash never leaves half a file.
- After Stages 1-3 are built: one end-to-end run on a real week; read stories.json top to bottom and ask "would I send this?".
- Benchmark week (re-verifies the free resources): with paid Claude web search, build an independent list of that week's big AI stories and compare it with what the free pipeline found. Report recall per category and the reason for each miss (provider blocked, decoder failed, dropped by triage, wrong category, no original source). Run it in the first real test week, again whenever a trigger fires (recall under 70%, a provider errors in 2 runs in a row, a format change), and as an occasional spot check (suggested monthly). Small cost, only on those weeks.
- Secrets (API key) live in `.env`, which is in `.gitignore`.
- Health guard: Stages 1 and 2 each print a health summary and write `data/health_stageN.json` (feeds or providers that failed, fallbacks that fired, item count). Stage 3 reads both and stops BEFORE any AI call if: more than 3 feeds ERROR, or both Bing and Google News failed in Stage 2, or total items are below a minimum (set after the first real run, lives in config). `--force` overrides the stop. A scheduled run (Stage 5) never uses `--force`.

## PDF (UI skill, built later)
Clean layout, sections by category, readable typography, clickable
source links, cover/title area with date.
