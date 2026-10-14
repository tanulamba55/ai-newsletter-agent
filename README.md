# AI Newsletter Agent

A weekly newsletter on AI, built automatically. It finds the most important AI stories of the last 7 days, writes a short summary of each, and puts them into one designed PDF.

**Status:** planning complete for Stages 1-3, no code written yet.

## Objective

Every week, produce one PDF that gives a busy reader:
- The AI stories that actually mattered this week, not everything that was published.
- For each story: a 2-3 sentence **summary**, 1-2 sentences on **why it matters**, and a clickable link to the **original source**.
- Stories grouped into 8 categories, so readers can jump to what they care about.

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
8. YC-backed AI startups

Each story belongs to exactly one category. The rules for choosing it are in [SPEC.md](SPEC.md).

## How it works

```
 RSS feeds ──► Stage 1: Collect ──► items.json ─┐
                                                ├─► Stage 3: Process ──► stories.json ──► Stage 4: PDF ──► Stage 5: Publish
 Web search ─► Stage 2: Search ───► items_extra ┘
```

| Stage | Job | Output | Status |
|---|---|---|---|
| 1. Collect | Read the last 7 days from media and official-company RSS feeds | items.json | Planned |
| 2. Search | Fill gaps the feeds miss: YC news, Chinese AI companies, official announcements without RSS, regulation, video/design | items_extra.json | Planned |
| 3. Process | Remove duplicates, pick what matters, sort into categories, find the original source, write summaries | stories.json | Planned |
| 4. PDF | Turn stories.json into a designed PDF | PDF | Idea only |
| 5. Publish | Send or post the PDF, run weekly | Published PDF | Idea only |

The JSON files are the contract between stages: each stage reads the previous one's file, so any stage can be rebuilt or fixed without touching the others.

## How we work

- Build **one stage at a time** and wait for approval before the next.
- Code is TypeScript (Node 23.6), simple, and commented in plain language.
- Free tools wherever possible. Required: the Claude API (Stage 3). Possible paid backups (web search, browser fetch) and the terms-of-use decision are listed in [SPEC.md](SPEC.md) under Resources and approvals. Free workarounds that may break later are in the register at the top of [open-questions.md](open-questions.md).
- Open decisions live in [open-questions.md](open-questions.md).

## Where to find things

| File | What it holds |
|---|---|
| [README.md](README.md) | This overview |
| [SPEC.md](SPEC.md) | Shared rules: categories, selection rules, importance rubric, JSON shapes |
| [specs/](specs/) | One spec per stage: steps, risks, tools, testing, success check |
| [open-questions.md](open-questions.md) | Unresolved and temporary decisions |
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code |

## Planned folder layout

```
config/   feeds.json, categories.json, searches.json   (editable settings)
src/      stage1-collect.ts, stage2-search.ts, stage3-process.ts, lib/
data/     items.json, items_extra.json, stories.json, skipped.json
tests/    saved sample data and automated checks
```

## Known weak spots

- **YC news:** no dedicated YC news feed exists, so category 8 may often be thin.
- **Blocked sites:** KnowTechie and VentureBeat's own feed are blocked. VentureBeat is read through a Google News fallback, and KnowTechie is skipped for now.
- **Anthropic** has no official RSS feed, so a community-made one is used for now.

Details and fallbacks are in the stage specs and [open-questions.md](open-questions.md).

## How to run

Not available yet. This section is filled in when Stage 1 is built.
