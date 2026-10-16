// Mechanical checks that the docs still match the code. Pure functions (text in, findings out); the script
// tests/docs-check.ts does the file reading. It only reports. Judgment (is this Status honest? does this spec
// sentence still describe the code?) is for a person or the docs-sync skill.

export type Finding = { level: 'FAIL' | 'WARN'; check: string; message: string };
const find = (level: Finding['level'], check: string, message: string): Finding => ({ level, check, message });

// Statuses allowed in the "Status:" line of a stage spec (CLAUDE.md lists the first four; stage 5 uses deferred).
export const STATUS_WORDS = ['planned', 'approved', 'built', 'tested', 'deferred'];

// 1. Every `npm run <name>` written in the docs must be a real script in package.json.
export function checkNpmCommands(docs: Record<string, string>, scripts: string[]): Finding[] {
  const out: Finding[] = [];
  for (const [file, text] of Object.entries(docs)) {
    for (const m of text.matchAll(/npm run ([a-z0-9:_-]+)(?![a-z0-9:_<-])/gi)) {
      if (!scripts.includes(m[1])) out.push(find('FAIL', 'npm-command', `${file}: "npm run ${m[1]}" is not a script in package.json`));
    }
  }
  return out;
}

// 2. Every package.json script should be mentioned in the README (a family like stage3:<step> counts as mentioned).
export function checkScriptsDocumented(readme: string, scripts: string[]): Finding[] {
  return scripts
    .filter((s) => !readme.includes(s) && !(s.includes(':') && readme.includes(`${s.split(':')[0]}:<`)))
    .map((s) => find('WARN', 'script-documented', `package.json script "${s}" is not mentioned in README.md`));
}

// 3. File paths written in backticks (src/..., config/..., tests/..., docs/..., scripts/...) must exist.
// Generated files (data/...), placeholders (<n>, *) and folders are skipped.
export function checkPaths(docs: Record<string, string>, exists: (path: string) => boolean): Finding[] {
  const out: Finding[] = [];
  for (const [file, text] of Object.entries(docs)) {
    const seen = new Set<string>();
    for (const m of text.matchAll(/`((?:src|config|tests|docs|scripts)\/[A-Za-z0-9_./-]+\.(?:ts|json|md))`/g)) {
      const p = m[1];
      if (seen.has(p)) continue;
      seen.add(p);
      if (!exists(p)) out.push(find('FAIL', 'file-path', `${file}: \`${p}\` does not exist`));
    }
  }
  return out;
}

// 4. Every program, library and config file should be mentioned in the docs (by file name).
// stage3-<step>.ts programs count as mentioned through the "stage3-<step>" pattern.
export function checkCodeDocumented(codeFiles: string[], docsText: string): Finding[] {
  return codeFiles
    .filter((f) => {
      const name = f.split('/').pop()!;
      const stepFamily = /^stage3-[a-z]+\.ts$/.test(name) && docsText.includes('stage3-<step>');
      return !docsText.includes(name) && !stepFamily;
    })
    .map((f) => find('WARN', 'code-documented', `${f} is not mentioned in any doc`));
}

// 5. Each stage spec needs a valid Status line, and the README stage table should agree with it.
export function checkStatuses(specs: Record<string, string>, readme: string): Finding[] {
  const out: Finding[] = [];
  const word: Record<string, string> = {};
  for (const [file, text] of Object.entries(specs)) {
    const line = text.match(/^Status:\s*([A-Za-z]+)/m);
    if (!line) {
      out.push(find('FAIL', 'status', `${file}: no "Status:" line`));
      continue;
    }
    const w = line[1].toLowerCase();
    if (!STATUS_WORDS.includes(w)) out.push(find('WARN', 'status', `${file}: status "${line[1]}" is not one of ${STATUS_WORDS.join(', ')}`));
    const n = file.match(/stage(\d)-/)?.[1];
    if (n) word[n] = w;
  }
  for (const row of readme.matchAll(/^\|\s*(\d)\.[^|]*\|[^|]*\|[^|]*\|\s*([A-Za-z]+)[^|]*\|\s*$/gm)) {
    const [, n, readmeWord] = row;
    if (word[n] && word[n] !== readmeWord.toLowerCase()) out.push(find('WARN', 'status', `README stage ${n} says "${readmeWord}" but docs/specs stage ${n} says "${word[n]}"`));
  }
  return out;
}

// 6. Known gaps listed in a stage spec must exist in open-questions.md, and every question needs a Status line.
export function checkQuestions(specs: Record<string, string>, openQuestions: string): Finding[] {
  const out: Finding[] = [];
  const existing = new Set([...openQuestions.matchAll(/^## (Q\d+)\./gm)].map((m) => m[1]));
  for (const [file, text] of Object.entries(specs)) {
    const gaps = text.match(/^Known gaps[^\n]*$/m)?.[0] ?? '';
    for (const q of new Set(gaps.match(/Q\d+/g) ?? [])) if (!existing.has(q)) out.push(find('FAIL', 'known-gap', `${file}: ${q} is listed as a known gap but is not in open-questions.md`));
  }
  for (const block of openQuestions.split(/^## (?=Q\d+\.)/m).slice(1)) {
    const id = block.match(/^(Q\d+)/)?.[1];
    if (!/^- Status:/m.test(block)) out.push(find('WARN', 'question-status', `open-questions.md: ${id} has no "- Status:" line`));
  }
  return out;
}

// 7. Rules of LESSONS.md: every entry in a lesson table has a source and a status (verified <date>, from notes, changed).
export function checkLessons(lessons: string): Finding[] {
  const out: Finding[] = [];
  for (const line of lessons.split('\n')) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line) || /^\|\s*Lesson\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 3) continue; // a different kind of table, or a "|" inside the text: not checked
    const [lesson, source, status] = cells;
    if (!source) out.push(find('WARN', 'lessons', `LESSONS.md: no source: "${lesson.slice(0, 60)}"`));
    if (!/^(verified \d{4}-\d{2}-\d{2}|from notes|changed)/.test(status)) out.push(find('WARN', 'lessons', `LESSONS.md: status is not verified <date> / from notes / changed: "${lesson.slice(0, 60)}"`));
  }
  return out;
}

// 8. Every setting name in an object-shaped config file should appear somewhere in the docs.
export function checkConfigKeys(configs: Record<string, unknown>, docsText: string): Finding[] {
  const out: Finding[] = [];
  const keys = (v: unknown, skipNames: boolean): string[] => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
    return Object.entries(v as Record<string, unknown>).flatMap(([k, val]) => {
      const inner = keys(val, k === 'providers' || k === 'steps'); // names under providers/steps (gemini, triage) are data, not settings
      return skipNames ? inner : [k, ...inner];
    });
  };
  for (const [file, cfg] of Object.entries(configs)) {
    for (const k of new Set(keys(cfg, false))) if (!docsText.includes(k)) out.push(find('WARN', 'config-key', `${file}: setting "${k}" is not mentioned in any doc`));
  }
  return out;
}
