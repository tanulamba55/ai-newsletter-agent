# AI Newsletter Agent

A weekly newsletter on AI, built automatically. It finds the most important AI stories of the last 7 days, writes a short summary of each, and puts them into one designed PDF.

**Status (16 Oct 2026):** Stages 1 to 4 are built and run for the 16 Oct demo, with a reduced scope (8 active categories). Stage 3's AI steps run either as live Claude Code agents (demo mode) or through any AI provider via `src/lib/llm.ts` and `config/llm.json` (Gemini free tier tested once, see [open-questions.md](docs/open-questions.md) Q21). Stage 5 deferred. What was cut and why: [docs/deferred.md](docs/deferred.md).

## Objective

Every week, produce one PDF that gives a busy reader:
- The AI stories that actually mattered this week, not everything that was published.
- For each story: a 2-3 sentence **summary**, 1-2 sentences on **why it matters**, and a clickable link to the **original source**.
- Stories grouped into categories, so readers can jump to what they care about (9 defined; the 16 Oct demo uses 8 of them, see the list below and SPEC.md).

## What "good" looks like

| Goal | Meaning |
|---|---|
| Recent | Only stories from the last 7 days |
| Important | Major launches, new models, real research, big company news. Minor announcements are skipped |
| Trustworthy | Every story links to its original source (company blog, paper, repo, press release), not just a news aggregator. No original source found means the story is dropped |
| No repeats | The same story covered by several outlets appears once |
| Short | 2-3 stories per category, at most 24 in total. A category with nothing important is skipped |
| Readable | A clean, designed PDF you would be happy to read |

## Categories

1. Funding and startups
2. AI in video, UI and design
3. AI regulations and policy
4. New AI product launches in YC
5. LLM model updates
6. Open-source model updates
7. China models and updates
8. YC-backed AI startups (deferred for the demo)
9. AI infrastructure and research (added 15 Oct 2026)

Each story belongs to exactly one category. The rules for choosing it are in [SPEC.md](docs/SPEC.md).

## How it works

```
 RSS feeds ──► Stage 1: Collect ──► items.json ─┐
                                                ├─► Stage 3: Process ──► stories.json ──► Stage 4: PDF ──► Stage 5: Publish
 Web search ─► Stage 2: Search ───► items_extra ┘
```

| Stage | Job | Output | Status |
|---|---|---|---|
| 1. Collect | Read the last 7 days from media and official-company RSS feeds | items.json | Built |
| 2. Search | Fill gaps the feeds miss: YC news, Chinese AI companies, official announcements without RSS, regulation, video/design | items_extra.json | Built (awaiting acceptance) |
| 3. Process | Remove duplicates, pick what matters, sort into categories, find the original source, write summaries | stories.json | Tested (demo scope) |
| 4. PDF | Turn stories.json into a designed PDF | PDF | Tested (demo scope) |
| 5. Publish | Send or post the PDF, run weekly | Published PDF | Deferred |

The JSON files are the contract between stages: each stage reads the previous one's file, so any stage can be rebuilt or fixed without touching the others.

## How we work

- Build **one stage at a time** and wait for approval before the next.
- Code is TypeScript (Node 23.6), simple, and commented in plain language.
- Free tools wherever possible. The AI steps of Stage 3 work with any provider, free (for example Gemini) or paid; one key in `.env` is needed. Possible paid backups (web search, browser fetch) and the terms-of-use decision are listed in [SPEC.md](docs/SPEC.md) under Resources and approvals. Free workarounds that may break later are in the register at the top of [open-questions.md](docs/open-questions.md).
- Open decisions live in [open-questions.md](docs/open-questions.md).

## Where to find things

| File | What it holds |
|---|---|
| [README.md](README.md) | This overview |
| [LESSONS.md](LESSONS.md) | What past sessions learned, with sources |
| [SPEC.md](docs/SPEC.md) | Shared rules: categories, selection rules, importance rubric, JSON shapes |
| [specs/](docs/specs/) | One spec per stage: steps, risks, tools, testing, success check |
| [open-questions.md](docs/open-questions.md) | Unresolved and temporary decisions |
| [deferred.md](docs/deferred.md) | What was cut for the 16 Oct demo, why, and what brings it back |
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code |
| [docs/sessions/](docs/sessions/) | Dated handoff and review notes |

## Folder layout

```
config/   feeds.json, keywords.json, searches.json, yc.json, aggregators.json (stages 1-2); stage3.json, source_rules.json, llm.json (stage 3)
src/      stage1-collect.ts, stage2-search.ts, stage3.ts (runner) and stage3-<step>.ts, stage4-pdf.ts; lib/ holds the shared code
data/     generated, git-ignored: items*.json, skipped*.json, health*.json, stories.json, newsletter-<date>.pdf, stage3/ (working files), cache/, health/, demo-2026-10-15/ (saved demo copy)
tests/    *.test.ts (all offline, no AI), fixtures/ (saved real feeds), health.ts (outside-service check)
docs/     SPEC.md, open-questions.md, deferred.md, specs/, prompts/ (instructions for the AI steps), sessions/
scripts/  spikes/ for throwaway experiments (now: firecrawl-spike.ts, compare-triage.ts)
.claude/  skills/docs-sync: the skill that checks docs against code (see CLAUDE.md, Session routine)
```

## Known weak spots

- **YC news:** no dedicated YC news feed exists, so category 8 may often be thin.
- **Blocked sites:** KnowTechie and VentureBeat's own feed are blocked. VentureBeat is read through Google News (about 31 real articles a week), and KnowTechie is skipped. Firecrawl was tested and does not unblock KnowTechie (Q7).
- **Anthropic** has no official RSS feed, so a community-made one is used for now.

Details and fallbacks are in the stage specs and [open-questions.md](docs/open-questions.md).

## Before you start (read this first)

What you need on your machine before running Stages 1 to 4:

| Need | Why | Check |
|---|---|---|
| **Node 23.6 or newer** | The code is TypeScript run directly by Node (no build step). Older Node cannot do this | `node --version` |
| **`npm install`** | Only 3 packages: `rss-parser`, `zod`, `@google/genai` (the last one is not used by the code yet) | run once in the project folder |
| **Internet access** | Stages 1 and 2 read live feeds and search engines. No key is needed for them | `npm run health` |
| **`google-chrome` on the PATH** | Stage 4 prints the PDF with headless Chrome. Without it Stage 4 stops with "Chrome (google-chrome) was not found" | `which google-chrome` |
| **A `.env` file in the project root** (git-ignored, never committed; you must create it) | Holds the AI key for Stage 3. Example line: `GEMINI_API_KEY=your-key`. The variable name must match `key_env` for that provider in `config/llm.json` | `.env` must exist before `npm run stage3` |
| **An AI route for Stage 3** | Pick ONE: (A) an API key for a provider in `config/llm.json` (Gemini free tier was tested), or (B) Claude Code agents, no key needed (see "Demo mode" below) | |

Good to know before you begin:
- **`data/` is not in git.** Every generated file (items, stories, PDF, cache, health results) lives only on the machine that made it. A fresh clone starts empty: run Stage 1 first, then 2, 3, 4 in that order. Each stage reads the previous stage's file.
- **Run `npm run health` first.** It takes about 4 s, checks the outside services (feeds, Google News decoder, search providers) and saves the result in `data/health/`. Stage 3 reads the health files from Stages 1 and 2 and refuses to start if too few items arrived or too many feeds failed (`--force` overrides; never in scheduled runs).
- **Run Stages 1 and 2 right before Stage 3.** Stage 3 drops anything older than 7 days, so a day-old `items.json` loses a day of news.
- **Timing:** Stage 1 first run about 10 min (reruns seconds), Stage 2 about 2.5 min, Stage 3 a few minutes, Stage 4 seconds.
- **Gemini overload is normal.** The free tier often answers HTTP 503 "high demand", mostly on the newest models. Saved answers in `data/cache/ai/` mean a rerun only asks what is missing. Options when it keeps failing: rerun later, add `fallbacks` for the `triage` step in `config/llm.json` (only `review` and `summary` have them now), enable billing on the key, or use the Claude Code agent path. Details: LESSONS.md and "When a model is busy" below.
- **Stage 3 loses about half of the picked stories** (12 of 23 in every real run) at the original-source rule, so some categories can be empty. This is known and accepted for the demo; see [docs/deferred.md](docs/deferred.md).
- **Never commit `.env`.** It is in `.gitignore`. `FIRECRAWL_API_KEY` is only used by the spike script `scripts/spikes/firecrawl-spike.ts`, not by Stages 1 to 4.
- **Working rules for Claude Code** (one stage at a time, docs routine, session notes) are in [CLAUDE.md](CLAUDE.md). Start a session by reading [LESSONS.md](LESSONS.md) and the newest file in [docs/sessions/](docs/sessions/).

## How to run

One-time setup: `npm install`. For the AI steps, put your key in `.env` (for example `GEMINI_API_KEY=...`) and pick provider and model in `config/llm.json`.

| Command | What it does |
|---|---|
| `npm run stage1` | Stage 1: collect RSS items (first run about 10 min, reruns seconds). Add `-- --offline` to replay cached downloads |
| `npm run stage2` | Stage 2: search to fill gaps (about 2.5 min). `-- --offline` replays |
| `npm run stage3` | Stage 3: all steps in order, stops at the first failure |
| `npm run stage4` | Stage 4: stories.json to `data/newsletter-<date>.pdf` |
| `npm run all` | Stages 1 to 4 |
| `npm run stage3 -- --from <step>` | Stage 3 from a later step (after a failure) |
| `npm run stage3:<step>` | Run one Stage 3 step |
| `npm test` | all offline tests (no AI, no network) |
| `npm run health` | quick check of outside services (`health:full` for more) |
| `npm run docs:check` | do the docs still match the code? Reports only (`src/lib/docsCheck.ts`). Run before every commit that touches `src/`, `config/` or `package.json` |

Stage 3 steps, in order: `prepare`, `triage` (AI), `rank`, `review` (AI), `fetch`, `summarize` (AI), `finish`. Flags for the AI steps: `--use-saved` (use answer files already in `data/stage3/`), `--only <n>` (one slice or part), and for `summarize` also `--inputs-only` (write the input files, no AI call). Which files each step reads and writes: [docs/specs/stage3-process.md](docs/specs/stage3-process.md).

**When a model is busy.** Every checked AI answer is saved in `data/cache/ai/`, so running the same command again never repeats a question that was already answered. A step can list backup models in `config/llm.json` (`fallbacks`); a model that stays busy is skipped for the rest of the run. If every model is busy the step stops with one clear message; run the same command again later. `data/stage3/ai-log.json` records which model answered what.

### Demo mode: live run with Claude Code agents (no API key, nothing pre-saved)
Claude Code agents do the three AI steps, live, in this session. The code steps and the checks are the same commands:
1. `npm run stage1`, `npm run stage2`, then `npm run stage3:prepare`
2. Agents triage the 4 slices; each writes `data/stage3/triage_<n>.json` (instructions: `docs/prompts/stage3-triage.md`). Then `npm run stage3:rank` (checks the answers)
3. One agent reviews `data/stage3/shortlist.json` and writes `data/stage3/review.json` (`docs/prompts/stage3-review.md`). Then `npm run stage3:review -- --use-saved` (checks and applies it)
4. `npm run stage3:fetch`, then `npm run stage3:summarize -- --inputs-only`
5. Agents write `data/stage3/summaries_<n>.json` from `summary_input_<n>.json` (`docs/prompts/stage3-summary.md`)
6. `npm run stage3:finish`, then `npm run stage4`
