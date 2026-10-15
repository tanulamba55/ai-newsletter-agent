# Session 14 Oct 2026: Stage 2 requirements cleared (not built)

## Done
- Read all docs, code, config, tests, LESSONS and both Stage 1 handoffs.
- Synced docs to the Stage 1 build (README, Q7/Q8/Q9/Q13/Q15/Q16/Q17/Q20, Stage 1 and Stage 2 spec lines, LESSONS pointers, handoff note). Details are in the git diff.
- Re-checked Stage 2 sources (14 Oct, one machine): Bing News RSS, EU digital feed, HN Algolia, Federal Register API, YC launches JSON and YC companies API all answer 200. YC launches: 20 per page, all launches (not only AI), with `company.tags` and `batch`. Federal Register term search returns unrelated notices, so the title filter is needed.

## Decisions (user, 14 Oct) - recorded in docs/specs/stage2-search.md "Decisions made"
1. Google News runs only when Bing errors or returns under about 3 results.
2. Keyword prefilter applies to general-news outlets in the outlet lane.
3. Drop aggregator hosts (msn.com + blocklist); keep Bing's source name as outlet.
4. YC launches: AI/ML-tagged only; url = YC launch page.
5. Hacker News: Launch HN only.
6. 10 results per query; Stage 3 item cap raised to about 500.
7. Stage 2 health file: providers list (shape in SPEC.md).
8. Weekly host = dev machine for now; re-test Bing on the real host before Stage 5 (Q20).
9. Claude drafts `config/searches.json`; user reviews it before build.
10. Meta AI search kept as backup.

## Next
- Draft `config/searches.json` plus a plain table of queries per lane; user skims and edits.
- Then build in order: search tool (`lib/search.ts`), YC lane (`lib/yc.ts`), topic lane, `stage2-search.ts`, tests. Extend `SkippedSchema` (needs `too_old`, `duplicate`) and add a Stage 2 health schema in `src/lib/schemas.ts`. Wait for approval between steps.
- Set Stage 2 Status to `approved` for build when the user confirms the query list.

## Open
- Q10, Q11, Q12, Q20 stay open for Stage 2 testing (known-news check 70%).
- Uncommitted: all doc edits, the two Stage 1 session notes, `scripts/spikes/firecrawl-spike.ts`. Ask before committing.
