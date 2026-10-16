# Open Questions

Answer under "Your answer", then tell Claude: "resolve from open-questions.md".

Each question is tagged with the stage it affects.
Statuses that must be read before building a stage: OPEN, WATCH, TEMPORARY, DEFERRED, DEFAULT APPLIES.
Each entry names the lack of resource or gap, the current workaround, its catch, and a trigger for revisiting.

## Register: works now, may break later
Free workarounds that are fine today but depend on something we do not control. This table only points to the Q entries below; the details (catch, trigger) live there.
"Paid backup?" says whether a paid resource is the planned fix if the trigger fires (see SPEC.md Resources and approvals).

| Workaround | Fragile because | Watch signal | Q | Paid backup? |
|---|---|---|---|---|
| Bing News RSS (main search) | Unofficial; can block or change format; tested on one machine only | Recall under 70%, or errors in 2 runs in a row | Q20 | Yes |
| Google News RSS + link decoder | Decoder uses an undocumented Google endpoint (works on real articles in the 14 Oct live run: 0 undecodable); Google can change it without notice | Decoder fails on fresh links, or items stay as `news.google.com` links | Q15 | Yes |
| Community Anthropic feed | Maintainer can stop | ERROR in 2 runs in a row | Q9 | No (feed plus search) |
| VentureBeat, Pandaily, SCMP fallbacks | Depend on the decoder (14 Oct live run: about 31 real VentureBeat articles, 48 Pandaily, 100 SCMP); Bing `site:` is a thinner backup | Decoder fails | Q8, Q13 | Only if the decoder breaks |
| Jina Reader (backup for Pandaily only) | Free hosted service; 20 requests per minute without a key; terms may change; reported intermittent failures | Errors or empty pages in 2 runs in a row | Q7, Q13 | No (free key, or self-host) |
| YC JSON endpoints | Unofficial; may change | zod check fails | Q10 | No (Launch HN backup) |
| Keyword prefilter | Can drop a real AI story | Major story found in the `not_ai` log | Q17 | No |
| Category 8 (YC news) | No main source exists | Known-news check shows it too weak | Q12 | Maybe |

## Q1. TypeScript or plain JavaScript? [all stages]
- Status: RESOLVED. TypeScript. CLAUDE.md updated.

## Q2. "AI Models (Substack)": which publication? [Stage 1]
- Status: RESOLVED. https://aimodels.substack.com/ -> feed https://aimodels.substack.com/feed (tested: works, 20 items back to Apr 2026, full article text included, posts roughly every few days).

## Q3. YC data source for categories 4 and 8 [Stage 2]
- Status: RESOLVED. Use ycombinator.com/launches JSON (cat 4) + api.ycombinator.com/v0.1/companies (tag YC-backed companies, cat 8). Launch HN is the backup. Cats 4 and 8 stay separate.

## Q4. RSS feeds reach back less than 7 days? [Stage 1]
- Status: RESOLVED (for now). Use pagination (`?paged=N`) until items are older than 7 days. Tested on MarkTechPost. History file is the fallback only if a feed can't paginate.

## Q5. AI engine for Stage 3 and web-search tool for Stage 2 [Stage 2, 3]
- Status: RESOLVED. Claude API (small model for triage, larger for summaries; paid per use, needs an API key and a spend cap). Search = free Google News RSS + Hacker News search.

- Update (15 Oct 2026): superseded by Q21. The engine is now provider-agnostic (SPEC.md AI engine): any provider, free or paid. The Claude API is one possible provider, not a requirement.

## Q6. No original source found for a story [Stage 3]
- Status: RESOLVED. Drop the story, log it in skipped.json.

## Q7. KnowTechie (blocked by Cloudflare at connection level) [Stage 1]
- Lack of resource: no real-browser fetch tool.
- Decision: skip for now, revisit with a real-browser fetch later.
- Catch: source is lost; nothing in Stages 2 or 3 covers it.
- Trigger: a browser tool becomes available, or the known-news check (Stage 2) shows missed KnowTechie stories.
- Tools checked 13 Oct 2026:
  - Jina Reader (free, no key, tested): reads the Pandaily homepage for about 3 days, so it is now only a backup (Google News covers Pandaily, Q13). Does not help VentureBeat (blocked) or KnowTechie (SSL error).
  - Firecrawl (not tested, needs a free key): free plan is 1,000 credits per month, enough for our use. Success on Cloudflare-blocked sites is unproven and reviews disagree.
  - Next step: get a free Firecrawl key and test it on KnowTechie, VentureBeat and one paywalled article.
- Update (14 Oct 2026): Firecrawl tested. KnowTechie still fails (TLS error, Cloudflare); Jina fails too. Firecrawl is stronger than Jina on VentureBeat's feed but costs credits (about 7 used of 1,000). No tool unblocks KnowTechie.
- Status: DEFERRED

## Q8. VentureBeat (feed returns HTTP 429) [Stage 1]
- Lack of resource: no direct access to the feed.
- Decision: use Google News RSS fallback (`news.google.com/rss/search?q=site:venturebeat.com+when:7d`) for now. Needs redirect-link decoding. Marked temporary.
- Catch: depends on the link decoder (Q15); items have title and date only (Q18).
- Update: decoder spike passed (Q15). Corrected 14 Oct 2026: the query returns 100 entries but 69 are empty-title site files; real articles about 31. Items stay title-only (Q18).
- Update (14 Oct 2026, Firecrawl test): Firecrawl fetches VentureBeat's own feed (7 items, about 3.5 days, no paging), so it cannot replace Google News. Could add snippets for the newest days; not built.
- Trigger: VentureBeat's own feed works again, or the decoder fails (Q15).
- Status: TEMPORARY, revisit after Stage 2

## Q10. YC endpoints are unofficial [Stage 2]
- ycombinator.com/launches JSON and api.ycombinator.com may change without notice. Re-check at build time; Launch HN is the fallback.
- Status: WATCH

## Q11. Is free Google News search good enough? [Stage 2]
- Google News gives title, date and link but no snippet, and may miss official blog pages. Stage 2 now merges Bing News RSS (main, has snippet and date), Google News and Hacker News. GDELT tested and dropped (throttled).
- Check recall during Stage 2 testing (known-news check, 70%). If poor, add a keyed search API via search.ts; Claude web search is the candidate (paid, real URLs, snippets).
- Update (15 Oct 2026): Stage 2 live run gave 237 items from free providers (Bing answered 28 of 28 queries). The known-news check (70%) is still to be done by hand; paid web search is deferred for the demo (docs/deferred.md).
- Status: OPEN (checked in Stage 2)

## Q12. No main YC news source exists [Stage 2]
- Tested Oct 2026: no dedicated YC news feed. Cat 4 has YC's launches JSON; cat 8 (other YC news) relies on fallbacks: Google News searches, TechCrunch YC tag feed, YC blog, Hacker News search, YC name tagger. Expect cat 8 to be thin.
- Default decided: keep cats 4 and 8 separate; cat 8 is skipped when empty (Stage 4 must handle a missing section). Startup and funding feeds (Stage 1) plus the YC tagger added as extra sources.
- Trigger: if the known-news check shows cat 8 still too weak, merge cats 4 and 8 or add Claude web search for this lane (Q11).
- Update (15 Oct 2026): category 8 is deferred for the demo (SPEC.md Categories; docs/deferred.md). The Stage 3 YC tagger is cut with it. The YC company list is still cached by Stage 2 (1,712 companies) for when it returns. Cat 4 (YC launches) stays.
- Status: DEFAULT APPLIES, re-check after Stage 2 testing; cat 8 DEFERRED for the demo

## Q13. Feeds that cannot page: Pandaily (about 2 days) and SCMP (about 3 days) [Stage 1]
- Lack of resource: feeds hold too few days and ignore `?paged=`.
- Default: Google News `site:<domain>+when:7d` fallback. Alternatives: history file (needs more-than-weekly runs) or accept the short window.
- Catch: depends on the link decoder (Q15).
- Update: Stage 1 built; Google News plus the decoder reaches 7 days for both (14 Oct live run: Pandaily 48 items, SCMP 100). Verified. Bing `site:` (Stage 2) and Jina Reader (Q7) are backups if the decoder breaks.
- Trigger: decoder fails, then accept the short window and say so in the report.
- Status: DEFAULT APPLIES, verified in the Stage 1 build (14 Oct 2026)

## Q9. Anthropic has no official RSS [Stage 1, 2]
- Lack of resource: no official feed.
- Decision: use the community feed (github.com/Olshansk/rss-feeds) for now. Third-party dependency.
- Catch: the maintainer can stop; the Stage 2 backup search also runs through Google News (Q15).
- Update (14 Oct 2026): `raw.githubusercontent.com` was refused from the dev machine; the jsDelivr mirror worked. Stage 1 now tries raw GitHub first and the mirror as `fallback_url`.
- Update (14 Oct 2026): raw GitHub is intermittent (200 at about 06:30 and 07:30 UTC, refused at 10:54); the jsDelivr `fallback_url` took over with 3 items, as designed. Newest item 8 Oct.
- Trigger: the feed shows ERROR in 2 runs in a row.
- Status: TEMPORARY, revisit after Stage 2 to see if search covers it

## Q14. Skip log: file layout and reason codes [Stage 1, 3]
- Gap: Stage 1 logs `not_ai` items and Stage 3 writes `skipped.json`; Stage 3 would overwrite Stage 1's entries.
- Done: reason codes `not_ai`, `undated`, `undecodable_link` added to SPEC.md.
- Decided (user): one file per stage (`skipped_stage1.json`, `skipped_stage2.json`); Stage 3 writes `skipped.json` merged for your audit. Layout in SPEC.md.
- Status: RESOLVED

## Q15. Google News link decoder is a single point of failure [Stage 1, 2, 3]
- Gap: one helper (`lib/resolveUrl.ts`) serves VentureBeat, Pandaily, SCMP (Stage 1) and Google News search (Stage 2). Stage 3 URL dedupe and the aggregator check also fail on undecoded links.
- Plan: build the decoder first as a spike and test it on 3 saved links. Go/no-go gate: Stage 1 is not "built" until it works or the fallback is chosen.
- If it fails: those 3 feeds fall back to a short window (stated in the report) and Stage 2 needs another search source (Q11, keyed API).
- Update: Stage 2 search now uses Bing first (the real URL is inside its link), so the decoder only matters for Google News links (VentureBeat, Pandaily, SCMP, Google News backup).
- Fixed: the "Stage 3 follows the redirect" line was wrong (Stage 3 has no decode step; an undecodable link is already dropped in Stage 1 as `undecodable_link`). Removed. Backup is now the Stage 2 outlet lane (Bing `site:`): scmp.com 12 results, venturebeat.com 3, pandaily.com 0 (Oct 2026, one machine).
- Stage 1 build result (14 Oct 2026): `lib/resolveUrl.ts` built, gate passed. Live run: 0 undecodable. Real articles: VentureBeat 31, SCMP 100, Pandaily 48. The 13 Oct spike's "95 of 95" counted VentureBeat site files (`/_next/static/...js`) as successes; Stage 1 now ignores empty-title entries and rejects site-file URLs. A decoder bug with escaped `=` and `&` was fixed. Spike deleted.
- Accepted by the user on 16 Oct 2026 as non-blocking for the demo.
- Spike result (13 Oct 2026, throwaway script, one machine, superseded by the line above): 95 of 95 Google News links decoded to real URLs, 0 failures, 1.5 s between links. Google News gave VentureBeat 100, SCMP 100, Pandaily 48 items; 99% within 7 days (one 2022 item, which the date filter drops). Go/no-go: GO. Catch: it relies on an undocumented Google endpoint that can change, so keep the Bing `site:` backup and the health guard.
- Status: WATCH

## Q16. No feed-health guard before Stage 3 [Stage 1]
- Gap: Stage 1 shows ERROR rows, but nothing stops Stage 3 from running (and spending money) on a half-empty `items.json`.
- Proposal: print a loud warning when more than 3 feeds ERROR; optionally stop before Stage 3.
- Suggested by Claude, user delegated: hard stop before any AI call, with `--force` to override (never in scheduled runs). Warn-only was rejected because nobody reads the console in a weekly run, so thin input would give a confident newsletter missing categories. Stopping costs little since downloads are cached. Conditions in SPEC.md Whole pipeline; the minimum item count is set after the first real run.
- Update: built. Stage 1 and Stage 2 write `data/health_stage1.json` and `health_stage2.json`; `npm run stage3:prepare` stops before anything else if more than `max_feeds_error` feeds are in ERROR, both Bing and Google News failed, or fewer than `min_items` items arrived. `--force` overrides it.
- Tested: offline for all three conditions (`tests/stage3-prepare.test.ts`). Live on 16 Oct 2026 on real health files: stop on "too few items" and on "too many feeds in ERROR" (exit code 1, no file deleted), and `--force` went on (limits tightened temporarily in `config/stage3.json`, restored). Not tested live: the "both Bing and Google News failed" condition (offline only).
- Status: RESOLVED (16 Oct 2026)

## Q17. Keyword prefilter can drop real AI stories [Stage 1]
- Gap: on Google, Nvidia, Microsoft and Meta feeds, an AI story without a keyword is dropped as `not_ai` and Stage 3 never sees it.
- Plan: keywords live in config; the report prints the `not_ai` count; you skim the skip log during testing.
- Update (14 Oct 2026): trigger fired once (Microsoft Maia 300 chip dropped). Decision: prefilter OFF for Google AI and Microsoft (AI-topic feeds), ON for Nvidia, Meta and SCMP. Skim of dropped SCMP titles: no AI model or product story lost; two chip stories (Huawei Kirin, CXMT) dropped as not AI; one false keep. User accepted the gap.
- Trigger: a major story is found in the `not_ai` log, then widen the keyword list.
- Status: WATCH

## Q18. Title-only items may be dropped by triage [Stage 1, 3]
- Gap: VentureBeat (Google News) and search items have no snippet. Stage 3 triage sees title and snippet only, and the full article is fetched after triage, so a big story with a vague title may be dropped. Official items can fall back to the snippet; media items cannot.
- Update: Bing results now carry a short description (Stage 2), so only Google News items stay title-only. Stage 3 now falls back to other outlets and snippets when a fetch fails.
- Open: let some title-only media items reach the article fetch before triage drops them.
- Seen in Stage 3 (16 Oct 2026): items with empty or thin snippets still reach triage with only a title; the page fetch after triage falls back to other outlets, then the snippet (Magnific One had an empty snippet and was skipped as too thin in two runs). The open point (let title-only media items reach the fetch before triage drops them) is not built.
- Accepted by the user on 16 Oct 2026 as non-blocking for the demo.
- Status: OPEN (Stage 3 review)

## Q19. Stage 1 dedupe is exact URL only [Stage 1, 3]
- Gap: same story from different outlets is not merged in Stage 1. Stage 3 step 2 (near-identical title) and triage group ids handle it, with no guarantee.
- Plan: Stage 3 sorts items by title similarity before batching so near-duplicates share a batch (decided). Group ids stay valid only inside a batch. Verify with real same-story groups in Stage 3 testing.
- Optional safety net (only if testing shows leftover duplicates, e.g. same story with very different headlines in different batches): a final code-only dedupe of the shortlist by `source_url`.
- Update (16 Oct 2026): built differently. Triage runs in 4 independent slices that cannot see each other, so the same story did appear under different groups (Meta Muse Wonder, Figma, Modal, Alibaba glasses). Now `rank` collapses items of one triage group into one shortlist entry, and the review step merges the rest: it merged 9, 1, 3 and 6 stories in the four runs seen. The `source_url` dedupe was not built. No duplicate stories were found in the final stories of the first two runs (read in full); the later runs' final lists were not checked for this. One week of data.
- Accepted by the user on 16 Oct 2026 as non-blocking for the demo.
- Status: WATCH

## Q20. Search providers are unofficial [Stage 2]
- Lack of resource: no paid search API.
- Workaround: Bing News RSS (main), Google News RSS and Hacker News merged in `search.ts`, so one failing provider does not stop Stage 2. Tested Oct 2026 on a few queries from one machine: Bing links decode 100%, with `qft=interval="7"` all results fall in 7 days, snippet and date present.
- Update: Bing `site:` test (13 Oct 2026, one machine): scmp.com 12, technode.com 7, venturebeat.com 3, pandaily.com 0.
- Catch: Bing and Google can block, throttle or change format without notice; only a small test so far. Re-test about 25 queries from the machine that runs weekly.
- Decided 14 Oct 2026: the weekly host is the dev machine for now. Re-test about 25 queries from the real weekly host before Stage 5 relies on it.
- Update (15 Oct 2026): first full live run (28 queries) from the dev machine: Bing answered all 28 in about 2.5 min with 1 s between queries; 3 queries needed the Google backup. One machine, one run: keep WATCH.
- Trigger: known-news check below 70%, or a provider returns errors in 2 runs in a row, then add a keyed API (Q11).
- Status: WATCH

## Q21. Stage 3 AI engine [Stage 3]
- History: the first plan was the Claude API (Q5), which needs a key and a spend cap approved by your senior. No key existed on 15 Oct 2026, so the first real run used independent Claude Code agents.
- Decision (15 Oct 2026): the engine is provider-agnostic. `src/lib/llm.ts` and `config/llm.json` let any model (free tier or paid, hosted or local, or an agent command) fill the same files in `data/stage3/`. Built and tested offline with a fake AI. Default config points at Gemini (free tier), model name `gemini-flash-latest` (a placeholder, check it in Google AI Studio).
- Live results (15 Oct 2026, Gemini free tier): triage on `gemini-flash-lite-latest` agreed 87% with the Claude agents on keep/drop and 89% on category (slice 1). A full run on the lite model gave 12 stories (Claude agents: 15). `gemini-flash-latest` and `gemini-3.5-flash` returned HTTP 503 "high demand" repeatedly; `gemini-2.5-flash` is closed to new keys; `gemini-3.5-flash` is slow. Busy-model handling (saved answers, backup list, skip-busy, clean stop) was added after this and is tested offline only (LESSONS.md).
- Still open: (1) the new busy-model handling has not run against the real API; (2) free-tier limits are unverified and change often, and free prompts may be used by the provider (our input is public news text); (3) the demo data comes from Claude Code agents, not from the model in `config/llm.json`, so say so in the demo; (4) a weaker model writes weaker review choices (kept a non-AI funding story and a low-quality outlet); the quote and source checks catch some errors, not all.
- Trigger: before the first scheduled weekly run, do one complete run through `llm.ts` on the chosen model and compare its stories with `data/demo-2026-10-15/stories.json`; if quality is clearly worse, pick another provider or a stronger model in `config/llm.json`.
- Accepted by the user on 16 Oct 2026 as non-blocking for the demo. For a scheduled weekly run it stays a watch item (trigger above).
- Status: WATCH (built and run live once on Gemini; weekly use not yet tested)
