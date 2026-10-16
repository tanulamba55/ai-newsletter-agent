# Stage 4: Stories to PDF

Status: tested (demo scope, 16 Oct 2026). 4 automated tests pass; you opened the PDF (made from 12 stories), clicked source links and checked the layout. Page numbers are not built (deferred.md)
Depends on (SPEC.md): Story contract, PDF section
Known gaps (open-questions.md): none yet

## Purpose
Turn `data/stories.json` into a designed one-PDF newsletter: HTML first, then Chrome prints it to PDF. This is the stage that gives the demo something to hold.

## Input / Output
In: `data/stories.json` (checked with zod). Out: `data/newsletter.html` and `data/newsletter-<date>.pdf`.

## Layout
- Cover: newsletter title, issue date, the 7-day range, story count.
- One section per category, in category order. A category with no stories is left out, not shown empty (cat 8 is deferred and thin categories vanish cleanly).
- Each story: title, summary, why it matters, a clickable "Source" link to `source_url`, other links if any, story date.
- Print CSS: A4, readable serif or sans body, section starts on a new page when space is short, no story split across pages where possible, page numbers.
- All text is HTML-escaped (titles and summaries come from outside sources).

## How
- `src/lib/render.ts`: stories in, HTML text out. No network, no dependencies.
- `src/stage4-pdf.ts`: reads and validates `data/stories.json`, writes `data/newsletter.html`, runs `google-chrome --headless --no-pdf-header-footer --print-to-pdf=<file>` as a child process (30 s timeout, clear error if Chrome is missing), writes through a temp name then renames.
- Run: `npm run stage4`. Section titles are the category names in SPEC.md. The cover's 7-day range is the issue date minus 7 days (stories.json holds no run date).
- Chrome is already installed on the dev machine (`/usr/bin/google-chrome`); no new package.
- Decided 15 Oct 2026: no "YC launch" badge (the category 4 section title already says it). The story shape has no `yc_launch` field.
- **Known gap: no page numbers.** `--no-pdf-header-footer` (required above) also removes Chrome's page numbers. Adding them needs extra print CSS. Not done.
- Tests: `tests/stage4-render.test.ts` (escaping, empty category left out and order, links, cover). The zod refusal of a bad `stories.json` is in `stage4-pdf.ts` and is covered by the story-shape tests in `tests/stage3-finish.test.ts`, not by a Stage 4 test.

## Success check
A PDF I would be happy to read: every story shows with a working source link, no empty section, date on the cover.

## Testing
- **Automated:** HTML escaping; empty category left out; links present; cover has the date; invalid `stories.json` is refused by zod.
- **You (manual):** open the PDF; click three source links; check page breaks and readability.

## Out of scope
Picking stories (Stage 3), publishing (Stage 5). Fancy design work (logo, custom fonts) is deferred (docs/deferred.md).
