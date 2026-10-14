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
| Google News RSS + link decoder | Decoder uses an undocumented Google endpoint (95 of 95 links decoded on 13 Oct 2026); Google can change it without notice | Decoder fails on fresh links, or items stay as `news.google.com` links | Q15 | Yes |
| Community Anthropic feed | Maintainer can stop | ERROR in 2 runs in a row | Q9 | No (feed plus search) |
| VentureBeat, Pandaily, SCMP fallbacks | Depend on the decoder (Google News gave 100, 48 and 100 items in 7 days); Bing `site:` is a thinner backup | Decoder fails | Q8, Q13 | Only if the decoder breaks |
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
- Status: DEFERRED

## Q8. VentureBeat (feed returns HTTP 429) [Stage 1]
- Lack of resource: no direct access to the feed.
- Decision: use Google News RSS fallback (`news.google.com/rss/search?q=site:venturebeat.com+when:7d`) for now. Needs redirect-link decoding. Marked temporary.
- Catch: depends on the link decoder (Q15); items have title and date only (Q18).
- Update: decoder spike passed (Q15); Google News gave 100 VentureBeat items, 99 within 7 days. Items stay title-only (Q18).
- Trigger: VentureBeat's own feed works again, or the decoder fails (Q15).
- Status: TEMPORARY, revisit after Stage 2

## Q10. YC endpoints are unofficial [Stage 2]
- ycombinator.com/launches JSON and api.ycombinator.com may change without notice. Re-check at build time; Launch HN is the fallback.
- Status: WATCH

## Q11. Is free Google News search good enough? [Stage 2]
- Google News gives title, date and link but no snippet, and may miss official blog pages. Stage 2 now merges Bing News RSS (main, has snippet and date), Google News and Hacker News. GDELT tested and dropped (throttled).
- Check recall during Stage 2 testing (known-news check, 70%). If poor, add a keyed search API via search.ts; Claude web search is the candidate (paid, real URLs, snippets).
- Status: OPEN (checked in Stage 2)

## Q12. No main YC news source exists [Stage 2]
- Tested Oct 2026: no dedicated YC news feed. Cat 4 has YC's launches JSON; cat 8 (other YC news) relies on fallbacks: Google News searches, TechCrunch YC tag feed, YC blog, Hacker News search, YC name tagger. Expect cat 8 to be thin.
- Default decided: keep cats 4 and 8 separate; cat 8 is skipped when empty (Stage 4 must handle a missing section). Startup and funding feeds (Stage 1) plus the YC tagger added as extra sources.
- Trigger: if the known-news check shows cat 8 still too weak, merge cats 4 and 8 or add Claude web search for this lane (Q11).
- Status: DEFAULT APPLIES, re-check after Stage 2 testing

## Q13. Feeds that cannot page: Pandaily (about 2 days) and SCMP (about 3 days) [Stage 1]
- Lack of resource: feeds hold too few days and ignore `?paged=`.
- Default: Google News `site:<domain>+when:7d` fallback. Alternatives: history file (needs more-than-weekly runs) or accept the short window.
- Catch: depends on the link decoder (Q15).
- Update: the decoder spike (Q15) shows Google News plus the decoder reaches 7 days for both (Pandaily 48 items, SCMP 100). Bing `site:` (Stage 2) and Jina Reader (Q7) are backups if the decoder breaks.
- Trigger: decoder fails, then accept the short window and say so in the report.
- Status: DEFAULT APPLIES, verify at build time

## Q9. Anthropic has no official RSS [Stage 1, 2]
- Lack of resource: no official feed.
- Decision: use the community feed (github.com/Olshansk/rss-feeds) for now. Third-party dependency.
- Catch: the maintainer can stop; the Stage 2 backup search also runs through Google News (Q15).
- Update (14 Oct 2026): `raw.githubusercontent.com` was refused from the dev machine; the jsDelivr mirror worked. Stage 1 now tries raw GitHub first and the mirror as `fallback_url`.
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
- Spike result (13 Oct 2026, throwaway script, one machine): 95 of 95 Google News links decoded to real URLs (VentureBeat, SCMP, Pandaily), 0 failures, 1.5 s between links. Google News gave VentureBeat 100, SCMP 100, Pandaily 48 items; 99% within 7 days (one 2022 item, which the date filter drops). Go/no-go: GO. Catch: it relies on an undocumented Google endpoint that can change, so keep the Bing `site:` backup and the health guard.
- Status: WATCH

## Q16. No feed-health guard before Stage 3 [Stage 1]
- Gap: Stage 1 shows ERROR rows, but nothing stops Stage 3 from running (and spending money) on a half-empty `items.json`.
- Proposal: print a loud warning when more than 3 feeds ERROR; optionally stop before Stage 3.
- Suggested by Claude, user delegated: hard stop before any AI call, with `--force` to override (never in scheduled runs). Warn-only was rejected because nobody reads the console in a weekly run, so thin input would give a confident newsletter missing categories. Stopping costs little since downloads are cached. Conditions in SPEC.md Whole pipeline; the minimum item count is set after the first real run.
- Status: DEFAULT APPLIES (change if you disagree)

## Q17. Keyword prefilter can drop real AI stories [Stage 1]
- Gap: on Google, Nvidia, Microsoft and Meta feeds, an AI story without a keyword is dropped as `not_ai` and Stage 3 never sees it.
- Plan: keywords live in config; the report prints the `not_ai` count; you skim the skip log during testing.
- Trigger: a major story is found in the `not_ai` log, then widen the keyword list.
- Status: WATCH

## Q18. Title-only items may be dropped by triage [Stage 1, 3]
- Gap: VentureBeat (Google News) and search items have no snippet. Stage 3 triage sees title and snippet only, and the full article is fetched after triage, so a big story with a vague title may be dropped. Official items can fall back to the snippet; media items cannot.
- Update: Bing results now carry a short description (Stage 2), so only Google News items stay title-only. Stage 3 now falls back to other outlets and snippets when a fetch fails.
- Open: let some title-only media items reach the article fetch before triage drops them.
- Status: OPEN (Stage 3 review)

## Q19. Stage 1 dedupe is exact URL only [Stage 1, 3]
- Gap: same story from different outlets is not merged in Stage 1. Stage 3 step 2 (near-identical title) and triage group ids handle it, with no guarantee.
- Plan: Stage 3 sorts items by title similarity before batching so near-duplicates share a batch (decided). Group ids stay valid only inside a batch. Verify with real same-story groups in Stage 3 testing.
- Optional safety net (only if testing shows leftover duplicates, e.g. same story with very different headlines in different batches): a final code-only dedupe of the shortlist by `source_url`.
- Status: WATCH

## Q20. Search providers are unofficial [Stage 2]
- Lack of resource: no paid search API.
- Workaround: Bing News RSS (main), Google News RSS and Hacker News merged in `search.ts`, so one failing provider does not stop Stage 2. Tested Oct 2026 on a few queries from one machine: Bing links decode 100%, with `qft=interval="7"` all results fall in 7 days, snippet and date present.
- Update: Bing `site:` test (13 Oct 2026, one machine): scmp.com 12, technode.com 7, venturebeat.com 3, pandaily.com 0.
- Catch: Bing and Google can block, throttle or change format without notice; only a small test so far. Re-test about 25 queries from the machine that runs weekly.
- Trigger: known-news check below 70%, or a provider returns errors in 2 runs in a row, then add a keyed API (Q11).
- Status: WATCH
