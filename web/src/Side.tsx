import type { ContractView, EngineEvent, Gift, ItemArt, MadeToOrderView, StateView, Trigger } from '@blacksmith/shared';
import { useState } from 'react';
import { clockText } from './api';
import { gaveText, giftText, goodName, nameOf } from './Chat';

type ForgeProps = { view: StateView; disabled: boolean; onSkip: (ticks: number) => void; onReset: () => void };

export function Forge({ view, disabled, onSkip, onReset }: ForgeProps) {
  const jobs = view.contracts.filter((c): c is MadeToOrderView => c.kind === 'made_to_order' && c.status === 'in_progress');
  const nextDue = Math.min(...jobs.map((j) => j.due_tick ?? Infinity));
  return (
    <section className="panel">
      <div className="hud-row">
        <span className="clock">{clockText(view.tick)}</span>
        <span className="gold">🪙 {view.gold}</span>
        <button className="secondary small" onClick={onReset} disabled={disabled} title="Start a fresh world">
          New game
        </button>
      </div>
      <h2>Forge</h2>
      {jobs.length === 0 && <div className="muted">The anvil is free.</div>}
      {jobs.map((j) => {
        const start = (j.due_tick ?? 0) - j.delivery_ticks;
        const pct = Math.min(100, ((view.tick - start) / j.delivery_ticks) * 100);
        return (
          // The picture is usually ready long before the work is, so it shows on the anvil, not only once delivered.
          <div key={j.contract_id} className="job">
            <ItemPicture name={j.item_name} art={view.art[j.contract_id]} />
            <div className="job-body">
              <div className="job-row">
                <span>{j.item_name}</span>
                <span className="tag">ready {clockText(j.due_tick ?? 0)}</span>
              </div>
              <div className="bar">
                <div style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
      <div className="actions">
        <button className="secondary" onClick={() => onSkip(1)} disabled={disabled}>
          +1 hour
        </button>
        {jobs.length > 0 && (
          <button onClick={() => onSkip(Math.max(1, Math.min(48, nextDue - view.tick)))} disabled={disabled}>
            Skip until ready ⏩
          </button>
        )}
      </div>
    </section>
  );
}

// Each seller's unreserved stock, from the ledger.
export function Stock({ view }: { view: StateView }) {
  return (
    <>
      {view.shops.map((shop) => (
        <section key={shop.id} className="panel">
          <h2>{shop.name}'s stock</h2>
          <ul className="stock">
            {Object.entries(shop.stock).map(([m, n]) => (
              <li key={m} className={n <= 0 ? 'muted' : ''}>
                <span>{goodName(m)}</span>
                <b>{n}</b>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function Inventory({ view, disabled, onGive }: { view: StateView; disabled: boolean; onGive: (to: string, gift: Gift) => void }) {
  const goods = Object.entries(view.goods).filter(([, n]) => n > 0);
  return (
    <section className="panel">
      <h2>Your gear</h2>
      {view.items.length === 0 && goods.length === 0 && <div className="muted">Nothing yet but your purse.</div>}
      {goods.length > 0 && (
        <ul className="stock">
          {goods.map(([g, n]) => (
            <li key={g}>
              <span>{goodName(g)}</span>
              <b>{n}</b>
            </li>
          ))}
        </ul>
      )}
      {view.items.map((i) => (
        <div key={i.item_id} className="item">
          <ItemPicture name={i.item_name} art={view.art[i.contract_id]} />
          <div>
            <div className="title">{i.item_name}</div>
            <div className="muted">
              dmg {i.stats.damage} · wt {i.stats.weight} · dur {i.stats.durability}
            </div>
          </div>
        </div>
      ))}
      <GiveForm view={view} goods={goods.map(([g]) => g)} disabled={disabled} onGive={onGive} />
    </section>
  );
}

// Hand gold, goods or an item to anyone in the village. The ledger checks you have it (if not, an error) and a seller
// hands back anything outside its trade (a note in that NPC's chat).
function GiveForm({ view, goods, disabled, onGive }: { view: StateView; goods: string[]; disabled: boolean; onGive: (to: string, gift: Gift) => void }) {
  const [to, setTo] = useState('');
  const [what, setWhat] = useState('gold');
  const [qty, setQty] = useState(1);
  const choices = [
    { value: 'gold', label: 'gold' },
    ...goods.map((g) => ({ value: `good:${g}`, label: goodName(g) })),
    ...view.items.map((i) => ({ value: `item:${i.item_id}`, label: i.item_name })),
  ];
  // A choice that's gone (given away, or a new game) falls back to the first one.
  const pick = choices.some((c) => c.value === what) ? what : 'gold';
  const target = view.shops.some((s) => s.id === to) ? to : (view.shops[0]?.id ?? '');
  const isItem = pick.startsWith('item:');
  const gift = (): Gift =>
    pick === 'gold' ? { kind: 'gold', amount: qty } : isItem ? { kind: 'item', item_id: pick.slice(5) } : { kind: 'good', good: pick.slice(5), qty };

  return (
    <form
      className="give"
      onSubmit={(e) => {
        e.preventDefault();
        if (target) onGive(target, gift());
      }}
    >
      <span className="muted small">Give</span>
      {!isItem && (
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} aria-label="How many" />
      )}
      <select value={pick} onChange={(e) => setWhat(e.target.value)} aria-label="What to give">
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <span className="muted small">to</span>
      <select value={target} onChange={(e) => setTo(e.target.value)} aria-label="Who to give it to">
        {view.shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button className="secondary small" disabled={disabled || !target}>
        Give
      </button>
    </form>
  );
}

// The Muse Image sprite once it's drawn; Kenney's sword tile until then (pulsing while Brann's sketch is on its way).
function ItemPicture({ name, art }: { name: string; art: ItemArt | undefined }) {
  if (art?.url) return <img className="item-sprite" src={art.url} alt={name} width={64} height={64} />;
  const drawing = art?.status === 'rendering';
  return <div className={`portrait item-art${drawing ? ' drawing' : ''}`} title={drawing ? 'Being drawn…' : name} />;
}

// Gossip: for the latest events anyone knows about, who knows and how. Seen with their own eyes, or told (by whom, in
// what words, how sure). The words drift as news passes on; the event each telling cites can't.
export function News({ view }: { view: StateView }) {
  return (
    <section className="panel news">
      <h2>Who knows what</h2>
      {view.news.length === 0 && <div className="muted">Nobody has seen anything worth talking about yet.</div>}
      {view.news.map((n) => (
        <div key={n.event_id} className="story">
          <div className="story-head">
            <span className="tag">{n.event_id}</span> {n.text}
          </div>
          <ul>
            {n.knowers.map((k) => (
              <li key={k.id}>
                <span className="who">{k.name}</span>
                <span className="bar confidence" title={`${pct(k.confidence)} sure`}>
                  <div style={{ width: pct(k.confidence) }} />
                </span>
                <span className="muted small">{k.how === 'witnessed' ? 'saw it' : `${pct(k.confidence)}, from ${k.told_by}: "${k.claim}"`}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// Every event, newest first. Rejections are where the "model proposes, code decides" story shows.
export function Ledger({ view }: { view: StateView }) {
  const rows = view.events.filter((e) => e.type !== 'SAID').reverse();
  return (
    <section className="panel ledger">
      <h2>Ledger</h2>
      {rows.length === 0 && <div className="muted">Nothing recorded yet.</div>}
      <ol>
        {rows.map((e) => (
          <li key={e.id} className={kind(e)}>
            <time>{clockText(e.tick).split(' · ')[1]}</time>
            <span>{describe(e, view)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function kind(e: EngineEvent) {
  if (e.type === 'ACTION_REJECTED') return 'reject';
  if (e.type === 'HAPPENED') return 'happened';
  if (e.type === 'CLOCK_ADVANCED') return 'clock';
  return 'event';
}

const offered = (c: ContractView | Extract<EngineEvent, { type: 'CONTRACT_PROPOSED' }>['data']['contract']) =>
  c.kind === 'made_to_order' ? `${c.item_name}, ${c.price} gold, ${c.delivery_ticks} h` : `${c.qty} × ${goodName(c.good)}, ${c.price} gold`;

const pct = (c: number) => `${Math.round(c * 100)}%`;

function why(t: Trigger): string {
  if (t.kind === 'every_hours') return `every ${t.hours} h`;
  if (t.kind === 'on_meet') return 'met someone with news';
  if (t.kind === 'on_new_memory') return 'heard news';
  return 'spoken to';
}

// Who a reported world event reached: everyone who sees anything, or the ones named.
function seenBy(e: Extract<EngineEvent, { type: 'HAPPENED' }>, view: StateView): string {
  if (e.data.seen_by === 'everyone') return 'the whole village saw it';
  const npcs = e.witnesses.filter((id) => id !== 'player');
  return npcs.length ? `seen by ${npcs.map((id) => nameOf(view, id)).join(', ')}` : 'nobody saw it';
}

function describe(e: EngineEvent, view: StateView): string {
  const who = nameOf(view, e.actor);
  switch (e.type) {
    case 'CONTRACT_PROPOSED':
      return `${who} offered ${e.data.contract.contract_id}: ${offered(e.data.contract)}${e.data.replaces ? ` (replaces ${e.data.replaces})` : ''}`;
    case 'CONTRACT_REFUSED':
      return e.data.contract_id ? `${who} withdrew ${e.data.contract_id}` : `${who} refused the order`;
    case 'CONTRACT_ACCEPTED':
      return `${e.data.contract_id} accepted: ${e.data.price} gold paid to ${nameOf(view, e.target ?? '')}`;
    case 'GOODS_DELIVERED':
      return `${e.data.contract_id} handed over by ${who}: ${e.data.qty} × ${goodName(e.data.good)}`;
    case 'WORK_STARTED':
      return `${e.data.contract_id} work started, due ${clockText(e.data.due_tick)}`;
    case 'ITEM_DELIVERED':
      return `${e.data.contract_id} delivered by the clock: ${e.data.item.item_name}`;
    case 'ACTION_REJECTED':
      return `Rejected ${e.actor} ${e.data.verb ?? 'output'}: ${e.data.reason}`;
    case 'CLOCK_ADVANCED':
      return `Time passes (${e.tick - e.data.from} h)`;
    case 'GIVEN':
      return gaveText(e, view);
    case 'GIFT_REFUSED':
      return `${who} refused ${giftText(e.data)} from ${e.target === 'player' ? 'you' : nameOf(view, e.target ?? '')} (${e.data.reason})`;
    case 'TRIGGER_FIRED':
      return `${who} acts on their own (${why(e.data.trigger)})`;
    case 'TOLD':
      return `${who} told ${nameOf(view, e.target ?? '')} about ${e.data.event_id} (${pct(e.data.confidence)} sure): "${e.data.summary}"`;
    case 'RETOLD':
      return `${who} retold ${e.data.event_id} to everyone around (${pct(e.data.confidence)} sure): "${e.data.summary}"`;
    case 'ANNOUNCED':
      return `${who} announced ${e.data.event_id} (${pct(e.data.confidence)} sure): "${e.data.summary}"`;
    case 'EMOTED':
      return `${who} ${e.data.text}`;
    case 'HAPPENED': {
      const late = e.data.reported_tick > e.tick ? `, reported ${e.data.reported_tick - e.tick} h later` : '';
      return `${e.data.notable ? 'Big news' : 'Happened'} at the ${e.location.replace(/_/g, ' ')}: ${e.data.text} (${seenBy(e, view)}${late})`;
    }
    case 'SYNCED':
      return `The game changed ${nameOf(view, e.target ?? '')}'s things: ${e.data.changes.map((c) => `${c.what === 'gold' ? 'gold' : goodName(c.what)} ${c.from} → ${c.to}`).join(', ')} (${e.data.reason})`;
    case 'SAID':
      return e.data.text;
  }
}
