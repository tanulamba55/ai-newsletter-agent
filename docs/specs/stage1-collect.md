# Stage 1: Collect RSS items

Status: built (14 Oct 2026; 29 automated tests pass, user manual checks passed; not yet run in an end-to-end week)
Depends on (SPEC.md): Selection rules (7-day window), Item contract
Known gaps (open-questions.md): Q7, Q8, Q9, Q12 (thin YC sources), Q13, Q15 (decoder gate), Q16, Q17. Q18 and Q19 are Stage 3 gaps

## Purpose
Pull the last 7 days of headlines from media and official RSS feeds into one file.

## Input
`config/feeds.json`: list of `{name, url, type: media|official, paging: paged|none-needed|google-news, region?, lane?, fallback_url?, kind?}`. `kind` is `rss` (default) or `hf-models` (Hugging Face API; `url` is replaced by `org`). `fallback_url` is tried once if the main address fails.

## Output
`data/items.json`: list of Items (see SPEC.md).
Console table per feed: status (OK/ERROR), item count, oldest and newest date.
Also `data/skipped_stage1.json` (dropped items) and `data/health_stage1.json` (health guard, see SPEC.md Whole pipeline).

## Sources

Media (type "media"):
- MarkTechPost: `https://www.marktechpost.com/feed/` (paged)
- AI Business: `https://aibusiness.com/rss.xml`
- AI Models (Substack): `https://aimodels.substack.com/feed`
- TechCrunch AI: `https://techcrunch.com/category/artificial-intelligence/feed/` (daily; added 14 Oct 2026)
- VentureBeat: Google News RSS fallback `news.google.com/rss/search?q=site:venturebeat.com+when:7d` (own feed returns HTTP 429; temporary, Q8)
- KnowTechie: skipped (blocked by Cloudflare, Q7)

China media (type "media", region "china"): SCMP `https://www.scmp.com/rss/5/feed/` (the address without the slash redirects; general news, not only AI: keyword prefilter on, decided 14 Oct 2026, because it was 140 of 386 items and Stage 3 has an item cap), TechNode `technode.com/feed/`, Pandaily `pandaily.com/feed/`, ChinaTalk `chinatalk.media/feed`.

Official (type "official"): OpenAI `openai.com/news/rss.xml`, Google AI `blog.google/innovation-and-ai/technology/ai/rss/` (old address redirects here), Nvidia `blogs.nvidia.com/feed/`, Hugging Face `huggingface.co/blog/feed.xml`, Mistral `mistral.ai/news/rss` (old address redirects here), Apple ML `machinelearning.apple.com/rss.xml`, Meta `about.fb.com/news/feed/`, Microsoft `news.microsoft.com/source/topics/ai/feed/`, Anthropic via community feed `Olshansk/rss-feeds` (`raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml` first; jsDelivr mirror `cdn.jsdelivr.net/gh/Olshansk/rss-feeds@main/feeds/feed_anthropic_news.xml` as `fallback_url`; temporary, Q9).

YC (type "media", lane "yc"): TechCrunch Y Combinator tag `techcrunch.com/tag/y-combinator/feed/` (sparse), YC blog `ycombinator.com/blog/rss` (mostly YC corporate news). See Stage 2 for the missing-main-source flag.

Lab model releases (type "official", kind `hf-models`, region "china" for Chinese labs): Hugging Face API `https://huggingface.co/api/models?author=<org>&sort=createdAt&direction=-1&limit=50`, free, no key. Replaces GitHub release feeds (tested 14 Oct 2026: Qwen, Kimi, GLM, MiniMax have no GitHub releases and DeepSeek's last was 2025). Each model becomes an Item: title = model id, url = `https://huggingface.co/<id>`, published_at = `createdAt`, snippet = pipeline tag and library if present. Orgs, China: deepseek-ai, Qwen, moonshotai, zai-org, MiniMaxAI, tencent, baidu, ByteDance-Seed, XiaomiMiMo, stepfun-ai, inclusionAI. Orgs, open-weights: mistralai, meta-llama, openai, google, allenai. Skipped as noisy: nvidia (9 checkpoint uploads in one week; it has a blog feed), microsoft. Releases are not news, so triage judges them like any item. Catch: `createdAt` is when the repo was created, so a model made public later can look older than its release (watch in testing).

Startup and funding (type "media", lane "yc"): general startup and funding feeds (TechCrunch Startups `techcrunch.com/category/startups/feed/` and Crunchbase News `news.crunchbase.com/feed/`, both tested 14 Oct 2026). They exist so the YC tagger (Stage 3) can pick out YC-backed companies for cat 8.

Feeds that cannot page (tested Oct 2026): Pandaily (about 2 days) and SCMP (about 3 days) use `paging: google-news`.

No feed (covered by Stage 2 search): AMD, Databricks, Meta AI blog, Chinese AI labs.

## Steps
1. Read feeds.json.
2. For each feed: download with a browser-like User-Agent; read entries; one bad feed never stops the run.
2b. If the main address fails (connection error or HTTP error) and the feed has a `fallback_url`, try it once before marking the feed ERROR; the health file records that the fallback fired. `hf-models` feeds call the Hugging Face API instead of reading RSS.
3. Paging: each feed has a `paging` setting in feeds.json: `paged` (fetch `?paged=N` until items are older than 7 days, max about 15 pages), `none-needed` (feed already reaches 7+ days) or `google-news` (feed cannot page; use Google News `site:<domain>+when:7d` instead).
4. Keep items from the last 7 days; normalize dates to UTC; drop items with no date (log `undated`, count in the report).
4b. Keyword prefilter, only for general (not AI-only) feeds flagged `prefilter` in feeds.json: Nvidia, Meta and SCMP. Google AI and Microsoft are AI-topic feeds and are not filtered (the filter wrongly dropped the Microsoft Maia 300 chip story, 14 Oct 2026): keep items matching AI keywords; log the rest as `not_ai` in `data/skipped_stage1.json` (print the count in the report, Q17).
5. Decode Google News redirect links to real article URLs (shared helper `lib/resolveUrl.ts`). A link that cannot be decoded is logged `undecodable_link`. Build and test this first as a go/no-go spike (Q15).
6. Clean URLs, remove exact duplicates, write items.json, `skipped_stage1.json` and `health_stage1.json`, print the report (feeds in ERROR and fallbacks that fired are listed).

## Files
`src/stage1-collect.ts`, `src/lib/rss.ts`, `src/lib/huggingface.ts`, `src/lib/dates.ts`, `src/lib/resolveUrl.ts`, `src/lib/files.ts`, `src/lib/schemas.ts`.

## Decisions made
- Pagination for short feeds; history file only if a feed cannot paginate (Q4).
- Rolling 7 days from run time.

## Success check
A file with a week of headlines from every working feed; report shows each feed's status and date range.

## Known facts from testing (Oct 2026)
- MarkTechPost holds 10 items (about 2 days); `?paged=5` reaches 28 Sep.
- AI Business holds 50 items (about a month).
- AI Models Substack: 20 items back to Apr 2026, full text included.
- All 18 listed feeds responded on 14 Oct 2026. AI Models Substack and Mistral had nothing newer than 6 Oct (quiet, not broken). TechCrunch AI, TechCrunch Startups and Crunchbase News also work.
- Anthropic community feed: `raw.githubusercontent.com` was refused once from the dev machine (connection reset) but returned 200 on 14 Oct; may be intermittent. The jsDelivr mirror stays as `fallback_url` (newest item 8 Oct).
- Hugging Face API, last 7 days: Qwen 1, tencent 1, mistralai 2, nvidia 9, most other labs 0 (sparse, low noise).
- Google News links need decoding. Live run (14 Oct 2026): decoder works on real articles (VentureBeat 31, SCMP 100, Pandaily 48, 0 undecodable). The VentureBeat query returns 100 entries but 69 are empty-title site files, which Stage 1 ignores (Q15). The 13 Oct spike figure "95 of 95" counted those files as successes.

## Tools
All free. Node 23.6 built-in `fetch` and `node:test`; `rss-parser` (read RSS and Atom); `zod` (JSON shapes). Stage 1 needs no AI and no paid service.

## Risks (top first)
1. **Feed blocked or rate-limited** (VentureBeat 429, KnowTechie, Databricks 403). Send a browser User-Agent, retry once after a pause, one bad feed never stops the run. Early check: re-test URLs at build time.
2. **Google News links will not decode** (JS redirect). Build the decoder first as a small spike. Fallback: the Stage 2 outlet lane (Bing `site:` queries, real URLs) covers SCMP and VentureBeat; Pandaily has no free alternative, so accept the short window and say so in the report (Q13, Q15). Stage 3 does not decode Google News links.
3. **A feed cannot page** (tested: Pandaily about 2 days, SCMP about 3 days, both ignore `?paged=`). Cap paging at about 15 pages; stop at items older than 7 days. Fallback ladder: (1) Google News `site:<domain>+when:7d` (default; if the decoder fails, the Stage 2 outlet lane covers SCMP and VentureBeat); (2) history file, only works if Stage 1 runs more often than weekly; (3) accept the short window and print it in the report.
4. **Bad or missing dates** let old stories in. Normalize to UTC, drop undated, count them in the report.
5. **Noisy general feeds** (Nvidia, Meta, SCMP) raise AI cost. Keyword prefilter for those feeds only; skipped items logged.
6. **A feed disappears** (community Anthropic feed, Q9). Per-feed ERROR in the report.
7. **HTML junk in snippets.** Strip tags.
8. **Hugging Face dates and API.** `createdAt` can predate a model's public release, and the API is unofficial in practice (no guarantee of shape). zod check, per-feed ERROR, and the Stage 2 China lane (company-name searches) still covers category 7.

## Testing
- **Automated** (saved real feed files in `tests/fixtures/`, no network): date window; RSS and Atom parsing; undated item dropped; bad feed isolated; paging stops; URL cleaning; Google link decoding on 3 saved examples; prefilter; Hugging Face JSON to Items from a saved response; `fallback_url` used when the main address fails.
- **You (manual):** run once and read the table; spot-check 5 items (real link, within 7 days); run twice and confirm no duplicate URLs; break one URL in feeds.json and confirm only that feed shows ERROR and also appears in `health_stage1.json`, and that `skipped_stage1.json` is written; confirm MarkTechPost's oldest item is about 7 days old; for Pandaily and SCMP confirm the fallback gives 7 days or the report states the short window honestly.
- **Pass:** every working feed OK; date range covers 7 days (or the report says how far back); 0 duplicate URLs.

## Out of scope
Summaries, categories, search (Stages 2 and 3).
