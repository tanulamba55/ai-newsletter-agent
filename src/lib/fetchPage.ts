// Stage 3: download an article page and turn it into plain text plus a list of its links.
// Simple on purpose (no extra packages): cut away page furniture, strip tags, keep the main text.
import { stripHtml } from './rss.ts';
import type { GetText } from './rss.ts';
import { cleanUrl } from './urls.ts';

export const TEXT_MAX = 6000; // characters of article text kept per story
export const LINKS_MAX = 60; // outbound links kept per story

// Page furniture that is never article text.
const FURNITURE = /<(nav|header|footer|aside|form|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi;

// Plain text of the article. Prefers the <article> block, then <main>, then the whole page.
export function htmlToText(html: string, max = TEXT_MAX): string {
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(FURNITURE, ' ');
  for (const tag of ['article', 'main']) {
    const m = clean.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'i'));
    if (m) {
      const text = stripHtml(m[0], max);
      if (text.length > 500) return text; // a real article body, not an empty wrapper
    }
  }
  return stripHtml(clean, max);
}

// Absolute http(s) links on the page, cleaned and without duplicates. The page's own address and
// plain anchors are left out. These are the only addresses a summary may use as its source.
export function extractLinks(html: string, baseUrl: string, max = LINKS_MAX): string[] {
  const out = new Set<string>();
  const self = safeClean(baseUrl);
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*["']([^"']+)["']/gi)) {
    let abs: string;
    try {
      abs = cleanUrl(new URL(m[1].replace(/&amp;/g, '&'), baseUrl).toString());
    } catch {
      continue; // not a usable address (mailto:, javascript:, broken)
    }
    if (!/^https?:/i.test(abs) || abs === self) continue;
    out.add(abs);
    if (out.size >= max) break;
  }
  return [...out];
}

function safeClean(url: string): string {
  try {
    return cleanUrl(url);
  } catch {
    return url;
  }
}

export type Article = {
  id: string; // the selected item's id
  fetched_from: string | null; // the address that worked, or null if only the snippet is available
  via: 'own' | 'other_outlet' | 'snippet'; // which copy gave the text
  text: string;
  links: string[];
};

// Try the item's own address first, then the other outlets that ran the same story, in order.
// If nothing works, fall back to the snippet (the spec allows this for official and trusted outlets).
export async function fetchArticle(id: string, urls: string[], snippet: string, getText: GetText): Promise<{ article: Article; errors: string[] }> {
  const errors: string[] = [];
  for (const [i, url] of urls.entries()) {
    try {
      const html = await getText(url);
      const text = htmlToText(html);
      if (text.length < 200) throw new Error('page has almost no text');
      return { article: { id, fetched_from: url, via: i === 0 ? 'own' : 'other_outlet', text, links: extractLinks(html, url) }, errors };
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`);
    }
  }
  return { article: { id, fetched_from: null, via: 'snippet', text: snippet, links: [] }, errors };
}
