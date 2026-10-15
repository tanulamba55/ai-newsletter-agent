// Title similarity for Stage 3: find the same story told by several outlets.
// Plain word overlap (no AI, no cost). Good enough to sort near-duplicates next to each other;
// the triage step makes the final "same story" call.

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'is', 'are', 'with', 'at', 'by', 'as', 'its', 'it', 'from', 'that', 'this', 'be', 'how', 'what', 'why']);

// Lower-case words and numbers (any language). A run of Chinese characters counts as one word.
export function titleWords(title: string): Set<string> {
  const words = title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((w) => w.length > 1 && !STOP.has(w)));
}

// 0 to 1: shared words divided by all words in either title. Very short titles never count as similar.
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size < 3 || b.size < 3) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

// Group indexes of items whose titles are similar (union of pairs at or above the threshold).
// Returns a cluster number for every item, numbered in order of first appearance.
export function clusterTitles(titles: string[], threshold: number): number[] {
  const words = titles.map(titleWords);
  const parent = titles.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      if (similarity(words[i], words[j]) >= threshold) parent[find(j)] = find(i);
    }
  }
  const number = new Map<number, number>();
  return titles.map((_, i) => {
    const root = find(i);
    if (!number.has(root)) number.set(root, number.size);
    return number.get(root)!;
  });
}
