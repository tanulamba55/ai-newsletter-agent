# Review: Stages 1-3

Review only. Nothing was built or tested; free resources are judged from the spec notes.

## Summary

The design is solid. The weak spot is not the AI, it is the **free input** in Stages 1 and 2. If they return thin or wrong input, Stage 3 cannot fix it.

## 1. What is good (keep)

- **Stage 3 safety checks:** quote check, number check, "link must be on the fetched page", drop if no original source.
- **Cheap code first, AI only for judgment.**
- **Cache + hard token budget:** reruns are free, no surprise bill.
- **One bad feed never stops a run.**
- **Official feeds + YC launches JSON:** clean, free, real URLs.
- **Golden set + known-news check:** right idea (see section 5).
- **Weak spots are written down** in open-questions.md with a catch and a trigger.

## 2. Needs fixing before building

| # | Problem | Why it matters | Fix |
|---|---|---|---|
| A | **Google News link handling contradicts itself** (Stage 1 step 5 vs Risk 2, Q15). Step 5 drops an undecodable link as `undecodable_link`. Risk 2 says "Stage 3 follows the redirect", but these links hide the URL behind a script, and Stage 3 has no decode step. | If the decoder fails, VentureBeat, Pandaily and SCMP items are lost in Stage 1 and the Stage 3 fallback never runs. The real fallback is the Q13 plan: accept a short window and say so in the report. | Delete the "Stage 3 follows the redirect" line, or add a decode step to Stage 3. Keep the decoder spike as the go/no-go gate. **Bing as a partial fallback** (test 13 Oct 2026, one machine, 7-day filter, real URLs): `site:scmp.com` gave 12 results, `site:technode.com` 7, `site:venturebeat.com` 3, `site:pandaily.com` 0. Searching by outlet name is worse: results are mostly other outlets and MSN reprints (only about 2 of 6-11 were from the named outlet; Pandaily returned nothing). So: use `site:` queries, not outlet names. SCMP looks usable, VentureBeat is thin, Pandaily is not covered by Bing at all. |
| B | **Snippet fallback clashes with the original-source rule** (Stage 3 step 5). | A snippet has no outbound links. Official-feed items are fine (already original). A media item whose article can't be fetched survives only if its outlet is on the trusted list. Paywalled media stories get lost. | Accept and document it honestly. |
| C | **Small gap, not a hole: duplicates with very different titles can still slip through** (Q19). Already handled: Stage 3 sorts by title similarity before batching. Left over: same story with different headlines can land in different batches, and step 8 has no final check. | A leftover duplicate can take 2 of the 4 slots per category. | Optional safety net: code-only dedupe on the ~30 shortlisted (same `source_url` = same story). Verify with real same-story groups in testing, as Q19 already says. |
| D | **YC tagger output has no home.** Stage 2 only writes `items_extra.json`. | Tags are lost, or Stage 2 rewrites Stage 1's file. | Run the tagger at the start of Stage 3. |
| E | **Failures are silent** (Q16, open). | Stage 3 spends money on thin input and gives a confident newsletter anyway. | Print a health summary (failed feeds, fallbacks used). Hard stop before Stage 3 if input is thin (e.g. more than 3 feeds fail). |

## 3. Works now, may break later

| Workaround | Risk | Action |
|---|---|---|
| **Bing News RSS** (main search) | Can block or change format. Tested only a few queries from one machine. | Re-test ~25 queries from the machine that runs weekly. |
| **Google News RSS** (backup) | Blocks fast callers, needs decoder. | Backup only. |
| **Community Anthropic feed** (Q9) | Maintainer can stop. | Trigger: 2 ERROR runs in a row. |
| **VentureBeat / Pandaily / SCMP fallback** (Q8, Q13) | Depends on the decoder (A). Bing `site:` helps SCMP (12 results), is thin for VentureBeat (3), and misses Pandaily (0). | Spike first. Add a Bing `site:` backup for SCMP and VentureBeat. For Pandaily, accept a short window or use paid search. |
| **YC JSON endpoints** (Q10) | Unofficial, may change. | Launch HN backup + saved test file. |
| **Keyword prefilter** (Q17) | Can drop a real AI story. | Skim the `not_ai` log in testing. |
| **Category 8 (YC news)** (Q12) | No main source, will be thin. | Merge cats 4 and 8, or add paid search. |

## 4. Top 3 risks to correct results

1. **Free search recall** (Q11, Q20). If Bing/Google return little, cats 2, 3, 7, 8 go missing. **Change:** add paid Claude web search as backup and as a test reference.
2. **Links that do not decode + snippet fallback** (A, B). Real stories lost early (`undecodable_link`) or dropped as `no_original_source`. **Change:** run the decoder spike first, fix the contradiction in A, document B.
3. **Silent thin input** (E, Q16). **Change:** health summary + hard stop.

C (already mostly handled) and D are smaller and cheap to fix.

## 5. Making the test more trustworthy

The known-news check (8-10 stories) and golden set (30 items) are small and limited to what you remember.

- Once per test week, run **paid Claude web search** to build an independent list of the week's big stories.
- Measure how many the free pipeline found, and which categories it missed.
- One-time test cost, not weekly. Gives your senior real numbers ("found X of Y").

## 6. What to ask your senior

1. **Claude API key + spend cap.** Already required, so "all free" is not accurate.
2. **Claude web search:** recall benchmark now, backup search lane if Q11 or Q20 triggers fire.
3. **Decision on terms of use.** Bing and Google News RSS in a publicly published product (Stage 2 Risk 6) is a business call.
4. *(Optional, low priority)* Real-browser fetch tool. Only helps KnowTechie and some paywalls.

## 7. Suggested order

1. Decoder spike on 3 saved Google News links (A, Q15). If it fails, those 3 feeds use the short window and the report says so.
2. Answer Q14 (one skip file per stage) and Q16 (health summary, stop threshold).
3. Write D (tagger in Stage 3) into the specs. Add C (optional final dedupe) only if testing shows duplicates still slip through.
4. Re-test Bing and Google at full volume from the weekly machine.
5. Run one paid-search benchmark week, then decide on the paid backup.
