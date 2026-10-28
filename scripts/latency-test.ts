// How long the models take, measured on the smith's real quote turn (persona, facts, schema), plus Muse Image.
// npm run latency-test                  (5 calls per setup)
// npm run latency-test -- --n 3 --only smith-contrib,image
// Calls go one at a time, rotating through the setups, with no retries, so a slow minute or a hidden retry
// doesn't skew one setup. Results go to logs/latency-<time>.json; the first picture per image setup is saved beside it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fromFlat, parseFlat } from '../server/src/agents/flat';
import { turnMessages } from '../server/src/agents/npc';
import { REPO_ROOT, loadEnv } from '../server/src/config/env';
import { createClient, type ChatClient, type ReasoningEffort } from '../server/src/models';
import { act, newVillage, smith } from '../server/src/npcs';

const { values: args } = parseArgs({ options: { n: { type: 'string', default: '5' }, only: { type: 'string' } } });
const N = Number(args.n);
const env = loadEnv();
const need = (name: string) => env[name] ?? (console.error(`${name} is not set (see .env.example)`), process.exit(1));

const META = env.META_BASE_URL ?? 'https://api.meta.ai/v1';
const meta = () => createClient({ provider: 'meta', baseURL: META, apiKey: need('MODEL_API_KEY'), maxAttempts: 1, timeoutMs: 60_000 });
const baseten = () =>
  createClient({ provider: 'baseten', baseURL: env.BASETEN_BASE_URL ?? 'https://inference.baseten.co/v1', apiKey: need('BASETEN_API_KEY'), maxAttempts: 1, timeoutMs: 60_000 });

// $ per 1M tokens (docs/api-notes.md). Baseten's price isn't published; other hosts charge Standard rates.
const PRICES = { contrib: [0.1, 0.2], standard: [1.25, 4.25], open: [1.25, 4.25] } as const;
const IMAGE_PRICE = 0.01;

type Chat = { kind: 'chat'; name: string; client: () => ChatClient; model: string; effort: ReasoningEffort; price: readonly [number, number] };
type Image = { kind: 'image'; name: string; strength: 'low' | 'high' };
type Setup = Chat | Image;

const chat = (group: string, client: () => ChatClient, model: string, price: readonly [number, number], efforts: ReasoningEffort[]): Chat[] =>
  efforts.map((effort) => ({ kind: 'chat', name: `${group} ${effort}`, client, model, effort, price }));

const ALL: Record<string, Setup[]> = {
  'smith-contrib': chat('smith-contrib', meta, 'muse-spark-1.3-contributor', PRICES.contrib, ['minimal', 'low', 'medium']),
  'smith-standard': chat('smith-standard', meta, 'muse-spark-1.3', PRICES.standard, ['minimal', 'low', 'medium']),
  // Baseten has no 'minimal' effort for Spark Open.
  open: chat('open', baseten, env.VILLAGER_MODEL ?? 'meta-models/muse-spark-open', PRICES.open, ['low', 'medium']),
  image: [
    { kind: 'image', name: 'image low', strength: 'low' },
    { kind: 'image', name: 'image high', strength: 'high' },
  ],
};
const groups = args.only ? args.only.split(',') : Object.keys(ALL);
const unknown = groups.filter((g) => !ALL[g]);
if (unknown.length) {
  console.error(`unknown setup ${unknown.join(', ')}; pick from ${Object.keys(ALL).join(', ')}`);
  process.exit(1);
}
const setups = groups.flatMap((g) => ALL[g]);

// The turn that matters most: a customer has just ordered, and the smith should quote.
const ORDER = "Good morning. I'd like a sword shaped like a hammerhead shark: broad head, heavy at the tip. I've got about 150 gold.";
const world = act(newVillage(), 'player', { action: 'SAY', text: ORDER }).world;
const messages = turnMessages(smith, world);
const IMAGE_PROMPT =
  'A single hand-forged fantasy sword, the Hammerhead Blade: a broad iron blade whose head widens like a hammerhead shark, ' +
  'grip wrapped in grey sharkskin leather. Centered on a plain light background, full item visible, game item illustration.';

type Sample = { ms: number; ok: boolean; note: string; verb?: string; cost: number; reasoning?: number | null; out?: number; content?: string };

async function runChat(s: Chat, client: ChatClient): Promise<Sample> {
  const started = Date.now();
  try {
    const res = await client.chat({ model: s.model, messages, reasoning_effort: s.effort, max_tokens: 4096, json_schema: { name: `${smith.id}_action`, schema: smith.schema } });
    const u = res.usage;
    const cost = u ? (u.prompt_tokens * s.price[0] + u.completion_tokens * s.price[1]) / 1e6 : 0;
    // The answer is kept so speed can be weighed against what the smith actually said.
    const base = { ms: res.latency_ms, cost, reasoning: u?.reasoning_tokens ?? null, out: u?.completion_tokens, content: res.content };
    const out = parseFlat(res.content);
    if (!out) return { ...base, ok: false, note: res.content ? 'not JSON' : `empty (finish ${res.finish_reason})` };
    // Valid JSON isn't enough: would the ledger take it?
    const r = act(world, smith.id, fromFlat(smith.modelVerbs, out), { customer: 'player' });
    return { ...base, ok: r.ok, verb: String(out.action), note: r.ok ? '' : `ledger: ${r.reason}` };
  } catch (err) {
    return { ms: Date.now() - started, ok: false, note: (err as Error).message.slice(0, 160), cost: 0 };
  }
}

async function runImage(s: Image, save: string | null): Promise<Sample> {
  const started = Date.now();
  try {
    const res = await fetch(`${META}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${need('MODEL_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.IMAGE_MODEL ?? 'muse-image-1.0',
        prompt: IMAGE_PROMPT,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
        output_format: 'png',
        reasoning_strength: s.strength,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { ms, ok: false, note: `${res.status}: ${(await res.text()).slice(0, 160)}`, cost: 0 };
    const b64 = ((await res.json()) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
    if (!b64) return { ms, ok: false, note: 'no image in response', cost: IMAGE_PRICE };
    if (save) writeFileSync(save, Buffer.from(b64, 'base64'));
    return { ms, ok: true, note: '', cost: IMAGE_PRICE };
  } catch (err) {
    return { ms: Date.now() - started, ok: false, note: (err as Error).message.slice(0, 160), cost: 0 };
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `${REPO_ROOT}logs/latency-${stamp}`;
mkdirSync(dir, { recursive: true });

const clients = new Map(setups.flatMap((s) => (s.kind === 'chat' ? [[s, s.client()] as const] : [])));
const samples = new Map<Setup, Sample[]>(setups.map((s) => [s, []]));
console.log(`${setups.length} setups × ${N} calls, one at a time. Prompt: ${messages.reduce((n, m) => n + m.content.length, 0)} characters.\n`);

for (let round = 1; round <= N; round++) {
  for (const s of setups) {
    const got =
      s.kind === 'chat' ? await runChat(s, clients.get(s)!) : await runImage(s, round === 1 ? `${dir}/${s.name.replace(' ', '-')}.png` : null);
    samples.get(s)!.push(got);
    const tail = got.ok ? (got.verb ?? 'image') : `FAIL ${got.note}`;
    console.log(`  [${round}/${N}] ${s.name.padEnd(22)} ${(got.ms / 1000).toFixed(1).padStart(5)} s  ${tail}`);
  }
}

// Nearest-rank percentile. With 5 samples p95 is the slowest call; read it as "worst seen".
const pct = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
const sec = (ms: number) => (ms / 1000).toFixed(1);

const rows = setups.map((s) => {
  const all = samples.get(s)!;
  const ms = all.map((x) => x.ms).sort((a, b) => a - b);
  const reasoning = all.map((x) => x.reasoning).filter((r): r is number => typeof r === 'number');
  return {
    setup: s.name,
    model: s.kind === 'chat' ? s.model : (env.IMAGE_MODEL ?? 'muse-image-1.0'),
    ok: `${all.filter((x) => x.ok).length}/${all.length}`,
    p50_s: sec(pct(ms, 0.5)),
    p95_s: sec(pct(ms, 0.95)),
    min_s: sec(ms[0]),
    reasoning_tokens: reasoning.length ? Math.round(reasoning.reduce((a, b) => a + b, 0) / reasoning.length) : '-',
    verbs: [...new Set(all.map((x) => x.verb).filter(Boolean))].join(' '),
    usd_per_call: (all.reduce((a, x) => a + x.cost, 0) / all.length).toFixed(4),
  };
});

console.log();
console.table(rows);
const failures = setups.flatMap((s) => samples.get(s)!.filter((x) => !x.ok).map((x) => `  ${s.name}: ${x.note}`));
if (failures.length) console.log(`Failures:\n${failures.join('\n')}`);
const total = [...samples.values()].flat().reduce((a, x) => a + x.cost, 0);
writeFileSync(`${dir}.json`, JSON.stringify({ at: new Date().toISOString(), n: N, order: ORDER, rows, samples: setups.map((s) => ({ setup: s.name, samples: samples.get(s) })) }, null, 2));
console.log(`\nApprox. cost: $${total.toFixed(3)}  results: logs/latency-${stamp}.json  images: logs/latency-${stamp}/`);
