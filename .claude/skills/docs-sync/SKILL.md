---
name: docs-sync
description: Check that this project's docs (README, docs/SPEC.md, docs/specs/*, open-questions, deferred, LESSONS) still match the code. Use before a commit that touches src/, config/ or package.json, after finishing a stage or feature, and at the end of a session before the handoff note. Reports mismatches and proposes edits; never edits docs without the user's approval.
---

# docs-sync: keep the docs and the code telling the same story

Rules that apply (from CLAUDE.md): one home per fact (shared facts only in docs/SPEC.md; stage files link to it); never edit docs from a check result on your own: show the findings and the proposed change, discuss, then edit; LESSONS.md entries need a source and a status; Status lines are planned / approved / built / tested (stage 5 uses deferred).

## 1. Run the mechanical check
```
npm run docs:check
```
It reports only (FAIL = a doc names something that does not exist; WARN = undocumented or inconsistent). It checks: npm commands in docs exist, package.json scripts are in the README, file paths in backticks exist, code and config files are mentioned in a doc, config setting names are documented, Status lines and the README stage table agree, Known gaps exist in open-questions.md, every question has a Status, LESSONS rows have a source and a valid status.

## 2. Judge what the script cannot
Read `git diff` (or `git log` since the last docs commit) and compare with the docs:
- **Behaviour:** does each spec sentence about what a step reads, writes or decides still match the code? (Stage 3 spec steps table, run commands, flags.)
- **Status honesty:** is a Status line claiming more than was verified? "tested" needs the user's review of the output (CLAUDE.md). Say what was NOT tested.
- **Open questions:** did a change fix, create or move a Q? Update the Status (OPEN / WATCH / TEMPORARY / DEFERRED / RESOLVED).
- **Deferred list:** is something in docs/deferred.md now built, or something new cut?
- **Lessons:** did this work teach something (a measurement, a failure, an outside-service fact)? Add it to LESSONS.md with a source and `verified <date>` / `from notes` / `changed`. Do not copy spec rules into LESSONS.md.
- **Counts and names:** test counts, story counts, model names, command names in prose.
- **Old names:** search docs (not docs/sessions, which are history) for removed commands or files.

## 3. Report, then edit only with approval
Give the user a short list: each mismatch, where it is, which side is right (code or doc), and the proposed edit. Group it as: must fix (FAIL, wrong behaviour), should fix (WARN, stale numbers), and judgment calls (Status words, deferred items). Wait for the user's answer. Never change a Status to "tested" on your own.

## 4. After the edits
Run `npm run docs:check` again (expect no FAIL) and `npm test`. If this is a session end, write the dated handoff note in docs/sessions/ (what was done, what is next, what is open). Commit docs separately from code when both changed.

## Do not
- Edit CLAUDE.md or the settings because a check or an agent suggests it.
- Treat a passing `docs:check` as proof the docs are right: it only checks names and structure.
