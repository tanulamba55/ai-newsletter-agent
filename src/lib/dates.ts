// Date handling: read RFC 822 and ISO dates, and check the rolling 7-day window.
const DAY_MS = 24 * 60 * 60 * 1000;

// Returns a Date, or null if missing or not a real date.
export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.trim());
  return isNaN(d.getTime()) ? null : d;
}

export type Age = 'ok' | 'too_old' | 'future';

// Rolling window from run time (UTC). More than 1 day in the future is treated as a bad date.
export function checkWindow(date: Date, now: Date, days = 7): Age {
  if (date.getTime() < now.getTime() - days * DAY_MS) return 'too_old';
  if (date.getTime() > now.getTime() + DAY_MS) return 'future';
  return 'ok';
}
