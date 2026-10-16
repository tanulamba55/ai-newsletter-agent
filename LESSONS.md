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
- Works: 3 of 3 links decoded for each of VentureBeat, SCMP and Pandaily with the spike script (since deleted; `tests/health.ts` now runs the real decoder). Source: Q15, handoff stage1. Status: verified 2026-10-14. This is a re-test of 9 links; the 95-of-95 figure from 13 Oct is `from notes`.
- Google News search size on 14 Oct: VentureBeat 100 items, SCMP 100, Pandaily 51. Q15 says Pandaily 48 on 13 Oct. Status: changed (small, expected; the feed moves daily).
- It uses an undocumented Google endpoint, so a pass today is no promise for next week. Keep the health guard.

## Things that did not match the notes (read these)
- Doc status note (14 Oct 2026, after Stage 1 built): open-questions Q8, Q9, Q13, Q15, Q17 and the Stage 1 spec were updated with the live-run results below (about 31 real VentureBeat articles, not 100; spike "95 of 95" overstated).
- **Raw GitHub:** the handoff says `raw.githubusercontent.com` was refused from the dev machine (Q9). On 14 Oct it returned 200. Status: changed. Likely intermittent. Keep the jsDelivr mirror as `fallback_url`; it also returned 200.
- **Bing `site:` counts are not stable.** Q20 and the review file say scmp 12, technode 7, venturebeat 3, pandaily 0 (13 Oct). On 14 Oct: scmp 12, technode 1, venturebeat 7, pandaily 0. Status: changed. Use them as a rough guide only. This supports the Q20 plan to re-test from the weekly machine.
- **KnowTechie** still fails at connection level (curl returned no HTTP code), as Q7 says. Status: verified 2026-10-14. Cloudflare as the cause is `from notes`; not tested.

## Observations worth knowing when building
- SCMP's own feed is general news; the three Google News SCMP links decoded to politics and military stories, not AI. SCMP is not on the prefilter list in the handoff, so Stage 3 triage must drop the non-AI items. Source: this check of 3 links; small sample. Status: from one test.

## Process lessons
- A decision recorded in a handoff note is not proof an outside service still behaves that way. Re-check the cheap ones (HTTP status, newest date) at the start of a build session.
- Stage notes go in `docs/sessions/` (one dated file per session). Keep the repo root to CLAUDE.md, README.md, LESSONS.md and package files.

## Stage 1 build (14 Oct 2026)
| Lesson | Source | Status |
|---|---|---|
| The Google News query `site:venturebeat.com` is padded: 69 of its 100 entries have an empty title (" - VentureBeat") and decode to site files (`/_next/static/chunks/*.js`), not articles. Real articles: about 31. The "100 VentureBeat items" in Q8/Q15 counts these | live run 14 Oct (`data/health_stage1.json`, report note); decoder reply read by hand | verified 2026-10-14. Changed from Q8/Q15 ("100") |
| The spike's success test (URL is not `news.google.com`) passed those site files, so "95 of 95 decoded" overstated; the decoder itself works on real articles (VentureBeat 31/31, SCMP 100/100, Pandaily 48/48 decoded, 0 undecodable) | spike script (deleted), live run | verified 2026-10-14 (count of real articles); the 13 Oct figure is `from notes` |
| Google's decoder reply double-escapes `=` and `&` in the URL (`\\u003d`). The spike's text match cut such URLs at the first backslash. `resolveUrl.ts` parses the JSON instead | raw reply inspected; test in `tests/stage1.test.ts` | verified 2026-10-14 |
| Hugging Face API returned 500/504 for every org (even `limit=5`) at about 07:30 UTC, an hour after the health check passed. It is intermittent. Live mapping only tested on a saved Qwen response | curl and two full runs 14 Oct | verified 2026-10-14. Back later the same day: live run gave 4 model items (Qwen/tencent 2, open-weights labs 2), 0 feeds in ERROR |
| SCMP `/rss/5/feed/` is titled "World - South China Morning Post". With the Google News copy, SCMP is 140 of 386 items, almost all non-AI | feed header; items.json | verified 2026-10-14 |
| Prefilter dropped "Introducing Microsoft's latest custom chip: Maia 300" as `not_ai` (a real AI story). Also dropped: Google "Playground" games, 4 Meta policy posts, 1 Nvidia GeForce post | `data/skipped_stage1.json` | verified 2026-10-14. Q17 trigger fired, decision pending |
| Google's `<source>` name differs from our feed name ("South China Morning Post" vs "SCMP"). Using it split one outlet into two. Outlet now always = feed name | first live output | verified 2026-10-14 |
| First live run took over 10 min (about 180 decodes at 1.5 s plus paging); a rerun takes seconds except for slow or failing feeds | two live runs | verified 2026-10-14 |
| Node 23.6 `node --test tests/` fails (treats it as a file); use a glob, `"tests/*.test.ts"` | `npm test` | verified 2026-10-14 |

## Firecrawl test (Q7, Q8), 14 Oct 2026
| Lesson | Source | Status |
|---|---|---|
| Firecrawl cannot fetch KnowTechie either (feed or homepage): HTTP 500, "SSL/TLS certificate error", even with its own TLS-skip on. Our own `curl -k` also fails at the TLS handshake, while plain `http://` answers 409. The site sits behind Cloudflare. Firecrawl does not unblock it | `scripts/spikes/firecrawl-spike.ts`, curl | verified 2026-10-14 (one try each, one machine) |
| Firecrawl fetches VentureBeat's own feed (our direct call gets 429): 1 credit, 0.4 s, 7 items from 10 to 13 Oct with description text. Paging does not work (`?paged=2,3,5` all return the same 7 items). So it covers about 3.5 days, not 7, and cannot replace the Google News route (about 31 articles in 7 days) | same spike | verified 2026-10-14 |
| The 7 VentureBeat items from Firecrawl carry snippets, which Google News items lack (Q18). Possible use: add snippets for the newest days. Not built | same spike | verified 2026-10-14; idea only |
| Firecrawl SCMP article test was inconclusive: the chosen page is a short intro (271 words, mostly navigation) with the report body elsewhere, so it says nothing about paywalls | same spike | verified 2026-10-14; needs a better test page |
| Cost of the whole test: about 7 credits of the 1,000 a month free plan | Firecrawl responses (`creditsUsed`) | verified 2026-10-14 |

## Jina Reader vs Firecrawl (14 Oct 2026)
| Lesson | Source | Status |
|---|---|---|
| Same four pages through both tools: KnowTechie fails in both (Jina HTTP 422, Firecrawl TLS error). VentureBeat feed: Jina gets the Vercel block page (429 inside), Firecrawl returns the feed (7 items, 1 credit). SCMP article: both work. Firecrawl is stronger and faster (0.4 s vs 16 s on the VentureBeat feed) but costs credits; Jina is free but hosted (about 20 requests a minute without a key) | curl to `r.jina.ai` and `scripts/spikes/firecrawl-spike.ts`, 14 Oct | verified 2026-10-14 (one try each, one machine) |
| Idea for Stage 3 article fetch, not built or decided: try our own fetch first, then Jina (free), then Firecrawl (credits). Test both on real failing pages then. Stage 1 needs neither | this discussion | idea, from notes |

## User manual check (14 Oct 2026, 10:54 UTC)
| Lesson | Source | Status |
|---|---|---|
| Raw GitHub was refused again for the Anthropic community feed and the jsDelivr `fallback_url` took over (report showed Fallback YES, 3 items). So raw GitHub is intermittent from the dev machine (OK at about 06:30 and 07:30 UTC, refused at 10:54). The fallback works as designed | user's `npm run collect` output | verified 2026-10-14 |
| User's manual run: 269 items, 0 feeds in ERROR, 0 undecodable, all 29 tests pass; manual checks passed | user's pasted output | verified 2026-10-14 |

## Stage 2 build and first live run (15 Oct 2026, one machine)
| Lesson | Source | Status |
|---|---|---|
| Full live run of 28 Bing queries plus YC and government sources took 2 min 27 s with 1 s between Bing queries and 0.3 s between YC pages. Bing answered 28 of 28; the Google backup ran for 3 queries; 0 undecodable links. Offline replay gave identical items (237) | `npm run search` live, then `--offline`, 15 Oct | verified 2026-10-15 (one run, one machine; Q20 stays WATCH) |
| Bing results contain many aggregator reprints: 53 of about 290 usable results were msn.com (36) or yahoo.com (17) and were dropped. Bing's own source names are messy (`eu.36kr`, `Washington Examiner on MSN`) | `data/skipped_stage2.json`, tests fixture `bing_deepseek.xml` | verified 2026-10-15 |
| `note.com` (a Japanese blogging platform that reposts news) supplied 18 of 237 items. Other low-quality sources seen: Crypto Briefing 5, eu.36kr 5, ainvest 4, konsulteer.com 4, Seeking Alpha 3, shattered.io 3. Stage 3 source rules decide what counts as original | `data/items_extra.json` outlet count | verified 2026-10-15 |
| Federal Register is a low-yield source: 529 documents were published 8-15 Oct; 5 mention "artificial intelligence" anywhere in the text (27 in four weeks) and none has AI in the title. The API works; category 3 will lean on news search and the EU feed. Title filter is needed: first hit of the term search was an ITC patent notice | live API calls 15 Oct (term and 7 or 28 day windows) | verified 2026-10-15 |
| EU digital-strategy feed: 10 entries, only 1 inside 7 days with AI in the title. Its description is the whole page as HTML; the short teaser sentence is the usable snippet | `tests/fixtures/eu_digital.xml` | verified 2026-10-15 |
| YC launches JSON (unofficial, Q10): page numbers start at 0 (`?page=1` is the second page), 20 per page, about 3,300 launches in all; every launch is listed, not only AI ones. Tags seen on AI launches: `Artificial Intelligence`, `AI`, `Machine Learning`, `Conversational AI`. Several clearly AI launches carry no AI tag (for example "Reading glasses for your AI agent"), so a tag-only rule misses them | `tests/fixtures/yc_launches_p1.json`, live run `not_ai` list | verified 2026-10-15 |
| YC companies API: 253 pages of 25, newest batch first (`W27`, `F26`, ...); `?batch=W26` filters. Last 12 batches took 69 page requests and gave 1,712 companies | live run, `data/cache/yc-companies.json` | verified 2026-10-15 |
| Hacker News Algolia: the date filter must be URL-encoded (`numericFilters=created_at_i%3E<unix time>`); a bare `>` returns HTTP 400. Searching "Launch HN" also returns Show HN and other posts, so titles are checked against "Launch HN: Name (YC F24)" | curl 15 Oct, `tests/stage2-yc.test.ts` | verified 2026-10-15 |
| 8 of 237 items have Chinese-language titles (mostly from the Google backup for `site:technode.com`). The English keyword filter cannot match Chinese words, so it must not be used to drop them. Kept on purpose: the AI step reads Chinese | `data/items_extra.json` | verified 2026-10-15 |
| No Anthropic API key exists (only `FIRECRAWL_API_KEY` in `.env`); `google-chrome` is installed at `/usr/bin/google-chrome`; Node packages are only rss-parser and zod | shell checks 15 Oct (key names only) | verified 2026-10-15 |

## Stage 3 prepare, first real run (15 Oct 2026)
| Lesson | Source | Status |
|---|---|---|
| Real data: 503 items (Stage 1 269, Stage 2 234) -> 467 in date -> 466 candidates. 36 Stage 1 items had aged out because `data/items.json` was a day old, so re-run Stage 1 right before the real Stage 3 run | `npm run stage3:prepare` 15 Oct | verified 2026-10-15 |
| Same-story headlines rarely match closely: 0 near-identical-title merges (threshold 0.8) and only 7 same-story groups at 0.5. At 0.35 there are 15 groups of 2-5 outlets (Apple Intelligence in China x4, Alibaba Qwen glasses x3, Duvo funding x3) with one wrong join (two funding stories). Used only for ordering and slicing, so a wrong join is harmless; triage decides the real groups | `data/stage3/candidates.json` clusters at both settings | verified 2026-10-15 (one week of data) |
| The 7 original categories had no home for chips, data centers and research: about 41 of 466 titles mention them (for example CRN "6 Big Intel, AMD And Nvidia AI Data Center Announcements At OCP 2026", TSMC record profit). Category 9 was added | keyword count over candidates, user decision 15 Oct | verified 2026-10-15 (rough keyword count, includes noise) |
| Slice splitter first left a 3-item last slice (12, 12, 12, 3) because it aimed at a fixed size; it now aims at an even share of what is left | `tests/stage3-prepare.test.ts` | verified 2026-10-15 |

## Stage 3 full run, Stage 4 and the AI engine (15 Oct 2026)
| Lesson | Source | Status |
|---|---|---|
| Real run funnel (AI steps by Claude Code agents): 495 items -> 484 candidates -> triage kept 131, dropped 353 -> shortlist 31 plus 20 near-misses -> review kept 23 (9 merged, 19 dropped) -> 18 of 23 pages fetched (4 snippet only, 1 via another outlet) -> 15 stories. Lost at the end: 5 no original source, 2 summary agent skipped as too thin, 1 Reuters item titled just "Artificial Intelligence" | `npm run stage3` smoke run from saved answers, `data/demo-2026-10-15/` | verified 2026-10-15 (one week, one run) |
| Slices cannot see each other, and it shows: the same story appeared under different groups in different slices (Meta Muse Wonder, Figma agent tools, Modal $750M, Alibaba glasses). Without collapsing groups in `rank` and the review pass, one category's shortlist held the same story 4 times. The review agent merged 9 | `data/stage3/shortlist.json` before and after the change | verified 2026-10-15 |
| Thin result categories: category 2 had no story, categories 7 and 9 one each. Causes seen: Pandaily pages could not be fetched (StepFun, Ant Ling-3.1-flash fell back to the snippet and then had no source link); a news outlet's article had no link to the original (EU AI Act probes, Figma, Anthropic self-replication warning from The Verge); Magnific One had an empty snippet and a failed page | `data/stage3/articles.json`, finish report | verified 2026-10-15 (cause of the Pandaily fetch failure not investigated) |
| Chrome 154 prints the PDF headless with `--no-sandbox --disable-gpu --no-pdf-header-footer`; 15 stories gave a cover and about 6 pages. `--no-pdf-header-footer` also removes page numbers | `npm run stage4`, viewed pages 1-3 | verified 2026-10-15 (pages 4 onward not viewed) |
| The machine has 31 GB RAM, 12 cores (i5-1335U), no GPU and no Ollama. Local models would run on CPU only | shell check 15 Oct | verified 2026-10-15 |
| CPU-only speeds from third-party tests: about 8 tokens a second for a 3B model, about 4 for a 7B model. A full run of about 30,000 output tokens would take 1 to 2 hours locally. Our own token count of a run is an estimate | web search results (itsfoss, edge-cpu benchmark), my estimate of run size | from notes (not measured here) |
| Gemini's OpenAI-compatible address is `https://generativelanguage.googleapis.com/v1beta/openai/` (chat at `/chat/completions`, key as Bearer token). Not tested with a real call yet | Google's page ai.google.dev/gemini-api/docs/openai (via web search) | from notes (not tested live) |
| Free-tier limits are unclear and change often: a forum post reports 20 requests a day for the newest Flash model and 500 for Flash-Lite; other sites list Groq about 200,000 tokens a day, OpenRouter free models 50 requests a day, and disagree about Cerebras and Mistral. Free Gemini prompts may be used to improve Google products. Check the provider's own limits page before relying on any number | web search 15 Oct (forum.ai.google.dev, openrouter.ai blog, aggregator sites) | from notes (sources disagree; none verified live) |
| `llm.ts` has offline tests with a fake fetch and a fake command (headers, key never in errors, rate-limit waits, retries, backup models, skip-busy-model, saved answers, command backend) | `tests/llm.test.ts` | verified 2026-10-16 (142 tests pass in total) |

## First live Gemini runs and the live Claude Code rehearsal (15-16 Oct 2026)
| Lesson | Source | Status |
|---|---|---|
| The key works with the OpenAI-compatible address, and `process.loadEnvFile` reads `.env` in Node 23.6. A model list call showed `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-3.5-flash`, `gemini-3.8-flash` among others | live call 15 Oct (key not printed) | verified 2026-10-15 |
| Triage on `gemini-flash-lite-latest` answered all 4 slices (121 items each) in valid form on the first try: about 17k tokens in and 7.5k out per slice, no rate-limit waits. Agreement with the Claude agents on slice 1: keep/drop 87% (105 of 121), category 89% on items both kept; Gemini kept slightly more (45 against 41), mostly score-5 borderline items | `scripts/spikes/compare-triage.ts`, run output 15 Oct | verified 2026-10-15 (one slice, one week) |
| Model availability on the free tier: `gemini-flash-latest` and `gemini-3.5-flash` returned HTTP 503 "high demand" repeatedly for the review and summary calls; `gemini-2.5-flash` returns 404 "no longer available to new users"; `gemini-flash-lite-latest` answered in about 1 s; `gemini-3.5-flash` took 19-31 s for a one-word reply. A 503 costs no tokens (no generation), only time and a request count | probe calls 15 Oct, user's terminal output | verified 2026-10-15 (availability changes by the hour; one key) |
| `reasoning_effort: "low"` was accepted by `gemini-flash-lite-latest` through the OpenAI-compatible endpoint; not confirmed for other models | probe call 15 Oct | verified 2026-10-15 (lite model only) |
| Complete Gemini run on the lite model for all three steps: 52 items reviewed (15.2k tokens in, 3.7k out), 23 selected, 12 stories written. Review choices were weaker than the Claude agents': kept a biotech financing as funding news, a low-quality outlet post and a minor Facebook feature; Chinese open-weights releases were first put in category 6 instead of 7 (the `gemini-3.5-flash` review fixed this) | run output and `data/stage3/review.json` 15 Oct | verified 2026-10-15 (one run) |
| The summary step loses most stories at the original-source rule in every run: morning Claude agents 15 of 23, Gemini 12 of 23, live rehearsal 12 of 23 (about 9 "no original source link found", 2 skipped as too thin). One lite-model summary used a quote that is not in the article (Nvidia OCP); the quote check dropped it | finish reports of the three runs | verified 2026-10-15/16 |
| Live Claude Code rehearsal (fresh data pulled 15 Oct about 19:00 IST): 483 candidates, all four triage answer files valid on the first check, review answer valid, 23 selected, 19 pages fetched; agents took about 1.5 min (triage), 40 s (review) and 25 s (summaries); 12 stories, categories 2 and 7 empty. The agents wrote their own answer files with the Write tool | live run 15 Oct evening | verified 2026-10-15 |
| Anthropic API key environment variables are not set on this machine, so `claude -p` would use the logged-in subscription; Anthropic's billing rules for headless use were not checked | shell check 15 Oct (names only) | verified 2026-10-15 for the machine; billing rules not checked |
