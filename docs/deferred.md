# Deferred for the demo (16 Oct 2026)

Decided 15 Oct 2026 to have Stages 1-3 (and the Stage 4 PDF if possible) ready for a demo, using only free resources. Everything below was cut from the demo scope, not dropped from the project. Each line says what was cut, why, and what brings it back. The "ideal way" is the design in docs/SPEC.md and the stage specs; the demo uses the workaround.

## Needs a purchase or an approval
| Cut | Why | Ideal way (comes back when) |
|---|---|---|
| Claude API for Stage 3 triage and summaries (`src/lib/llm.ts`, spend cap, token budget) | No API key exists; the key and a spend cap need the senior's approval | Key and cap approved: build `llm.ts` and use `docs/prompts/*.md` as system prompts (Q21). Demo workaround: independent Claude Code agents fill the same files |
| Paid Claude web search (benchmark week, backup search lane) | Costs money and needs approval | A Q11 or Q20 trigger fires, or the first real test week (SPEC.md Whole pipeline) |
| Firecrawl / real-browser fetch for KnowTechie and blocked pages | Tested: does not unblock KnowTechie (Q7); VentureBeat's own feed only 3.5 days | Revisit if a browser tool works, or for blocked article pages in Stage 3 |
| Terms-of-use decision for Bing and Google News RSS | A business call, only needed before publishing publicly | Before Stage 5 (Stage 2 Risk 6) |

## Cut to save time or discussion
| Cut | Why | Ideal way (comes back when) |
|---|---|---|
| Category 8 (YC-backed startups, non-launch news) and the Stage 3 YC tagger | Weakest category: no main source exists (Q12), the tagger needs name matching and tuning | Demo has 7 categories; Stage 2 still caches the YC company list. Bring it back when the tagger is built (step 2c in the Stage 3 spec) |
| Golden set (30 labelled items, 20-30 min of your time) | Needs your labelling time | Before the first real weekly run; re-run after prompt or model changes |
| Number check, AI retries, token count printed per run | Only relevant with the API; the demo AI steps are checked by code (source link, quote) and by reading | With `llm.ts` |
| Readability, cheerio and jsdom for article text | No new dependencies today; light own HTML-to-text and link extraction | If article text quality is poor |
| Stage 5: publish and schedule weekly | Decided earlier that the pipeline stops at the PDF and you approve before publishing | After Stage 4 is accepted: choose where to publish and how to schedule |
| Fancy PDF design (logo, custom fonts, cover art) | Clean print layout is enough for the demo | After the demo |
| Known-news check at 70% and recall measurement | Needs a manual list of the week's big stories | First real test week (Q11, Q20) |
| Re-test of about 25 Bing queries from the real weekly machine | Weekly machine is the dev machine for now | Before Stage 5 (Q20) |

## Small known weak spots kept as they are
- Federal Register is a low-yield source (nearly always empty for AI titles). Category 3 relies on news search and the EU feed.
- English keyword filter cannot read Chinese; Chinese-language items are kept and the AI step reads them.
- Outlet lane lets non-AI TechNode items through; Stage 3 triage drops them.
- Low-quality outlets (Crypto Briefing, ainvest and similar) are left to the Stage 3 source rules.
- Triage runs in slices that cannot see each other, so same-story groups are only valid inside a slice (Q19); a code-only dedupe of the shortlist covers most leftovers.
