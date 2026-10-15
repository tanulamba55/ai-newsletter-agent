# Session 14 Oct 2026: Stage 1 built (waiting for acceptance)

## Done
- Stage 1 spec fixed per the audit (new feed addresses, raw GitHub wording, SCMP note, gaps line). Q9 and Stage 2/3 specs untouched.
- `npm install rss-parser zod`; scripts `collect` and `test` added.
- Built: `config/feeds.json`, `config/keywords.json`, `src/stage1-collect.ts`, `src/lib/{schemas,dates,urls,files,rss,prefilter,huggingface,resolveUrl}.ts` (urls.ts and prefilter.ts are small additions to the spec's file list).
- 29 automated tests pass offline (`npm test`), real fixtures in `tests/fixtures/`.
- Two live runs: 386 items, 0 duplicate URLs, none older than 7 days, 0 undecodable links, 7 `not_ai`, 0 undated. Offline replay (`--offline`) gives the same 386.

## Found while building (details in LESSONS.md)
- Google News VentureBeat query is padded with empty-title site files; real count about 31, not 100. Decoder bug with `=`/`&` fixed.
- Hugging Face API was down for the first runs, back later: live run now 0 feeds in ERROR, 393 items.
- SCMP feed is World news: 140 of 386 items, mostly not AI.
- Prefilter dropped a real story (Microsoft Maia 300 chip).
- Outlet name now = feed name.

## Decided later the same day
- Prefilter OFF for Google AI and Microsoft (AI-topic feeds); ON for SCMP. Spec lines updated. Result: 268 items, SCMP 140 -> 10, not_ai 145 (SCMP 140, Meta 4, Nvidia 1). Skim of dropped SCMP titles: no AI model or product story lost; two chip stories (Huawei Kirin, CXMT) dropped as not AI; one false keep (Ilhan Omar story).
- `tests/health.ts` uses the real decoder; spike deleted. Nothing committed yet.
- User accepted the known gaps (Q7, Q8, Q9, Q12, Q13, Q16, Q17). Q7 and Q8 are related only through a possible real-browser tool; user is getting a Firecrawl API key to test KnowTechie and VentureBeat.
- Stage 1 Status line still `approved`; set to `built` when the user confirms.

## Next
- Done later 14 Oct: user ran the manual checks (269 items, 0 ERROR, 29 tests pass) and Stage 1 spec Status is `built`. Docs synced to the build (README, Q7/Q8/Q9/Q13/Q15/Q16/Q17, Stage 1 and Stage 2 spec lines).
- Firecrawl test (Q7/Q8) when the key arrives. Key goes in `.env` (git-ignored); not needed for Stage 1.
- Stage 3 idea (not decided): article fetch fallback chain own fetch -> Jina (free) -> Firecrawl (credits). Firecrawl test (Q7/Q8) result in LESSONS.md: KnowTechie still blocked, VentureBeat feed works but only 3.5 days. Q7/Q8 entries not edited yet.
- Stage 2: requirements being cleared decision by decision (see docs/sessions/2026-10-14-stage2-requirements.md once written). Build only after approval.
