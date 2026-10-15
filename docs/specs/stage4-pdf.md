# Stage 4: Stories to PDF

Status: approved (plan, demo scope 15 Oct 2026) - not built
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
- Run: `npm run pdf`.
- Chrome is already installed on the dev machine (`/usr/bin/google-chrome`); no new package.

## Success check
A PDF I would be happy to read: every story shows with a working source link, no empty section, date on the cover.

## Testing
- **Automated:** HTML escaping; empty category left out; links present; cover has the date; invalid `stories.json` is refused by zod.
- **You (manual):** open the PDF; click three source links; check page breaks and readability.

## Out of scope
Picking stories (Stage 3), publishing (Stage 5). Fancy design work (logo, custom fonts) is deferred (docs/deferred.md).
