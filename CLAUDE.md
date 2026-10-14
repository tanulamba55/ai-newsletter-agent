# AI Newsletter Agent

## Goal

Weekly AI newsletter: collect news, summarize with sources, produce a designed PDF, publish it. Shared rules in docs/SPEC.md; per-stage details in docs/specs/stageN-*.md.

## How to read the specs

- Read docs/SPEC.md plus ONLY the spec file for the stage being built
- One home per fact: shared facts live in docs/SPEC.md only. Stage files link to them and never restate them
- If a shared fact changes: edit docs/SPEC.md only, then search docs/specs/ for mentions
- Before building a stage, audit docs/SPEC.md, CLAUDE.md and that stage file for contradictions
- Each stage file has a Status line (planned / approved / built / tested); keep it current
- Each stage file lists its Known gaps (Q numbers in docs/open-questions.md). Before building, read those entries (OPEN, WATCH, TEMPORARY, DEFERRED) and build around them; a stage is not "built" until each is fixed, verified, or accepted by the user

## Session routine

- Start: read LESSONS.md and the newest file in docs/sessions/ (one dated file per session). Re-check cheap facts you will rely on (feed HTTP status, newest item date) before building on them
- End: add new lessons to LESSONS.md, each with a source and a status (verified date / from notes / changed). No source, no entry. Then write a short dated handoff note in docs/sessions/: what was done, what is next, what is open
- Health: run `npm run health` (quick, about 4 s, one line if all is well) at the start of a session. Run `npm run health:full` (about 10 s) before building a stage. It only reports; results are saved in data/health/. Never edit docs from its results on your own: show me the result and we discuss what goes into the docs
- One home per fact: LESSONS.md holds only what was learned, with a pointer. Rules live in docs/SPEC.md, open decisions in docs/open-questions.md. Never copy a spec rule into LESSONS.md

## Architecture (keep these separate)

1. Agent: collect -> dedupe -> categorize -> summarize -> output JSON (flat schema in docs/SPEC.md; every story carries its source_url)
2. UI skill: JSON -> designed HTML -> PDF
3. Publisher: send/post the PDF
   JSON is the contract between stages.

## Rules

- Only stories from the last 7 days
- Every story needs an original-source URL (not an aggregator)
- No duplicates, no minor announcements
- Language: TypeScript (Node 23.6, runs .ts directly, zod validates JSON shapes)
- Keep code simple and commented in plain language; I review code, I don't write it
- Unresolved decisions live in docs/open-questions.md; resolve from there when I say so
- Explain what you build in plain language
- Build one stage at a time and wait for my approval
- Keep the repo root clean: no new files there. Docs go in docs/, session notes in docs/sessions/, experiments in scripts/spikes/, code in src/, settings in config/, tests in tests/, generated output in data/
