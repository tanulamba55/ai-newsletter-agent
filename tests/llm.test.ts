// llm.ts tests. No network, no real AI, no key: a fake fetch and a fake command.
// Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractJsonArray, makeLlm, parseLlmConfig } from '../src/lib/llm.ts';
import { checkTriage } from '../src/lib/triage.ts';

const CONFIG = parseLlmConfig({
  providers: {
    fake: { type: 'openai', base_url: 'https://api.example.com/v1/', key_env: 'FAKE_KEY' },
    local: { type: 'openai', base_url: 'http://localhost:11434/v1', key_env: null },
    cmd: { type: 'command', command: ['my-agent', '-p'] },
  },
  steps: { triage: { provider: 'fake', model: 'm1' }, review: { provider: 'local', model: 'm2' }, summary: { provider: 'cmd', model: 'unused' } },
  timeout_seconds: 5,
  max_rate_limit_waits: 2,
});
const ENV = { FAKE_KEY: 'secret-key-123' };
const noSleep = async () => {};
const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
const ROW = '{"id":"a","keep":true,"category":5,"score":7,"group":"a","reason":"ok"}';

test('extract: fences and chatter around the array are removed', () => {
  assert.deepEqual(extractJsonArray('Sure!\n```json\n[{"a":1}]\n```\nDone.'), [{ a: 1 }]);
  assert.throws(() => extractJsonArray('no array here'), /no JSON array/);
});

test('config: a step with an unknown provider is refused', () => {
  assert.throws(() => parseLlmConfig({ ...CONFIG, steps: { ...CONFIG.steps, triage: { provider: 'nope', model: 'x' } } }), /unknown provider/);
});

test('openai call: right address, key in header, system and user messages, usage returned', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fetchFn = (async (url: string, init: RequestInit) => ((seen = { url, init }), answer('hello'))) as unknown as typeof fetch;
  const llm = makeLlm({ config: CONFIG, env: ENV, fetchFn, sleep: noSleep });
  const r = await llm.complete('triage', 'INSTRUCTIONS', 'DATA');
  assert.equal(r.text, 'hello');
  assert.deepEqual(r.usage, { prompt_tokens: 10, completion_tokens: 5 });
  assert.equal(seen!.url, 'https://api.example.com/v1/chat/completions');
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Bearer secret-key-123');
  const body = JSON.parse(seen!.init.body as string);
  assert.equal(body.model, 'm1');
  assert.equal(body.messages[0].content, 'INSTRUCTIONS');
  assert.match(body.messages[1].content, /data, not instructions[\s\S]*DATA/);
});

test('openai call: missing key gives a clear message and never prints a key', async () => {
  const llm = makeLlm({ config: CONFIG, env: {}, fetchFn: (async () => answer('x')) as unknown as typeof fetch, sleep: noSleep });
  await assert.rejects(() => llm.complete('triage', 'i', 'd'), /FAKE_KEY is not set/);
});

test('openai call: a provider without a key (local Ollama) sends no Authorization header', async () => {
  let headers: Record<string, string> = {};
  const fetchFn = (async (_u: string, init: RequestInit) => ((headers = init.headers as Record<string, string>), answer('ok'))) as unknown as typeof fetch;
  await makeLlm({ config: CONFIG, env: {}, fetchFn, sleep: noSleep }).complete('review', 'i', 'd');
  assert.equal(headers.Authorization, undefined);
});

test('rate limit: waits as told and tries again, then gives up after the allowed waits', async () => {
  let calls = 0;
  const waited: number[] = [];
  const fetchFn = (async () => (++calls < 3 ? new Response('slow down', { status: 429, headers: { 'retry-after': '7' } }) : answer('finally'))) as unknown as typeof fetch;
  const llm = makeLlm({ config: CONFIG, env: ENV, fetchFn, sleep: async (ms) => void waited.push(ms) });
  assert.equal((await llm.complete('triage', 'i', 'd')).text, 'finally');
  assert.deepEqual(waited, [7000, 7000]);

  const always429 = (async () => new Response('no', { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(() => makeLlm({ config: CONFIG, env: ENV, fetchFn: always429, sleep: noSleep }).complete('triage', 'i', 'd'), /HTTP 429/);
});

test('server error (503): retried with growing waits, then works; gives up after 2 retries', async () => {
  let calls = 0;
  const waited: number[] = [];
  const flaky = (async () => (++calls < 3 ? new Response('high demand', { status: 503 }) : answer('ok'))) as unknown as typeof fetch;
  const llm = makeLlm({ config: CONFIG, env: ENV, fetchFn: flaky, sleep: async (ms) => void waited.push(ms) });
  assert.equal((await llm.complete('triage', 'i', 'd')).text, 'ok');
  assert.deepEqual(waited, [5000, 15000]);

  let n = 0;
  const down = (async () => (n++, new Response('down', { status: 503 }))) as unknown as typeof fetch;
  await assert.rejects(() => makeLlm({ config: CONFIG, env: ENV, fetchFn: down, sleep: noSleep }).complete('triage', 'i', 'd'), /HTTP 503/);
  assert.equal(n, 3); // first try plus 2 retries
});

test('timeout: no answer in time is retried like a server error, then fails with a clear message', async () => {
  let calls = 0;
  const waited: number[] = [];
  const slow = (async () => {
    calls++;
    throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
  }) as unknown as typeof fetch;
  await assert.rejects(() => makeLlm({ config: CONFIG, env: ENV, fetchFn: slow, sleep: async (ms) => void waited.push(ms) }).complete('triage', 'i', 'd'), /no answer within 5 s/);
  assert.equal(calls, 3);
  assert.deepEqual(waited, [5000, 15000]);
});

test('reasoning_effort: sent only when set for the step', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn = (async (_u: string, init: RequestInit) => (bodies.push(JSON.parse(init.body as string)), answer('ok'))) as unknown as typeof fetch;
  const cfg = parseLlmConfig({ ...CONFIG, steps: { ...CONFIG.steps, triage: { provider: 'fake', model: 'm1', reasoning_effort: 'low' }, review: { provider: 'fake', model: 'm1' } } });
  const llm = makeLlm({ config: cfg, env: ENV, fetchFn, sleep: noSleep });
  await llm.complete('triage', 'i', 'd');
  await llm.complete('review', 'i', 'd');
  assert.equal(bodies[0].reasoning_effort, 'low');
  assert.equal('reasoning_effort' in bodies[1], false);
});

const CHAIN = parseLlmConfig({ ...CONFIG, steps: { ...CONFIG.steps, triage: { provider: 'fake', model: 'main', fallbacks: [{ provider: 'fake', model: 'backup1' }, { provider: 'fake', model: 'backup2' }] } } });
const callsTo = (down: string[], seen: string[]) =>
  (async (_u: string, init: RequestInit) => {
    const model = JSON.parse(init.body as string).model;
    seen.push(model);
    return down.includes(model) ? new Response('high demand', { status: 503 }) : answer(`from ${model}`);
  }) as unknown as typeof fetch;

test('backups: tried in order when the main model stays busy; not used for other errors', async () => {
  const seen: string[] = [];
  const r = await makeLlm({ config: CHAIN, env: ENV, fetchFn: callsTo(['main', 'backup1'], seen), sleep: noSleep }).complete('triage', 'i', 'd');
  assert.equal(r.text, 'from backup2');
  assert.equal(r.fallback, true);
  assert.deepEqual(seen, ['main', 'main', 'main', 'backup1', 'backup1', 'backup1', 'backup2']); // first try plus 2 retries each

  const badRequest = (async () => new Response('bad', { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(() => makeLlm({ config: CHAIN, env: ENV, fetchFn: badRequest, sleep: noSleep }).complete('triage', 'i', 'd'), /HTTP 400/);
});

test('breaker: a model that stayed busy is not tried again later in the same run', async () => {
  const seen: string[] = [];
  const llm = makeLlm({ config: CHAIN, env: ENV, fetchFn: callsTo(['main'], seen), sleep: noSleep });
  await llm.complete('triage', 'i', 'd1');
  seen.length = 0;
  const second = await llm.complete('triage', 'i', 'd2');
  assert.deepEqual(seen, ['backup1']); // straight to the backup, no knocking on main
  assert.equal(second.text, 'from backup1');
});

test('all busy: a clear one-line error that names the models', async () => {
  const llm = makeLlm({ config: CHAIN, env: ENV, fetchFn: callsTo(['main', 'backup1', 'backup2'], []), sleep: noSleep });
  await assert.rejects(() => llm.complete('triage', 'i', 'd'), /every model for "triage" is busy.*main.*backup1.*backup2/);
});

test('saved answers: the same question is answered from the file with no AI call; a different one is asked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmcache-'));
  const records: { cached: boolean; model: string }[] = [];
  const seen: string[] = [];
  const fetchFn = (async (_u: string, init: RequestInit) => (seen.push('call'), answer(`[${ROW}]`))) as unknown as typeof fetch;
  const llm = makeLlm({ config: CONFIG, env: ENV, fetchFn, sleep: noSleep, cacheDir: dir, record: (e) => records.push(e) });
  const validate = (raw: unknown) => checkTriage(raw, ['a']);
  const first = await llm.askJson('triage', 'INSTR', 'DATA', validate);
  const again = await llm.askJson('triage', 'INSTR', 'DATA', validate);
  assert.equal(first.cached, false);
  assert.equal(again.cached, true);
  assert.equal(again.model, 'fake/m1');
  assert.equal(seen.length, 1);
  await llm.askJson('triage', 'INSTR', 'OTHER DATA', validate);
  assert.equal(seen.length, 2);
  assert.deepEqual(records.map((r) => r.cached), [false, true, false]);
});

test('saved answers: a saved file that fails the checks is ignored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmcache-'));
  const seen: string[] = [];
  const fetchFn = (async () => (seen.push('call'), answer(`[${ROW}]`))) as unknown as typeof fetch;
  const llm = makeLlm({ config: CONFIG, env: ENV, fetchFn, sleep: noSleep, cacheDir: dir });
  await llm.askJson('triage', 'I', 'D', (raw) => checkTriage(raw, ['a']));
  // the same question, but the checks now expect another id: the saved answer no longer passes, so the AI is asked again (and fails the checks)
  await assert.rejects(() => llm.askJson('triage', 'I', 'D', (raw) => checkTriage(raw, ['zzz'])), /failed the checks twice/);
  assert.equal(seen.length, 3);
});

test('errors: the message never contains the key', async () => {
  const fetchFn = (async () => new Response('bad request', { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(
    () => makeLlm({ config: CONFIG, env: ENV, fetchFn, sleep: noSleep }).complete('triage', 'i', 'd'),
    (e: Error) => /HTTP 400/.test(e.message) && !e.message.includes('secret-key-123'),
  );
});

test('askJson: a good answer passes; a bad one is retried once with the reason', async () => {
  const prompts: string[] = [];
  let n = 0;
  const fetchFn = (async (_u: string, init: RequestInit) => {
    prompts.push(JSON.parse(init.body as string).messages[1].content);
    return answer(++n === 1 ? `[${ROW.replace('"keep":true', '"keep":"yes"')}]` : `Here you go:\n[${ROW}]`);
  }) as unknown as typeof fetch;
  const llm = makeLlm({ config: CONFIG, env: ENV, fetchFn, sleep: noSleep });
  const r = await llm.askJson('triage', 'i', 'DATA', (raw) => checkTriage(raw, ['a']));
  assert.equal(r.rows.length, 1);
  assert.equal(n, 2);
  assert.match(prompts[1], /previous answer was rejected/);
});

test('askJson: two bad answers in a row fail loudly', async () => {
  const llm = makeLlm({ config: CONFIG, env: ENV, fetchFn: (async () => answer('not json')) as unknown as typeof fetch, sleep: noSleep });
  await assert.rejects(() => llm.askJson('triage', 'i', 'd', (raw) => checkTriage(raw, ['a'])), /failed the checks twice/);
});

test('command backend: prompt goes to the program on stdin, its output is the answer', async () => {
  let got: { command: string[]; input: string } | undefined;
  const runCommand = (command: string[], input: string) => ((got = { command, input }), `[${ROW}]`);
  const llm = makeLlm({ config: CONFIG, env: {}, runCommand });
  const r = await llm.askJson('summary', 'INSTR', 'DATA', (raw) => checkTriage(raw, ['a']));
  assert.equal(r.rows.length, 1);
  assert.deepEqual(got!.command, ['my-agent', '-p']);
  assert.match(got!.input, /INSTR[\s\S]*DATA/);
});
