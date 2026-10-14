// Small file helpers: safe JSON writing (no half files) and the raw-download cache.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Write JSON to a temp name first, then rename. A crash never leaves a half file.
export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2) + '\n');
  renameSync(temp, path);
}

// Read a JSON file, or return the fallback if it is missing or broken.
export function readJsonOr<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// Folder for today's raw downloads: data/cache/<YYYY-MM-DD>/ (UTC date)
export function cacheDirFor(root: string, now: Date): string {
  return join(root, 'data', 'cache', now.toISOString().slice(0, 10));
}
