// Stage 4: stories in, one HTML page out (Chrome prints it to PDF). No network, no dependencies.
// All text comes from outside sources, so every piece of text is HTML-escaped.
import type { Story } from './schemas.ts';

// Section titles, from docs/SPEC.md (Names). Category 8 is reserved and not used.
export const CATEGORY_NAMES: Record<number, string> = {
  1: 'Funding and startups',
  2: 'AI in video, UI and design',
  3: 'AI regulations and policy',
  4: 'New AI product launches in YC',
  5: 'LLM model updates',
  6: 'Open-source model updates',
  7: 'China models and updates',
  9: 'AI infrastructure and research',
};
const ORDER = [1, 2, 3, 4, 5, 6, 7, 9];

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const day = (iso: string) => iso.slice(0, 10);
// Short readable address for the "other coverage" links, for example "techcrunch.com".
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function storyHtml(s: Story): string {
  const others = (s.other_links ?? []).map((u) => `<a href="${esc(u)}">${esc(hostOf(u))}</a>`).join(', ');
  return `<article class="story">
  <h3>${esc(s.title)}</h3>
  <p class="date">${esc(day(s.date))}</p>
  <p>${esc(s.summary)}</p>
  <p class="why"><strong>Why it matters:</strong> ${esc(s.why_it_matters)}</p>
  <p class="links"><a href="${esc(s.source_url)}">Source: ${esc(hostOf(s.source_url))}</a>${others ? ` &middot; Also covered by: ${others}` : ''}</p>
</article>`;
}

// `issue` is the issue date (YYYY-MM-DD); the range shown is the 7 days up to it.
export function renderNewsletter(stories: Story[], issue: string): string {
  const from = new Date(Date.parse(issue) - 7 * 86400000).toISOString().slice(0, 10);
  const sections = ORDER.map((cat) => ({ cat, list: stories.filter((s) => s.category === cat) }))
    .filter((x) => x.list.length > 0) // a category with no stories is left out
    .map((x) => `<section>\n<h2>${esc(CATEGORY_NAMES[x.cat])}</h2>\n${x.list.map(storyHtml).join('\n')}\n</section>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Weekly AI Newsletter ${esc(issue)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.45; color: #1a1a1a; margin: 0; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; border-left: 6px solid #2b4acb; padding-left: 14mm; page-break-after: always; }
  .cover h1 { font-family: Helvetica, Arial, sans-serif; font-size: 34pt; margin: 0 0 6mm; }
  .cover p { font-family: Helvetica, Arial, sans-serif; font-size: 13pt; margin: 1mm 0; color: #444; }
  section { margin-bottom: 8mm; }
  h2 { font-family: Helvetica, Arial, sans-serif; font-size: 16pt; color: #2b4acb; border-bottom: 1px solid #2b4acb; padding-bottom: 1mm; margin: 6mm 0 4mm; break-after: avoid; }
  .story { break-inside: avoid; margin-bottom: 6mm; }
  h3 { font-family: Helvetica, Arial, sans-serif; font-size: 12.5pt; margin: 0 0 1mm; }
  .story p { margin: 1mm 0; }
  .date { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #777; }
  .links { font-size: 10pt; }
  a { color: #2b4acb; text-decoration: none; }
</style>
</head>
<body>
<div class="cover">
  <h1>Weekly AI Newsletter</h1>
  <p>Issue date: ${esc(issue)}</p>
  <p>Covering ${esc(from)} to ${esc(issue)}</p>
  <p>${stories.length} stories</p>
</div>
${sections}
</body>
</html>
`;
}
