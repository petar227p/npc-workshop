// Live check of recognition through retelling: Edda sees the stranger (the player) slay a troll, and the news goes
// Edda → Wren → Tobin → Pell, one telling each. Then the player talks to all four through the real models.
// npx tsx scripts/recognition-live.ts
import type { World } from '../server/src/engine';
import { playerSays, skipTime } from '../server/src/game';
import { createModel } from '../server/src/models';
import { act, memoriesText, newVillage, NPCS, report } from '../server/src/npcs';

const session = `recognition-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const npc = (id: string) => NPCS.find((n) => n.id === id)!;
const to = (w: World, tick: number) => skipTime(w, tick - w.tick).world;

function must<T extends { ok: boolean; reason: string | null; world: World }>(r: T, what: string): World {
  if (!r.ok) throw new Error(`${what}: ${r.reason}`);
  return r.world;
}

// 10:00 at the market, where Edda is.
let w = to(newVillage(), 2);
const seen = report(w, { text: 'The stranger slew a troll in the middle of the market with one blow of an axe.', place: 'market', involved: ['player'], seen_by: { kind: 'only', ids: ['keeper'] }, notable: true });
w = must(seen, 'report');
const id = seen.events.find((e) => e.type === 'HAPPENED')!.id;

// 21:00 tavern: Edda tells Wren. 22:00 tavern: Wren tells Tobin. Next day 19:00 tavern: Tobin tells Pell.
w = must(act(to(w, 13), 'keeper', { action: 'TELL', to: 'cottager', event_id: id, summary: 'A stranger killed a troll in the market today, with a single axe blow! I saw it with my own eyes.' }, { to: 'cottager' }), 'Edda → Wren');
w = must(act(to(w, 14), 'cottager', { action: 'TELL', to: 'farmer', event_id: id, summary: 'Edda says some stranger felled a troll at the market with an axe.' }, { to: 'farmer' }), 'Wren → Tobin');
w = must(act(to(w, 35), 'farmer', { action: 'TELL', to: 'bard', event_id: id, summary: "Heard from Wren a stranger killed a troll at the market. Can't say more than that." }, { to: 'bard' }), 'Tobin → Pell');

const LINES = ['Good day. Heard any news lately?', 'Do you know who I am?'];

for (const who of ['keeper', 'cottager', 'farmer', 'bard']) {
  const n = npc(who);
  console.log(`\n=== ${n.name} ===`);
  const line = memoriesText(w, who, undefined, 'player').split('\n').find((l) => l.includes(id));
  console.log(`  memory: ${line}`);
  const model = createModel(session, n.model);
  let talk = w;
  for (const text of LINES) {
    const r = await playerSays(talk, text, model, n);
    talk = r.world;
    console.log(`  You: ${text}`);
    for (const e of r.events) if (e.type === 'SAID' && e.actor === who) console.log(`  ${n.name}: ${e.data.text}`);
    if ('outcome' in r && r.outcome !== 'acted') console.log(`  (${r.outcome})`);
  }
}
console.log(`\nlog: logs/${session}.jsonl`);
