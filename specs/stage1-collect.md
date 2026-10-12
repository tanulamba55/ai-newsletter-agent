# Stage 1: Collect RSS items

Status: approved (plan) - not built
Depends on (SPEC.md): Selection rules (7-day window), Item contract

## Purpose
Pull the last 7 days of headlines from media and official RSS feeds into one file.

## Input
`config/feeds.json`: list of `{name, url, type: media|official, region?}`.

## Output
`data/items.json`: list of Items (see SPEC.md).
Console table per feed: status (OK/ERROR), item count, oldest and newest date.

## Sources

Media (type "media"):
- MarkTechPost: `https://www.marktechpost.com/feed/` (paged)
- AI Business: `https://aibusiness.com/rss.xml`
- AI Models (Substack): `https://aimodels.substack.com/feed`
- VentureBeat: Google News RSS fallback `news.google.com/rss/search?q=site:venturebeat.com+when:7d` (own feed returns HTTP 429; temporary, Q8)
- KnowTechie: skipped (blocked by Cloudflare, Q7)

China media (type "media", region "china"): SCMP tech `scmp.com/rss/5/feed`, TechNode `technode.com/feed/`, Pandaily `pandaily.com/feed/`, ChinaTalk `chinatalk.media/feed`.

Official (type "official"): OpenAI `openai.com/news/rss.xml`, Google `blog.google/technology/ai/rss/`, Nvidia `blogs.nvidia.com/feed/`, Hugging Face `huggingface.co/blog/feed.xml`, Mistral `mistral.ai/rss.xml`, Apple ML `machinelearning.apple.com/rss.xml`, Meta `about.fb.com/news/feed/`, Microsoft `news.microsoft.com/source/topics/ai/feed/`, Anthropic via community feed `Olshansk/rss-feeds` (temporary, Q9).

YC (type "media", lane "yc"): TechCrunch Y Combinator tag `techcrunch.com/tag/y-combinator/feed/` (sparse), YC blog `ycombinator.com/blog/rss` (mostly YC corporate news). See Stage 2 for the missing-main-source flag.

Feeds that cannot page (tested Oct 2026): Pandaily (about 2 days) and SCMP (about 3 days) use `paging: google-news`.

No feed (covered by Stage 2 search): AMD, Databricks, Meta AI blog, Chinese AI labs.

## Steps
1. Read feeds.json.
2. For each feed: download with a browser-like User-Agent; read entries; one bad feed never stops the run.
3. Paging: each feed has a `paging` setting in feeds.json: `paged` (fetch `?paged=N` until items are older than 7 days, max about 15 pages), `none-needed` (feed already reaches 7+ days) or `google-news` (feed cannot page; use Google News `site:<domain>+when:7d` instead).
4. Keep items from the last 7 days; normalize dates to UTC; drop items with no date (and report).
4b. Keyword prefilter, only for official feeds that are not AI-only (Google, Nvidia, Microsoft, Meta): keep items matching AI keywords; log the rest in skipped.json as `not_ai`.
5. Decode Google News redirect links to real article URLs (shared helper `lib/resolveUrl.ts`).
6. Clean URLs, remove exact duplicates, write items.json, print the report.

## Files
`src/stage1-collect.ts`, `src/lib/rss.ts`, `src/lib/dates.ts`, `src/lib/resolveUrl.ts`, `src/lib/files.ts`, `src/lib/schemas.ts`.

## Decisions made
- Pagination for short feeds; history file only if a feed cannot paginate (Q4).
- Rolling 7 days from run time.

## Success check
A file with a week of headlines from every working feed; report shows each feed's status and date range.

## Known facts from testing (Oct 2026)
- MarkTechPost holds 10 items (about 2 days); `?paged=5` reaches 28 Sep.
- AI Business holds 50 items (about a month).
- AI Models Substack: 20 items back to Apr 2026, full text included.
- Google News links may use JS redirects: test decoding early.

## Tools
All free. Node 23.6 built-in `fetch` and `node:test`; `rss-parser` (read RSS and Atom); `zod` (JSON shapes). Stage 1 needs no AI and no paid service.

## Risks (top first)
1. **Feed blocked or rate-limited** (VentureBeat 429, KnowTechie, Databricks 403). Send a browser User-Agent, retry once after a pause, one bad feed never stops the run. Early check: re-test URLs at build time.
2. **Google News links will not decode** (JS redirect). Build the decoder first as a small spike. Fallback: Stage 3 follows the redirect when fetching.
3. **A feed cannot page** (tested: Pandaily about 2 days, SCMP about 3 days, both ignore `?paged=`). Cap paging at about 15 pages; stop at items older than 7 days. Fallback ladder: (1) Google News `site:<domain>+when:7d` (default); (2) history file, only works if Stage 1 runs more often than weekly; (3) accept the short window and print it in the report.
4. **Bad or missing dates** let old stories in. Normalize to UTC, drop undated, count them in the report.
5. **Noisy official feeds** (Google, Nvidia, Microsoft, Meta) raise AI cost. Keyword prefilter for those feeds only; skipped items logged.
6. **A feed disappears** (community Anthropic feed, Q9). Per-feed ERROR in the report.
7. **HTML junk in snippets.** Strip tags.

## Testing
- **Automated** (saved real feed files in `tests/fixtures/`, no network): date window; RSS and Atom parsing; undated item dropped; bad feed isolated; paging stops; URL cleaning; Google link decoding on 3 saved examples; prefilter.
- **You (manual):** run once and read the table; spot-check 5 items (real link, within 7 days); run twice and confirm no duplicate URLs; break one URL in feeds.json and confirm only that feed shows ERROR; confirm MarkTechPost's oldest item is about 7 days old; for Pandaily and SCMP confirm the fallback gives 7 days or the report states the short window honestly.
- **Pass:** every working feed OK; date range covers 7 days (or the report says how far back); 0 duplicate URLs.

## Out of scope
Summaries, categories, search (Stages 2 and 3).
