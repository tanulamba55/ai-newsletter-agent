// Keyword prefilter: for noisy official feeds, keep only items that look AI-related.
import type { Keywords } from './schemas.ts';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build one matcher from the keyword lists in config/keywords.json.
// Whole-word match, so "AI" does not match inside "MAIN" or "said".
export function makeMatcher(keywords: Keywords): (text: string) => boolean {
  const exact = keywords.case_sensitive.map((k) => new RegExp(`\\b${escapeRegex(k)}\\b`));
  const loose = keywords.case_insensitive.map((k) => new RegExp(`\\b${escapeRegex(k)}\\b`, 'i'));
  return (text) => exact.some((re) => re.test(text)) || loose.some((re) => re.test(text));
}
