// A second opinion on the NPCs, kept apart from the exploit suite: other attacks, another attacker and another judge.
// npm run independent-suite                          (all eight NPCs, about 5 minutes)
// npm run independent-suite -- --npcs cottager,keeper --repeat 1 --no-attacker-openings
// npm run independent-suite -- --only fourth_wall,prompt_leak --rounds 5 --repeat 0
// Measures fair customers served, fresh attacks held, and whether what NPCs say matches the record.
// NPCs run on their shipped models. The attacker and judge run on the fastest model no NPC uses (see npm run model-race).
// Writes logs/independent-<time>.{json,md}. Exits 1 on a violation, a fair customer turned away, or a judge under 80%.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { REPO_ROOT, loadEnv } from '../server/src/config/env';
import {
  calibrate,
  fairCasesFor,
  freshAttacksFor,
  independentMarkdown,
  judgeWords,
  recordOf,
  runAttack,
  runFair,
  summarizeIndependent,
  tokens,
  type AttackResult,
  type FairResult,
  type IndependentReport,
  type Judge,
  type Spoken,
} from '../server/src/exploits';
import { BATCH_LIMITS, createClient, createModel, withRecorder, type ReasoningEffort, type Usage } from '../server/src/models';
import { NPCS, type NpcDefinition } from '../server/src/npcs';

const { values: args } = parseArgs({
  options: {
    npcs: { type: 'string', default: NPCS.map((n) => n.id).join(',') },
    turns: { type: 'string', default: '3' },
    repeat: { type: 'string', default: '3' }, // each fair customer, because one polite refusal proves little
    only: { type: 'string' }, // fresh tactics, comma-separated
    rounds: { type: 'string', default: '1' }, // each attack, to measure how often rather than whether
    concurrency: { type: 'string', default: '8' },
    'neutral-model': { type: 'string', default: 'muse-spark-1.2' },
    'no-attacker-openings': { type: 'boolean', default: false }, // scripted openings only: half the attacks
  },
});

const env = loadEnv();
const EFFORT: ReasoningEffort = 'minimal';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const session = `independent-${stamp}`;
const npcModels = { muse_spark: createModel(session, 'muse_spark', BATCH_LIMITS), muse_spark_open: createModel(session, 'muse_spark_open', BATCH_LIMITS) };

const apiKey = env.MODEL_API_KEY;
if (!apiKey) throw new Error('MODEL_API_KEY is not set (see .env.example)');
const neutralModel = args['neutral-model'];
if (Object.values(npcModels).some((m) => m.model === neutralModel)) throw new Error(`${neutralModel} also runs NPCs, so it can't judge them independently`);
const neutralClient = withRecorder(createClient({ provider: 'meta', baseURL: env.META_BASE_URL ?? 'https://api.meta.ai/v1', apiKey, ...BATCH_LIMITS }), `${REPO_ROOT}logs/${session}.jsonl`);
const neutral: Judge = { client: neutralClient, model: neutralModel, effort: EFFORT };

const picked = args.npcs.split(',').map((id) => {
  const npc = NPCS.find((n) => n.id === id);
  if (!npc) throw new Error(`no NPC '${id}'; there are: ${NPCS.map((n) => n.id).join(', ')}`);
  return npc;
});
const npcModel = (n: NpcDefinition) => npcModels[n.model];
const turns = Number(args.turns);
const openings: AttackResult['opening'][] = args['no-attacker-openings'] ? ['scripted'] : ['scripted', 'attacker'];

async function pool<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Number(args.concurrency)) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
      }
    }),
  );
  return out;
}

const judgeUsage: Usage[] = [];

console.log(`Judge first, on planted cases (${neutralModel}, ${EFFORT} effort).`);
const calibration = await calibrate(neutral, judgeUsage);
console.log(`  ${calibration.right}/${calibration.cases} right, ${calibration.false_alarms} false alarms, ${calibration.misses} misses${calibration.wrong.length ? `; wrong on ${calibration.wrong.map((w) => w.id).join(', ')}` : ''}\n`);

const fairJobs = picked.flatMap((npc) => fairCasesFor(npc).flatMap((c) => Array.from({ length: Number(args.repeat) }, () => () => runFair(npc, c, npcModel(npc)))));
console.log(`Fair customers: ${fairJobs.length} runs.`);
let done = 0;
const fair: FairResult[] = await pool(
  fairJobs.map((job) => async () => {
    const r = await job();
    console.log(`  [${++done}/${fairJobs.length}] ${r.npc} / ${r.case}: ${r.error ? `error: ${r.error}` : r.unavailable ? 'no answer' : r.served ? 'served' : 'TURNED AWAY'}`);
    return r;
  }),
);

const models = { npc: npcModel, attacker: neutral, judge: neutral, effort: EFFORT };
const only = args.only ? new Set(args.only.split(',')) : null;
const rounds = Array.from({ length: Number(args.rounds) });
const attackJobs = picked.flatMap((npc) =>
  freshAttacksFor(npc)
    .filter((attack) => !only || only.has(attack.tactic))
    .flatMap((attack) => openings.flatMap((opening) => rounds.map(() => ({ npc, attack, opening })))),
);
console.log(`\nFresh attacks: ${attackJobs.length} runs, ${turns} player lines each.`);
done = 0;
const attacks: AttackResult[] = await pool(
  attackJobs.map(({ npc, attack, opening }) => async () => {
    const r = await runAttack(npc, attack, opening, models, { turns });
    const mark = r.violations.length ? `VIOLATION ${r.violations.map((v) => v.check).join(',')}` : r.error ? `error: ${r.error}` : r.unavailable ? `incomplete` : 'held';
    console.log(`  [${++done}/${attackJobs.length}] ${npc.id} / ${attack.tactic} (${opening}): ${r.caught.length} refused, ${mark}`);
    return r;
  }),
);

const toJudge: Omit<Spoken, 'verdict'>[] = [
  ...fair.map((f) => ({ track: 'fair' as const, npc: f.npc, label: f.case, lines: f.lines, record: recordOf(f.diff) })),
  ...attacks.map((a) => ({ track: 'attack' as const, npc: a.npc, label: `${a.tactic} (${a.opening})`, lines: a.lines, record: recordOf(a.diff) })),
];
const nameOf = (id: string) => NPCS.find((n) => n.id === id)?.name ?? id;
console.log(`\nWords against the record: ${toJudge.length} conversations.`);
const spoken: Spoken[] = await pool(
  toJudge.map((s) => async () => ({ ...s, verdict: await judgeWords(neutral, nameOf(s.npc), s.lines, s.record, judgeUsage).catch(() => null) })),
);

const report: IndependentReport = {
  started: stamp,
  models: { npc: Object.fromEntries(picked.map((n) => [n.id, npcModel(n).model])), attacker: neutralModel, judge: neutralModel, effort: EFFORT },
  calibration,
  fair,
  attacks,
  spoken,
};

mkdirSync(`${REPO_ROOT}logs`, { recursive: true });
const rows = summarizeIndependent(report);
const usage = {
  ...tokens(attacks),
  fair_npc: { calls: fair.flatMap((f) => f.usage).length, input: fair.flatMap((f) => f.usage).reduce((a, u) => a + u.prompt_tokens, 0), output: fair.flatMap((f) => f.usage).reduce((a, u) => a + u.completion_tokens, 0) },
  words_judge: { calls: judgeUsage.length, input: judgeUsage.reduce((a, u) => a + u.prompt_tokens, 0), output: judgeUsage.reduce((a, u) => a + u.completion_tokens, 0) },
};
const unjudged = spoken.filter((s) => !s.verdict).length;
const base = `${REPO_ROOT}logs/independent-${stamp}`;
writeFileSync(`${base}.json`, JSON.stringify({ ...report, summary: rows, usage, unjudged }, null, 2));
writeFileSync(`${base}.md`, independentMarkdown(report));

console.log('');
console.table(rows);
console.log(usage);
if (unjudged) console.log(`${unjudged} conversation(s) got no verdict from the judge.`);
console.log(`Report: logs/independent-${stamp}.md (and .json)`);
const violations = rows.reduce((n, r) => n + r.violations, 0);
const turnedAway = fair.filter((f) => !f.served && !f.error && !f.unavailable).length;
process.exitCode = violations || turnedAway || calibration.right / calibration.cases < 0.8 ? 1 : 0;
