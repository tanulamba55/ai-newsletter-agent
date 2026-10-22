// Throwaway spike (Q7, Q8): can Firecrawl fetch pages our own downloads cannot?
// Run:  node --env-file=.env scripts/spikes/firecrawl-spike.ts
// Reads FIRECRAWL_API_KEY from .env. Never prints the key. Costs a few credits (free plan: 1,000 a month).
const KEY = process.env.FIRECRAWL_API_KEY;
if (!KEY) throw new Error('FIRECRAWL_API_KEY missing in .env');

const TARGETS = [
  { label: 'KnowTechie feed (Q7, blocked for us)', url: 'https://www.knowtechie.com/feed/' },
  { label: 'KnowTechie homepage (Q7)', url: 'https://www.knowtechie.com/' },
  { label: 'VentureBeat own feed (Q8, HTTP 429 for us)', url: 'https://venturebeat.com/feed' },
  { label: 'SCMP "Exclusive" article (possible paywall)', url: process.argv[2] ?? '' },
].filter((t) => t.url);

for (const t of TARGETS) {
  const started = Date.now();
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: t.url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(90000),
    });
    const body = (await res.json()) as any;
    const md: string = body?.data?.markdown ?? '';
    console.log(`\n== ${t.label}\n   ${t.url}`);
    console.log(`   Firecrawl HTTP ${res.status}, success=${body?.success}, page status=${body?.data?.metadata?.statusCode}, markdown ${md.length} chars, ${((Date.now() - started) / 1000).toFixed(1)} s`);
    if (!body?.success) console.log(`   error: ${String(body?.error ?? JSON.stringify(body)).slice(0, 200)}`);
    if (md) console.log(`   starts: ${md.replace(/\s+/g, ' ').slice(0, 220)}`);
    if (body?.data?.metadata?.creditsUsed !== undefined) console.log(`   credits used: ${body.data.metadata.creditsUsed}`);
  } catch (e) {
    console.log(`\n== ${t.label}\n   request failed: ${(e as Error).message}`);
  }
}
