import type { ContractView, EngineEvent, Gift, ItemArt, KnowerView, MadeToOrderView, StateView, Trigger } from '@blacksmith/shared';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { Popover } from './Drawer';
import { sourceChain } from './knowledge';
import { Help, Tip } from './Tip';
import { clockText } from './api';
import { gaveText, giftText, goodName, nameOf } from './Chat';

// Time and the purse, always in view. Village time moves only when the player says so; New game is in the menu,
// behind a confirmation, because it throws the whole world away.
export function Hud({
  view,
  disabled,
  onSkip,
  onReset,
  help,
  className = '',
}: {
  view: StateView;
  disabled: boolean;
  onSkip: (ticks: number) => void;
  onReset: () => void;
  help?: ReactNode;
  className?: string; // where it sits: beside the village on wide screens, above the chat on narrow ones
}) {
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed');
  const close = useCallback(() => setMenu('closed'), []);
  return (
    <section className={`panel hud ${className}`} aria-label="Time and gold">
      <div className="hud-row">
        <span className="clock">{clockText(view.tick)}</span>
        <span className="gold" aria-label={`${view.gold} gold`}>
          🪙 {view.gold}
        </span>
        {help}
        <Popover label="Menu" open={menu !== 'closed'} onOpen={() => setMenu('open')} onClose={close} className="hud-menu">
          {menu === 'confirm' ? (
            <div className="confirm">
              <p>Start over? Time, gold, items, offers and everything the villagers remember go back to the beginning.</p>
              <div className="actions">
                <button
                  className="danger small"
                  disabled={disabled}
                  onClick={() => {
                    close();
                    onReset();
                  }}
                >
                  Start a new game
                </button>
                <button className="secondary small" onClick={() => setMenu('open')} autoFocus>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ul className="menu-list">
              <li>
                <button className="secondary small" onClick={() => setMenu('confirm')} disabled={disabled}>
                  New game…
                </button>
              </li>
              <li>
                <a href="#/">Back to the entrance</a>
              </li>
            </ul>
          )}
        </Popover>
      </div>
      <div className="hud-time">
        <Tip text="Village time advances when you choose. Use +1 hour to see what happens next.">
          <button className="secondary small" onClick={() => onSkip(1)} disabled={disabled} data-focus-home>
            +1 hour
          </button>
        </Tip>
        <span className="muted small">Village time moves only when you choose.</span>
      </div>
    </section>
  );
}

// Work under way, only while there is some.
export function Forge({ view, disabled, onSkip }: { view: StateView; disabled: boolean; onSkip: (ticks: number) => void }) {
  const jobs = view.contracts.filter((c): c is MadeToOrderView => c.kind === 'made_to_order' && c.status === 'in_progress');
  if (jobs.length === 0) return null;
  const nextDue = Math.min(...jobs.map((j) => j.due_tick ?? Infinity));
  return (
    <section className="panel forge">
      <h2>Forge</h2>
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
        <Tip text="Advance village time until the next order is ready.">
          <button onClick={() => onSkip(Math.max(1, Math.min(48, nextDue - view.tick)))} disabled={disabled}>
            Wait until ready
          </button>
        </Tip>
      </div>
    </section>
  );
}

// One seller's unreserved stock, from the ledger.
export function Stock({ view, shop: id }: { view: StateView; shop: string }) {
  const shop = view.shops.find((s) => s.id === id);
  if (!shop) return null;
  return (
    <section className="panel stock-panel">
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
  );
}

// Folded to a one-line summary until opened; the village opens it when something arrives.
export function Inventory({
  view,
  disabled,
  onGive,
  open,
  onToggle,
}: {
  view: StateView;
  disabled: boolean;
  onGive: (to: string, gift: Gift) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const goods = Object.entries(view.goods).filter(([, n]) => n > 0);
  const count = view.items.length + goods.reduce((sum, [, n]) => sum + n, 0);
  const body = useId();
  return (
    <section className="panel inventory">
      <button id="gear" className="panel-toggle" aria-expanded={open} aria-controls={body} onClick={onToggle}>
        <span className="title">Your gear</span>
        <span className="muted small">{count === 0 ? 'empty' : count === 1 ? '1 thing' : `${count} things`}</span>
      </button>
      {open && (
        <div id={body} className="inventory-body">
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
            <div key={i.item_id} id={`item-${i.item_id}`} tabIndex={-1} className="item">
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
        </div>
      )}
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

// Gossip: for the latest events anyone knows about, who knows and how. Seen with their own eyes, or heard from
// someone, in that person's words. The words drift as news passes on; the event each telling cites can't. How sure
// they are, and the ids, are in each telling's details.
export function News({ view }: { view: StateView }) {
  const example = view.news.flatMap((n) => n.knowers.filter((k) => k.how !== 'witnessed').map((k) => ({ n, k })))[0];
  return (
    <section className="panel news">
      <h2>Who knows what</h2>
      {view.news.length === 0 && <div className="muted">Nobody has seen anything worth talking about yet.</div>}
      {view.news.length > 0 && (
        <p className="muted small news-intro">
          Villagers remember what they see, and may pass it on in their own words when they meet.
          {example && ` Here, ${example.k.name} didn't see it happen: ${example.k.told_by ?? 'someone'} told them.`}
        </p>
      )}
      {view.news.map((n) => {
        const saw = n.knowers.filter((k) => k.how === 'witnessed');
        const heard = n.knowers.filter((k) => k.how !== 'witnessed');
        return (
          <div key={n.event_id} id={`news-${n.event_id}`} tabIndex={-1} className="story">
            <div className="story-head">{n.text}</div>
            {saw.length > 0 && (
              <div className="witnessed">
                <span className="know-label">Witnessed</span> {saw.map((k) => k.name).join(', ')}
              </div>
            )}
            {heard.length > 0 && (
              <ul className="heard">
                {heard.map((k) => (
                  <li key={k.id}>
                    <details id={`know-${n.event_id}-${k.id}`}>
                      <summary>
                        <span className="who">{k.name}</span> <span className="know-label">Heard from {k.told_by ?? 'someone'}</span>
                      </summary>
                      <HowTheyKnow view={view} eventId={n.event_id} knower={k} />
                    </details>
                  </li>
                ))}
              </ul>
            )}
            <div className="tag story-id">Event {n.event_id}</div>
          </div>
        );
      })}
    </section>
  );
}

export const CONFIDENCE_TEXT = 'A simulation value that decreases with each retelling. It is not a measured probability that the story is true.';

// The way the news reached them, oldest step first, as far as the log the view carries records it.
function HowTheyKnow({ view, eventId, knower }: { view: StateView; eventId: string; knower: KnowerView }) {
  const chain = sourceChain(view, eventId, knower);
  const steps = [...chain.steps].reverse();
  const first = steps[0];
  return (
    <div className="chain">
      <ol>
        {!chain.whole && first.kind === 'told' && <li className="muted">How {first.by} knew isn't in the record shown here.</li>}
        {steps.map((s, i) =>
          s.kind === 'saw' ? (
            <li key={i}>{s.who} saw it happen.</li>
          ) : (
            <li key={i}>
              {s.by} told {s.who}
              {s.tick === null ? '' : ` at ${clockText(s.tick)}`}
              {s.words ? `: “${s.words}”` : '.'}
              {s.others.length > 0 && (
                <span className="muted">
                  {' '}
                  {s.who} had also heard it from {s.others.join(', ')}.
                </span>
              )}
            </li>
          ),
        )}
      </ol>
      <div className="muted small chain-confidence">
        Confidence {knower.confidence.toFixed(2)} <Help about="confidence" text={CONFIDENCE_TEXT} />
      </div>
    </div>
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
            {e.type === 'ACTION_REJECTED' && <RejectedProposal e={e} view={view} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

// A reason can quote whatever was proposed, so a rejection's ledger line keeps to a few lines; the whole reason, as
// stored, is under "View rejected proposal".
// The verb is whatever "action" the proposal named, so it is capped too.
const REASON_CHARS = 180;
const VERB_CHARS = 40;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const reasonText = (r: string) => (r.length > REASON_CHARS ? `${cut(r, REASON_CHARS)} (${r.length} characters; the full reason is below)` : r);

// What was proposed, exactly as the ledger stored it, beside why it was refused. Plain text, never markup; a proposal
// too long to keep whole is stored as a clipped string and shown as it is.
function RejectedProposal({ e, view }: { e: Extract<EngineEvent, { type: 'ACTION_REJECTED' }>; view: StateView }) {
  const proposed = e.data.proposed;
  const text = typeof proposed === 'string' ? proposed : (JSON.stringify(proposed, null, 2) ?? String(proposed));
  const who = e.actor === 'player' ? 'you (player)' : `${nameOf(view, e.actor)} (${e.actor})`;
  return (
    <details className="rejected">
      <summary>View rejected proposal</summary>
      <dl>
        <dt>Event</dt>
        <dd>{e.id}</dd>
        <dt>Actor</dt>
        <dd>{who}</dd>
        <dt>Reason</dt>
        <dd className="full-reason">{e.data.reason}</dd>
      </dl>
      <pre className="code">{text}</pre>
    </details>
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
      return `Rejected ${e.actor} ${cut(e.data.verb ?? 'output', VERB_CHARS)}: ${reasonText(e.data.reason)}`;
    case 'CLOCK_ADVANCED':
      return `Time passes (${e.tick - e.data.from} h)`;
    case 'GIVEN':
      return gaveText(e, view);
    case 'GIFT_REFUSED':
      return `${who} refused ${giftText(e.data)} from ${e.target === 'player' ? 'you' : nameOf(view, e.target ?? '')} (${e.data.reason})`;
    case 'TRIGGER_FIRED':
      return `${who} acts on their own (${why(e.data.trigger)})`;
    case 'TOLD':
      return `${who} told ${nameOf(view, e.target ?? '')} about ${e.data.event_id} (confidence ${e.data.confidence.toFixed(2)}): "${e.data.summary}"`;
    case 'RETOLD':
      return `${who} retold ${e.data.event_id} to everyone around (confidence ${e.data.confidence.toFixed(2)}): "${e.data.summary}"`;
    case 'ANNOUNCED':
      return `${who} announced ${e.data.event_id} (confidence ${e.data.confidence.toFixed(2)}): "${e.data.summary}"`;
    case 'EMOTED':
      return `${who} ${e.data.text}`;
    case 'HAPPENED': {
      const late = e.data.reported_tick > e.tick ? `, reported ${e.data.reported_tick - e.tick} h later` : '';
      return `${e.data.notable ? 'Big news' : 'Happened'} at the ${e.location.replace(/_/g, ' ')}: ${e.data.text} (${seenBy(e, view)}${late})`;
    }
    case 'SIGNALED':
      return `${who} asks the game to ${e.data.signal.replace(/_/g, ' ')}${e.target ? ` (for ${e.target === 'player' ? 'you' : nameOf(view, e.target)})` : ''}; the game's own code decides`;
    case 'SYNCED':
      return `The game changed ${nameOf(view, e.target ?? '')}'s things: ${e.data.changes.map((c) => `${c.what === 'gold' ? 'gold' : goodName(c.what)} ${c.from} → ${c.to}`).join(', ')} (${e.data.reason})`;
    case 'SAID':
      return e.data.text;
  }
}
