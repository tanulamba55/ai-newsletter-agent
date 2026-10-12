# Open Questions

Answer under "Your answer", then tell Claude: "resolve from open-questions.md".

Each question is tagged with the stage it affects.

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
- Decision: skip for now, revisit with a real-browser fetch later.
- Status: DEFERRED

## Q8. VentureBeat (feed returns HTTP 429) [Stage 1]
- Decision: use Google News RSS fallback (`news.google.com/rss/search?q=site:venturebeat.com+when:7d`) for now. Needs redirect-link decoding. Marked temporary.
- Status: TEMPORARY, revisit after Stage 2

## Q10. YC endpoints are unofficial [Stage 2]
- ycombinator.com/launches JSON and api.ycombinator.com may change without notice. Re-check at build time; Launch HN is the fallback.
- Status: WATCH

## Q11. Is free Google News search good enough? [Stage 2]
- Gives title, date and link but no snippet, and may miss official blog pages. Check recall during Stage 2 testing; swap to a keyed search API via search.ts if poor.
- Status: OPEN (checked in Stage 2)

## Q12. No main YC news source exists [Stage 2]
- Tested Oct 2026: no dedicated YC news feed. Cat 4 has YC's launches JSON; cat 8 (other YC news) relies on fallbacks: Google News searches, TechCrunch YC tag feed, YC blog, Hacker News search, YC name tagger. Expect cat 8 to be thin.
- Decision needed later: if the known-news check shows cat 8 too weak, merge cats 4 and 8, or keep it and skip when empty.
- Status: OPEN (checked in Stage 2 testing)

## Q13. Feeds that cannot page: Pandaily (about 2 days) and SCMP (about 3 days) [Stage 1]
- Default: Google News `site:<domain>+when:7d` fallback. Alternatives: history file (needs more-than-weekly runs) or accept the short window.
- Status: DEFAULT APPLIES, verify at build time

## Q9. Anthropic has no official RSS [Stage 1, 2]
- Decision: use the community feed (github.com/Olshansk/rss-feeds) for now. Third-party dependency.
- Status: TEMPORARY, revisit after Stage 2 to see if search covers it
