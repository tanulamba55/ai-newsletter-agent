// Do the docs still match the code? Report only: it never edits a file.
// Run:  npm run docs:check
// Checks (src/lib/docsCheck.ts): npm commands in docs exist, scripts are documented, file paths in docs exist,
// code and config files are mentioned, Status lines and README table agree, known gaps exist, LESSONS rules hold.
// FAIL = a doc names something that does not exist. WARN = something is undocumented or looks inconsistent.
// The exit code is 1 when there is any FAIL. The judgment part is the docs-sync skill (.claude/skills/docs-sync).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCodeDocumented, checkConfigKeys, checkLessons, checkNpmCommands, checkPaths, checkQuestions, checkScriptsDocumented, checkStatuses } from '../src/lib/docsCheck.ts';
import type { Finding } from '../src/lib/docsCheck.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const list = (dir: string, ext: string) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`) : []);

// Living docs (history in docs/sessions and LESSONS.md is not checked for old names).
const specFiles = list('docs/specs', '.md');
const docFiles = ['README.md', 'CLAUDE.md', 'docs/SPEC.md', 'docs/deferred.md', 'docs/open-questions.md', ...specFiles];
const docs = Object.fromEntries(docFiles.filter((f) => existsSync(join(ROOT, f))).map((f) => [f, read(f)]));
const docsText = Object.values(docs).join('\n');
const specs = Object.fromEntries(specFiles.map((f) => [f, docs[f]]));

const scripts = Object.keys((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts);
const codeFiles = [...list('src', '.ts'), ...list('src/lib', '.ts'), ...list('config', '.json')];
const configs = Object.fromEntries(
  list('config', '.json').map((f) => [f, JSON.parse(read(f)) as unknown]),
);

const findings: Finding[] = [
  ...checkNpmCommands(docs, scripts),
  ...checkScriptsDocumented(docs['README.md'], scripts),
  ...checkPaths(docs, (p) => existsSync(join(ROOT, p))),
  ...checkCodeDocumented(codeFiles, docsText),
  ...checkStatuses(specs, docs['README.md']),
  ...checkQuestions(specs, docs['docs/open-questions.md']),
  ...checkLessons(read('LESSONS.md')),
  ...checkConfigKeys(configs, docsText),
];

const fails = findings.filter((f) => f.level === 'FAIL');
const warns = findings.filter((f) => f.level === 'WARN');
console.log(`docs-check: ${fails.length} fail, ${warns.length} warn  (${docFiles.length} docs, ${codeFiles.length} code/config files, ${scripts.length} npm scripts)`);
for (const f of [...fails, ...warns]) console.log(`  ${f.level} [${f.check}] ${f.message}`);
if (!findings.length) console.log('  everything the script can check matches. Judgment checks are still for the docs-sync skill.');
process.exit(fails.length ? 1 : 0);
