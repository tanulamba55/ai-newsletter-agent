# AI Newsletter Agent

## Goal

Weekly AI newsletter: collect news, summarize with sources, produce a designed PDF, publish it. Shared rules in SPEC.md; per-stage details in specs/stageN-*.md.

## How to read the specs

- Read SPEC.md plus ONLY the spec file for the stage being built
- One home per fact: shared facts live in SPEC.md only. Stage files link to them and never restate them
- If a shared fact changes: edit SPEC.md only, then search specs/ for mentions
- Before building a stage, audit SPEC.md, CLAUDE.md and that stage file for contradictions
- Each stage file has a Status line (planned / approved / built / tested); keep it current

## Architecture (keep these separate)

1. Agent: collect -> dedupe -> categorize -> summarize -> output JSON (flat schema in SPEC.md; every story carries its source_url)
2. UI skill: JSON -> designed HTML -> PDF
3. Publisher: send/post the PDF
   JSON is the contract between stages.

## Rules

- Only stories from the last 7 days
- Every story needs an original-source URL (not an aggregator)
- No duplicates, no minor announcements
- Language: TypeScript (Node 23.6, runs .ts directly, zod validates JSON shapes)
- Keep code simple and commented in plain language; I review code, I don't write it
- Unresolved decisions live in open-questions.md; resolve from there when I say so
- Explain what you build in plain language
- Build one stage at a time and wait for my approval
