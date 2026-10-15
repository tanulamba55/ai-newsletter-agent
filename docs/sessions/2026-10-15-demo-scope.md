# Session 15 Oct 2026: Stage 2 built, demo scope set

## Done
- Stage 2 built (search tool, YC lane, government sources, main script) with 73 offline tests; live run: 237 items, 0 providers in ERROR, about 2.5 min, offline replay identical (details in docs/specs/stage2-search.md "Built and first live run" and LESSONS.md).
- Answered two review questions: Federal Register is low-yield but not broken (5 full-text hits, none with AI in the title); Chinese-language titles are kept (the English keyword filter must not be used to drop them).
- New requirement: demo on 16 Oct 2026, Stages 1-3 at least, Stage 4 if possible, free resources only. Decisions: the AI steps of Stage 3 run as independent Claude Code agents (no API key; Q21); category 8 and the YC tagger are cut; everything cut is in docs/deferred.md.
- Docs updated for this: SPEC.md (categories, AI engine, resources), stage specs 2, 3, 4, 5, open-questions (Q5, Q11, Q12, Q20, new Q21), LESSONS.md, README.

## Stage 2 closed (15 Oct, later the same day)
YC launch kept if AI tag OR AI keyword in title or tagline; note.com added to the aggregator list; one noisy query split into two (29 queries). Final live run 234 items, 0 ERROR, offline replay identical, 74 tests pass. User did the manual checks and accepted the known gaps (Q10, Q11, Q12, Q15, Q20). Stage 2 Status is `built`. Committed in two commits (Stage 2 code and tests; docs).

## Next (order from the approved plan)
1. ~~Stage 2 finishing touches and commit~~ (done, see above).
2. Stage 3: `stage3-prepare.ts` -> triage by independent agents (`docs/prompts/stage3-triage.md`) -> `stage3-rank.ts` -> summaries by independent agents (`docs/prompts/stage3-summary.md`) -> `stage3-finish.ts`.
3. Stage 4: `render.ts` and `stage4-pdf.ts` (headless Chrome). Checkpoints: after Stage 3 data, after the PDF.

## Open
- Nothing committed yet: Stage 2 code, configs, fixtures, docs, session notes. The Firecrawl spike stays out of commits unless the user says otherwise.
- Q10, Q11, Q12, Q15, Q20 to be accepted for Stage 2; Q21 (API key and spend cap) needs the senior.
- CLAUDE.md "wait for approval after each stage" is compressed to three checkpoints today; CLAUDE.md itself is unchanged.
