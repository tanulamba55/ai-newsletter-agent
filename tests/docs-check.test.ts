// Tests for the docs-vs-code checks (src/lib/docsCheck.ts). Made-up docs, no real files.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCodeDocumented, checkConfigKeys, checkLessons, checkNpmCommands, checkPaths, checkQuestions, checkScriptsDocumented, checkStatuses } from '../src/lib/docsCheck.ts';

test('npm commands: unknown script is a FAIL, placeholders and real scripts pass', () => {
  const r = checkNpmCommands({ 'README.md': 'Run `npm run stage1` then `npm run collect`, or npm run stage3:<step>.' }, ['stage1', 'stage3:prepare']);
  assert.equal(r.length, 1);
  assert.match(r[0].message, /npm run collect/);
});

test('scripts: undocumented script is a WARN; a family placeholder counts', () => {
  assert.equal(checkScriptsDocumented('use npm run stage3:<step> and stage1', ['stage1', 'stage3:prepare', 'stage3:triage']).length, 0);
  assert.equal(checkScriptsDocumented('only stage1', ['stage1', 'all']).length, 1);
});

test('paths: missing file is a FAIL; data files, placeholders and folders are ignored', () => {
  const text = 'See `src/lib/a.ts`, `src/lib/gone.ts`, `data/x.json`, `data/stage3/triage_<n>.json`, `src/lib/`.';
  const r = checkPaths({ 'README.md': text }, (p) => p === 'src/lib/a.ts');
  assert.deepEqual(r.map((f) => f.message.includes('gone.ts')), [true]);
});

test('code documented: unmentioned file is a WARN; stage3-<step> family counts', () => {
  const r = checkCodeDocumented(['src/lib/llm.ts', 'src/lib/old.ts', 'src/stage3-rank.ts', 'config/x.json'], 'llm.ts is described; programs src/stage3-<step>.ts; x.json');
  assert.deepEqual(r.map((f) => f.message.split(' ')[0]), ['src/lib/old.ts']);
});

test('statuses: missing line is a FAIL, odd word and README disagreement are WARN', () => {
  const specs = { 'docs/specs/stage1-collect.md': 'Status: built (x)', 'docs/specs/stage2-search.md': 'Status: tested', 'docs/specs/stage3-process.md': 'no status here', 'docs/specs/stage4-pdf.md': 'Status: maybe' };
  const readme = '| 1. Collect | a | b | Built |\n| 2. Search | a | b | Built (awaiting) |\n';
  const r = checkStatuses(specs, readme);
  assert.ok(r.some((f) => f.level === 'FAIL' && f.message.includes('stage3')));
  assert.ok(r.some((f) => f.message.includes('"maybe"')));
  assert.ok(r.some((f) => f.message.includes('README stage 2 says "Built"')));
  assert.equal(r.some((f) => f.message.includes('README stage 1')), false);
});

test('questions: a known gap that is not in open-questions.md is a FAIL; a question without Status is a WARN', () => {
  const oq = '## Q1. First\n- Status: OPEN\n\n## Q2. Second\n- text only\n';
  const r = checkQuestions({ 'docs/specs/stage3-process.md': 'Known gaps (open-questions.md): Q1, Q9' }, oq);
  assert.ok(r.some((f) => f.level === 'FAIL' && f.message.includes('Q9')));
  assert.ok(r.some((f) => f.level === 'WARN' && f.message.includes('Q2')));
});

test('lessons: source and status rules', () => {
  const md = ['| Lesson | Source | Status |', '|---|---|---|', '| good | file.md | verified 2026-10-15 |', '| no source | | verified 2026-10-15 |', '| bad status | file.md | maybe |', '| from notes | x | from notes |'].join('\n');
  const r = checkLessons(md);
  assert.equal(r.length, 2);
});

test('config keys: setting names missing from the docs are WARN; provider and step names are data', () => {
  const cfg = { 'config/llm.json': { providers: { gemini: { base_url: 'x', key_env: 'k' } }, steps: { triage: { model: 'm', fallbacks: [] } }, timeout_seconds: 5 } };
  const r = checkConfigKeys(cfg, 'providers, steps, base_url, key_env and model are documented');
  assert.deepEqual(r.map((f) => f.message.match(/"(.+)"/)![1]).sort(), ['fallbacks', 'timeout_seconds']);
});
