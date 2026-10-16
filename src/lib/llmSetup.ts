// Shared start-up for the AI steps: read .env and config/llm.json, build the AI caller, read a prompt file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonOr, writeJsonAtomic } from './files.ts';
import { loadEnvFile, makeLlm, parseLlmConfig } from './llm.ts';
import type { CallRecord, Step } from './llm.ts';

export const ROOT = new URL('../..', import.meta.url).pathname;
export const S3 = join(ROOT, 'data', 'stage3');
const AI_LOG = join(S3, 'ai-log.json'); // which model answered what, newest last

export function setupLlm() {
  loadEnvFile(join(ROOT, '.env'));
  const config = parseLlmConfig(JSON.parse(readFileSync(join(ROOT, 'config', 'llm.json'), 'utf8')));
  const record = (entry: CallRecord) => writeJsonAtomic(AI_LOG, [...readJsonOr<unknown[]>(AI_LOG, []), { at: new Date().toISOString(), ...entry }]);
  return { llm: makeLlm({ config, log: console.log, cacheDir: join(ROOT, 'data', 'cache', 'ai'), record }), config };
}

export const readPrompt = (name: string) => readFileSync(join(ROOT, 'docs', 'prompts', name), 'utf8');

// Command line flags shared by the AI steps.
export const USE_SAVED = process.argv.includes('--use-saved'); // use the answer file already in data/stage3/ (for example written by another agent) instead of asking the AI
export function onlyNumber(): number | null {
  const i = process.argv.indexOf('--only'); // for example: --only 3 (run just slice 3)
  return i >= 0 ? Number(process.argv[i + 1]) : null;
}

// One line per answered question: which model, or that a saved answer was reused.
export function reportUsage(step: Step, label: string, r: { usage: { prompt_tokens?: number; completion_tokens?: number }; model: string; cached: boolean }): void {
  console.log(r.cached ? `  ${label}: ${step} saved answer reused (no AI call)` : `  ${label}: ${step} answered by ${r.model}, tokens in ${r.usage.prompt_tokens ?? '?'} out ${r.usage.completion_tokens ?? '?'}`);
}

// Run an AI step. If it fails (every model busy, bad answer twice, missing key) print ONE clear message, not a stack trace.
// Everything already answered is saved, so running the same command again only asks what is still missing.
export async function runStep(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (e) {
    console.log(`\nStopped: ${(e as Error).message}`);
    console.log('Answers already received are saved. Run the same command again to continue; only what is missing is asked.');
    process.exit(1);
  }
}
