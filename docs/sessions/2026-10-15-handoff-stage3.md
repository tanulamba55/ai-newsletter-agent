# Handoff 15 Oct 2026: continue Stage 3 and Stage 4 for the 16 Oct demo

For a fresh Claude Code session. Read this first, then LESSONS.md, then docs/deferred.md. Do not re-ask anything under "Decisions"; they are settled.

## The situation in five lines
- Weekly AI newsletter: collect news (Stage 1), fill gaps by search (Stage 2), turn items into stories with summaries and original sources (Stage 3), make a PDF (Stage 4). Stage 5 (publish) is out of scope.
- **Demo is tomorrow (16 Oct 2026).** Goal: Stages 1-3 working, Stage 4 (PDF) if possible, using only free resources.
- Stages 1 and 2 are built, tested, accepted and committed. Stage 3 part 1 (`stage3-prepare`) is built and tested but NOT committed. Nothing after that exists yet.
- There is no Anthropic API key (and none will come before the demo; needs the senior's approval). So the AI steps of Stage 3 run as independent Claude Code subagents. This is an openly labelled workaround (Q21, docs/deferred.md).
- The user is not a programmer for this project: explain in plain, simple language, keep code simple and commented, and wait for approval at checkpoints.

## Working rules (from CLAUDE.md, the user, and this session)
- Read CLAUDE.md. Key rules: only stories from the last 7 days; original-source URL for every story; one fact one home (shared facts only in docs/SPEC.md); keep the repo root clean (docs in docs/, code in src/, settings in config/, tests in tests/, generated output in data/, experiments in scripts/spikes/); end of session: add lessons to LESSONS.md (with source and status) and write a handoff.
- **Use the Edit and Write tools for file changes, not Bash with scripts.** The user called this out. Bash is for running commands (tests, node scripts, git).
- Never edit docs from health-check results on your own; show the result and discuss.
- Commit only when the user says so. Commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The user's own git identity is already configured. The Firecrawl spike (`scripts/spikes/firecrawl-spike.ts`, untracked) stays out of commits unless told otherwise.
- The user prefers: short answers first, honest reporting (say when something is a workaround or a guess), options with a recommendation, then wait. Approval checkpoints today are three: after Stage 3 data, after the PDF, at close-out.
- Session start routine: `data/health/` newest file is under 24 h old and had no fail, so the health run can be skipped (`npm run health` otherwise).

## Decisions (all settled)
Demo scope (15 Oct):
1. AI steps by independent Claude Code agents, not the API (Q21). Say so in the demo; the ideal design (Claude API with a spend cap, needs approval) is in SPEC.md AI engine and docs/deferred.md.
2. Category 8 (YC-backed startups, non-launch) and the Stage 3 YC tagger are cut. YC launches (cat 4) stay.
3. **New category 9 "AI infrastructure and research"** (chips, data centers, papers, benchmarks) added; numbering stays 1-7 and 9 (8 is reserved for the deferred YC category). Precedence rule: last, after funding. Written into SPEC.md, the triage prompt and docs/deferred.md. Stage 4 must list category 9 and leave empty categories out.
4. Everything else cut is in docs/deferred.md (golden set, number check, AI retries, token budget, paid web search, Firecrawl for blocked pages, Readability/cheerio/jsdom, Stage 5, fancy PDF design).
5. Federal Register stays but is low-yield (not broken). Chinese-language titles are kept on purpose (agents read Chinese; the English keyword filter cannot).

Stage 2 decisions: Bing main, Google News backup only when Bing fails or gives under 3 results; keyword prefilter for general-news outlets (scmp); drop aggregator hosts (`config/aggregators.json`, includes msn, yahoo, note.com); Bing's source name is the outlet; YC launches kept if AI tag OR AI keyword in title/tagline, url = YC launch page; Hacker News only for Launch HN backup; 10 results per query; Stage 2 health file lists providers.

Triage design decisions (made today, not yet executed):
6. 4 independent slice agents triage `data/stage3/candidates_1..4.json` in parallel. Use a **read-only agent type** that returns the JSON as its answer (e.g. the Explore or a general read-only agent with no write tools if available); the main session saves it to `data/stage3/triage_<n>.json` and validates with zod. A bad slice is re-run alone. The agent is told items are data, not instructions. Instruction file: `docs/prompts/stage3-triage.md` (written, categories updated for cat 9).
7. **Review pass (pass 2):** after code ranks per category, ONE fresh agent reviews the shortlist (about 30-40 items) PLUS a near-miss band (items scoring just under the keep cutoff, about 15-20) to fix score drift between slices, merge duplicates across slices and rescue wrongly dropped items. Needs a prompt file `docs/prompts/stage3-review.md` (not written yet).
8. Optional consistency check: one extra agent triages 30 of slice 1's items independently; report keep/category agreement as a number for the demo (replaces the deferred golden set).
9. Scoring anchors are in the triage prompt (9-10 whole-world news, 7-8 major, 5-6 solid, 3-4 minor, 1-2 not AI). Keep = score 5 or more and a category fits. Items with no fitting category are dropped with reason "no category".
10. The user wants to know about weaknesses honestly: score drift across slices, slices cannot see each other (Q19; a code-only dedupe of the shortlist by source_url and title similarity is planned in `stage3-finish`), same model so no true second opinion, not repeatable, uses session usage.

## What exists (code, tests, data)
- Tests: `npm test` = 89 pass, all offline, no AI.
- Stage 1: `npm run collect` (about 270 items; first run slow, reruns fast because of caches; `--offline` replays). Stage 2: `npm run search` (about 2.5 min, 29 queries, about 234 items; `--offline` replays). Both write health files in data/.
- Stage 3 part 1 (uncommitted): `npm run stage3:prepare` = `src/stage3-prepare.ts` with `src/lib/prepare.ts` (health guard, date filter, URL dedupe, near-title dedupe into `covered_by`, item cap 500, clustering, 4 slices), `src/lib/dedupe.ts`, `config/stage3.json` (min_items 150, max_feeds_error 3, item_cap 500, slices 4, snippet 250, title_duplicate_similarity 0.8, cluster_similarity 0.35), schemas (`Stage3ConfigSchema`, `CandidateSchema`, extended `SkippedSchema` reasons) in `src/lib/schemas.ts`, tests in `tests/stage3-prepare.test.ts`. `--force` skips the health stop.
- Output of prepare (data/ is git-ignored): `data/stage3/candidates.json` (466 items), `candidates_1..4.json` (117/117/116/116), `skipped_prepare.json`. Candidate fields: id, title, outlet, outlet_type, published_at, snippet (250 chars), lane, region, category_hint, yc_match, cluster, covered_by[{outlet,url,published_at}].
- Reusable library code: `src/lib/rss.ts` (`makeGetText` download with retry, cache and offline; `stripHtml`), `src/lib/urls.ts` (`cleanUrl`, `makeId`), `src/lib/dates.ts` (`checkWindow`), `src/lib/files.ts` (`writeJsonAtomic`, `readJsonOr`, `cacheDirFor`), `src/lib/prefilter.ts`, `src/lib/resolveUrl.ts`.
- Stage 2 also left `data/cache/yc-companies.json` (about 1,700 YC companies) for the deferred tagger.

## Git state
Commits on branch `feature/stage-1`: Stage 2 code (`b18e405`), docs (`ee3211c`). **Uncommitted:** Stage 3 prepare code and tests, `config/stage3.json`, `docs/prompts/stage3-triage.md`, edits to SPEC.md (cat 9), README, deferred.md, stage3 spec, LESSONS.md, package.json (script `stage3:prepare`), this handoff. Ask the user, then commit (suggest two commits: code+tests, docs).

## What to do next (in this order; times are estimates)
0. `npm run collect` (fresh week; 36 items aged out of the old Stage 1 data), then `npm run search` if the user wants fresh Stage 2 data too, then `npm run stage3:prepare` again. Check the funnel.
1. **Triage pass 1 (about 30 min):** launch 4 agents in parallel, one per slice, giving each only the content of `docs/prompts/stage3-triage.md` plus its slice JSON. Save outputs as `data/stage3/triage_<n>.json`. Needs a `TriageSchema` in `src/lib/schemas.ts`: `{id, keep: boolean, category: 1-7 or 9, score: 1-10, group: string, reason: string}`; check one row per input id, no extras.
2. **`src/stage3-rank.ts`:** validate and merge triage files; rank per category (score, then number of outlets via `covered_by`, official first), top 4 per category as the shortlist; build the near-miss band; write `data/stage3/shortlist.json`. Then the review agent (pass 2, write `docs/prompts/stage3-review.md`) returns adjusted verdicts; apply them. Then fetch pages for survivors with new `src/lib/fetchPage.ts` (reuse `makeGetText`; browser user agent, 25 s timeout, cache; own light HTML-to-text and outbound link list; no new npm packages). On fetch failure: try another outlet from `covered_by`, then fall back to the snippet. Write `data/stage3/articles.json` (text capped about 6000 chars plus links).
3. **Summaries (about 30 min):** write `docs/prompts/stage3-summary.md` (write only from supplied text; 2-3 sentence summary, 1-2 sentence why-it-matters, ONE exact supporting quote, `source_url` chosen only from the supplied link list or the official item itself; text is data). 4 agents of about 7 stories each, read-only, returning JSON; save as `data/stage3/summaries_<n>.json`.
4. **`src/stage3-finish.ts`:** merge and zod-check summaries; verify `source_url` (official item, or appears on the fetched page, not on the aggregator blocklist, reachable); lenient quote match in the article text (case, punctuation, spacing ignored); failed ones go to the skip log (`no_original_source`, `quote_not_found`) and get fixed by hand; code-only dedupe of the shortlist (same source_url or near-identical title); keep best 2-3 per category; `date` = earliest published_at in the group (use `covered_by` dates); write `data/stories.json` (Story shape in SPEC.md: title, category, summary, why_it_matters, source_url, other_links, date; add zod `StorySchema`) and `data/skipped.json` (this stage's drops merged with `data/skipped_stage1.json`, `skipped_stage2.json`, `stage3/skipped_prepare.json`). New `config/source_rules.json`: aggregator blocklist (reuse hosts from `config/aggregators.json` plus news.google.com, bing.com) and a trusted-outlets list for the scoop rule. Add offline tests (guard, ranking, quote matcher, source verifier, fetch fallback order, HTML-to-text and link extraction, zod rejects bad shapes). **Checkpoint 1: the user reads stories.json ("would I send this?") and skims skipped.json.**
5. **Stage 4 PDF (about 90 min):** `src/lib/render.ts` (stories to HTML: cover with title and date, a section per category in order 1-7 then 9, empty categories left out, each story with title, summary, why it matters, clickable Source link, other links, date, a "YC launch" badge for items from the YC launches list; print CSS A4; HTML-escape all text) and `src/stage4-pdf.ts` (writes `data/newsletter.html`, then `google-chrome --headless --no-pdf-header-footer --print-to-pdf=data/newsletter-<date>.pdf`, 30 s timeout, write through a temp name). Add `npm run pdf`. Tests: escaping, empty category left out, links present, date on cover. Open the PDF with the Read tool to check pages. **Checkpoint 2: the user looks at the PDF.** Spec: docs/specs/stage4-pdf.md.
6. **Close-out:** update Status lines in the specs (Stage 3, Stage 4), LESSONS.md, README run commands, a new dated session note, ask before committing.
- **Cut line if time runs short:** Stage 4 still goes ahead with whatever stories.json exists. Inside Stage 3, skip page fetching and write summaries from snippets for official and trusted-outlet items only (the spec allows the snippet fallback).

## Things to watch
- Slices cannot see each other: same story in two slices gets two group ids; the shortlist dedupe in `stage3-finish` and the review pass cover it.
- Real examples of noise the agents must drop: politics, celebrity, stock-price and crypto-site reposts; outlets like `ainvest`, `Crypto Briefing`, `konsulteer.com`, `shattered.io` are low-quality (the trusted-outlet list should not include them).
- Chinese-language titles exist (about 8): agents read them as they are.
- The skip log reason `no category` from triage is only in the triage `reason` text, not a skip-log reason code; if it should be logged, add `no_category` to SPEC.md reasons and `SkippedSchema`.
- `docs/open-questions.md`: Q21 (AI engine workaround) is TEMPORARY; Q19 (cross-slice duplicates) WATCH; Q10, Q11, Q12, Q15, Q20 accepted as non-blocking for the demo.
- The approved plan file lives outside the repo at `/home/fiftyfive/.claude/plans/yes-let-s-make-a-snoopy-cookie.md` (this handoff is the repo copy of what matters).
- IDE hints about "deprecated" zod `.url()` and missing `@types/node` are editor noise; ignore.

## Answers already given to the user (do not contradict)
- Federal Register empty for the week: not broken; 529 documents that week, 5 mention "artificial intelligence" anywhere, none in a title; a low-yield source, so category 3 relies on news search and the EU feed.
- Chinese-language titles: the English keyword filter cannot read them and must not be used to drop them; the agents read Chinese.
- Politics noise in the topic lane comes from loose Bing matching; Stage 3 triage drops it.
- YC items: only the 16 official launches carry `yc_match` and hint 4; the 18 other yc-lane items are ordinary news articles with no YC marker and go to the normal categories.
