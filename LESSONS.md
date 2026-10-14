# Lessons

Short facts learned while working on this project. Read at the start of every session; add to it at the end.

## Rules for this file
- Every entry has a source: a file in this repo, or a test someone ran. No source, no entry.
- Every entry has a status:
  - `verified YYYY-MM-DD`: re-run or re-checked on that date. Say how.
  - `from notes`: taken from an older file, not re-checked.
  - `changed`: re-check gave a different result. Say what it was and what it is now.
- One home per fact: details and decisions live in docs/open-questions.md and docs/SPEC.md. This file holds only what was learned, with a pointer. Never copy a spec rule here.
- Time-sensitive facts (outside services) go stale. Re-check them when a Q trigger fires or before building the stage that uses them.

## Outside services: what works (checked from the dev machine, one machine only)

| Lesson | Source | Status |
|---|---|---|
| These feeds return HTTP 200: MarkTechPost, AI Business, AI Models Substack, TechCrunch AI, TechNode, Pandaily, ChinaTalk, OpenAI, Nvidia, Hugging Face blog, Apple ML, Meta, Microsoft, TechCrunch YC tag, TechCrunch Startups, Crunchbase, YC blog | docs/sessions/2026-10-14-stage1-build.md (feed table) | verified 2026-10-14: HTTP 200 on each. Item dates were checked only for the feeds named in the rows below |
| VentureBeat own feed is blocked (HTTP 429) | open-questions.md Q8 | verified 2026-10-14: 429 on both `www.venturebeat.com/feed/` and `venturebeat.com/feed` |
| **Three feed addresses now redirect (HTTP 301)**, so `config/feeds.json` must follow redirects or use the new address: SCMP -> `.../rss/5/feed/`; Google AI -> `blog.google/innovation-and-ai/technology/ai/rss/`; Mistral -> `mistral.ai/news/rss` | new finding | verified 2026-10-14: followed each, all end at 200. The handoff table listed the old addresses as plain 200 |
| MarkTechPost paging works (`?paged=2` returns 200) and the first page covers about 3 days (11-14 Oct) | Q4 | verified 2026-10-14 |
| Pandaily own feed covers about 2 days (12-14 Oct); SCMP own feed about 3 days (11-14 Oct) | Q13 | verified 2026-10-14 |
| Mistral and AI Models Substack have nothing newer than 6 Oct; Anthropic community feed newest is 8 Oct; TechCrunch YC tag newest is 18 Sep | handoff stage1 "Known catches" | verified 2026-10-14 |
| Crunchbase feed returns 10 items per fetch | handoff stage1 feed table | verified 2026-10-14 |
| Hugging Face models API works and returns 50 items (checked with `Qwen`; newest `Qwen/Qwen-Image-2.1-Turbo`, created 9 Oct) | handoff stage1 | verified 2026-10-14 (Qwen only; the other orgs were not checked) |
| YC endpoints `ycombinator.com/launches.json` and `api.ycombinator.com/v0.1/companies` answer HTTP 200 | Q3, Q10 | verified 2026-10-14 for status only; content shape not checked (Q10 is still WATCH) |
| Jina Reader answers HTTP 200 for the Pandaily homepage | Q7 | verified 2026-10-14 for status only; page content not checked |

## Google News link decoder (Q15)
- Works: 3 of 3 links decoded for each of VentureBeat, SCMP and Pandaily with `scripts/spikes/decode-spike.mjs`. Source: Q15, handoff stage1. Status: verified 2026-10-14. This is a re-test of 9 links; the 95-of-95 figure from 13 Oct is `from notes`.
- Google News search size on 14 Oct: VentureBeat 100 items, SCMP 100, Pandaily 51. Q15 says Pandaily 48 on 13 Oct. Status: changed (small, expected; the feed moves daily).
- It uses an undocumented Google endpoint, so a pass today is no promise for next week. Keep the health guard.

## Things that did not match the notes (read these)
- **Raw GitHub:** the handoff says `raw.githubusercontent.com` was refused from the dev machine (Q9). On 14 Oct it returned 200. Status: changed. Likely intermittent. Keep the jsDelivr mirror as `fallback_url`; it also returned 200.
- **Bing `site:` counts are not stable.** Q20 and the review file say scmp 12, technode 7, venturebeat 3, pandaily 0 (13 Oct). On 14 Oct: scmp 12, technode 1, venturebeat 7, pandaily 0. Status: changed. Use them as a rough guide only. This supports the Q20 plan to re-test from the weekly machine.
- **KnowTechie** still fails at connection level (curl returned no HTTP code), as Q7 says. Status: verified 2026-10-14. Cloudflare as the cause is `from notes`; not tested.

## Observations worth knowing when building
- SCMP's own feed is general news; the three Google News SCMP links decoded to politics and military stories, not AI. SCMP is not on the prefilter list in the handoff, so Stage 3 triage must drop the non-AI items. Source: this check of 3 links; small sample. Status: from one test.

## Process lessons
- A decision recorded in a handoff note is not proof an outside service still behaves that way. Re-check the cheap ones (HTTP status, newest date) at the start of a build session.
- Stage notes go in `docs/sessions/` (one dated file per session). Keep the repo root to CLAUDE.md, README.md, LESSONS.md and package files.
