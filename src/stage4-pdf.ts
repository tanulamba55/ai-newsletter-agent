// Stage 4: turn data/stories.json into data/newsletter.html and data/newsletter-<date>.pdf.
// Run:  npm run pdf
// Chrome does the printing (headless). No AI and no network.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { renderNewsletter } from './lib/render.ts';
import { StorySchema } from './lib/schemas.ts';

const DATA = join(new URL('..', import.meta.url).pathname, 'data');
const storiesFile = join(DATA, 'stories.json');
if (!existsSync(storiesFile)) {
  console.log('data/stories.json is missing. Run Stage 3 first.');
  process.exit(1);
}

// Refuse a stories.json that does not match the contract.
const parsed = z.array(StorySchema).safeParse(JSON.parse(readFileSync(storiesFile, 'utf8')));
if (!parsed.success) {
  console.log('data/stories.json does not match the story shape:');
  for (const i of parsed.error.issues.slice(0, 5)) console.log(`  - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
const stories = parsed.data;

const issue = new Date().toISOString().slice(0, 10);
const htmlFile = join(DATA, 'newsletter.html');
const pdfFile = join(DATA, `newsletter-${issue}.pdf`);
const tempPdf = `${pdfFile}.tmp`;

writeFileSync(htmlFile, renderNewsletter(stories, issue));

// Print with Chrome. Write to a temp name first, then rename, so a crash never leaves a half PDF.
try {
  execFileSync('google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${tempPdf}`, `file://${htmlFile}`], { timeout: 30000, stdio: 'pipe' });
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  console.log(err.code === 'ENOENT' ? 'Chrome (google-chrome) was not found on this machine.' : `Chrome failed: ${err.message}`);
  process.exit(1);
}
renameSync(tempPdf, pdfFile);
console.log(`${stories.length} stories -> ${pdfFile}`);
