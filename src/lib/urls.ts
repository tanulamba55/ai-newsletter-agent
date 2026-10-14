// URL cleaning and item ids.
import { createHash } from 'node:crypto';

const TRACKING = /^(utm_|fbclid$|gclid$|ref$)/i;

// Drop fragment and tracking params, lowercase host, remove trailing slash (not for root).
export function cleanUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.test(key)) u.searchParams.delete(key);
  }
  u.hostname = u.hostname.toLowerCase();
  let out = u.toString();
  if (u.pathname.length > 1 && u.pathname.endsWith('/') && !u.search) out = out.replace(/\/$/, '');
  else if (u.pathname.length > 1 && u.pathname.endsWith('/')) out = out.replace('/?', '?');
  return out;
}

// id = first 12 hex characters of sha1 of the cleaned URL
export function makeId(cleanedUrl: string): string {
  return createHash('sha1').update(cleanedUrl).digest('hex').slice(0, 12);
}
