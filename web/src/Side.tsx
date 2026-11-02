import type { ContractView, EngineEvent, Gift, ItemArt, KnowerView, MadeToOrderView, StateView } from '@blacksmith/shared';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { Popover } from './Drawer';
import { sourceChain } from './knowledge';
import { Tip } from './Tip';
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
  className?: string;
}) {
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed');
  const close = useCallback(() => setMenu('closed'), []);
  return (
    <section className={`hud ${className}`} aria-label="Time and gold">
      <span className="clock">{clockText(view.tick)}</span>
      <span className="gold" aria-label={`${view.gold} gold`}>
        🪙 {view.gold}
      </span>
      <Tip text="Village time moves only when you choose. Use +1 hour to see what happens next.">
        <button className="secondary small" onClick={() => onSkip(1)} disabled={disabled} data-focus-home>
          +1 hour
        </button>
      </Tip>
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
// Each story going around as a card: who saw it, how it travelled from them to everyone who heard it (in each one's
// own words, beside what really happened), and who hasn't heard yet.
export function News({ view }: { view: StateView }) {
  return (
    <section className="panel news">
      <h2>Rumours</h2>
      {view.news.length === 0 ? (
        <div className="muted">Nothing is going around yet. Report something in Sandbox tools, or press +1 hour and see who talks.</div>
      ) : (
        <p className="muted small news-intro">What each villager knows, and how it reached them. Stories change as they’re retold.</p>
      )}
      {view.news.map((n) => {
        const saw = n.knowers.filter((k) => k.how === 'witnessed');
        const heard = n.knowers.filter((k) => k.how !== 'witnessed');
        const knows = new Set(n.knowers.map((k) => k.id));
        const notYet = view.people.filter((p) => !knows.has(p.id));
        return (
          <article key={n.event_id} id={`news-${n.event_id}`} tabIndex={-1} className="story">
            <p className="story-head">{n.text}</p>
            <div className="story-row">
              <span className="story-label saw">Saw it</span>
              <span>{saw.length ? saw.map((k) => k.name).join(', ') : 'Nobody'}</span>
            </div>
            {heard.length > 0 && (
              <div className="story-row">
                <span className="story-label">Heard it</span>
                <ul className="heard">
                  {heard.map((k) => (
                    <li key={k.id}>
                      <details id={`know-${n.event_id}-${k.id}`}>
                        <summary>
                          <span className="who">{k.name}</span> <span className="muted">from {k.told_by ?? 'someone'} · {certainty(view, n.event_id, k)}</span>
                          {k.claim && <q className="claim">{k.claim}</q>}
                        </summary>
                        <HowTheyKnow view={view} eventId={n.event_id} knower={k} />
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notYet.length > 0 && (
              <div className="story-row not-yet">
                <span className="story-label">Hasn’t heard</span>
                <span>{notYet.map((p) => p.name).join(', ')}</span>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

// How close a knower is to someone who saw it, in words: counted along the recorded tellings, not read off the
// simulation's confidence number.
function certainty(view: StateView, eventId: string, knower: KnowerView): string {
  const chain = sourceChain(view, eventId, knower);
  const hops = chain.steps.filter((s) => s.kind === 'told').length;
  if (!chain.whole) return 'heard it secondhand';
  if (hops <= 1) return 'straight from a witness';
  if (hops === 2) return 'secondhand';
  return `${hops} tellings from a witness, getting fuzzy`;
}

// The way the news reached them, from whoever saw it, as far as the log the view carries records it.
function HowTheyKnow({ view, eventId, knower }: { view: StateView; eventId: string; knower: KnowerView }) {
  const chain = sourceChain(view, eventId, knower);
  const steps = [...chain.steps].reverse();
  const first = steps[0];
  const truth = view.news.find((n) => n.event_id === eventId)?.text;
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
              {/* The knower's own words are on the card already. */}
              {s.words && !(i === steps.length - 1 && s.words === knower.claim) ? `: “${s.words}”` : '.'}
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
      {truth && (
        <p className="muted small chain-truth">
          What really happened: {truth}
        </p>
      )}
    </div>
  );
}

// Everything that happened, newest first, in plain words: the hour as a heading over what happened in it, and a
// filter for the kind of thing. Rule checks are cards: what a model tried, and why the code blocked it.
type LogFilter = 'all' | 'deals' | 'rumours' | 'rules';
const FILTERS: [LogFilter, string][] = [
  ['all', 'All'],
  ['deals', 'Deals'],
  ['rumours', 'Rumours'],
  ['rules', 'Rule checks'],
];
const KIND: Partial<Record<EngineEvent['type'], Exclude<LogFilter, 'all'>>> = {
  CONTRACT_PROPOSED: 'deals',
  CONTRACT_REFUSED: 'deals',
  CONTRACT_ACCEPTED: 'deals',
  WORK_STARTED: 'deals',
  ITEM_DELIVERED: 'deals',
  GOODS_DELIVERED: 'deals',
  GIVEN: 'deals',
  GIFT_REFUSED: 'deals',
  SYNCED: 'deals',
  TOLD: 'rumours',
  RETOLD: 'rumours',
  ANNOUNCED: 'rumours',
  HAPPENED: 'rumours',
  ACTION_REJECTED: 'rules',
  SIGNALED: 'rules',
};
// Not lines of their own: the passing hours are the headings, a line said is in the chat, and an NPC acting on its
// own shows as what it did.
const UNLOGGED = new Set<EngineEvent['type']>(['SAID', 'CLOCK_ADVANCED', 'TRIGGER_FIRED']);

export function VillageLog({ view }: { view: StateView }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const rows = view.events.filter((e) => !UNLOGGED.has(e.type) && (filter === 'all' || KIND[e.type] === filter)).reverse();
  const hours: { tick: number; events: EngineEvent[] }[] = [];
  for (const e of rows) {
    const last = hours[hours.length - 1];
    if (last && last.tick === e.tick) last.events.push(e);
    else hours.push({ tick: e.tick, events: [e] });
  }
  return (
    <section className="panel ledger">
      <h2>Village log</h2>
      <div className="log-filters" role="group" aria-label="Show">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      {hours.length === 0 && (
        <div className="muted">
          {filter === 'all'
            ? 'Nothing has happened yet. Talk to someone, or press +1 hour.'
            : filter === 'rules'
              ? 'Nothing has been blocked yet. When a villager tries something the rules don’t allow, it shows here.'
              : `No ${filter} yet.`}
        </div>
      )}
      {hours.map((h) => (
        <div key={h.tick} className="log-hour">
          <h3 className="log-time">{clockText(h.tick)}</h3>
          <ol>
            {h.events.map((e) => (
              <li key={e.id} className={kind(e)}>
                {e.type === 'ACTION_REJECTED' ? <RuleCheck e={e} view={view} /> : plain(e, view)}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

// A reason can quote whatever was proposed, so the card keeps it to a few lines; the whole reason, as stored, is under
// Technical details.
const REASON_CHARS = 180;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

// What each verb a model can propose is, as something someone tries to do.
const TRIED: Record<string, string> = {
  SAY: 'say something',
  EMOTE: 'act something out',
  OFFER: 'make an offer',
  COUNTER_OFFER: 'change an offer',
  REFUSE: 'turn down a deal',
  ACCEPT: 'accept a deal',
  START_WORK: 'start work on an order',
  DELIVER: 'hand over an order',
  GIVE: 'give something away',
  TELL: 'pass on news',
  RETELL: 'spread news',
  ANNOUNCE: 'announce news',
  SIGNAL: 'ask the game for something',
};

// An offer's terms, when the proposal had some: what, and for how much.
function termsOf(proposed: unknown): string {
  const t = (proposed as { terms?: { item_name?: unknown; good?: unknown; qty?: unknown; price?: unknown } } | null)?.terms;
  if (!t || typeof t.price !== 'number') return '';
  const what = typeof t.item_name === 'string' ? t.item_name : typeof t.good === 'string' ? `${t.qty ?? ''} × ${goodName(t.good)}` : null;
  return what ? ` (${what} for ${t.price} gold)` : ` (for ${t.price} gold)`;
}

// What was tried and why it was blocked, up front; what was proposed, exactly as the ledger stored it, under Technical
// details. Plain text, never markup; a proposal too long to keep whole is stored as a clipped string and shown as it is.
function RuleCheck({ e, view }: { e: Extract<EngineEvent, { type: 'ACTION_REJECTED' }>; view: StateView }) {
  const proposed = e.data.proposed;
  const text = typeof proposed === 'string' ? proposed : (JSON.stringify(proposed, null, 2) ?? String(proposed));
  const who = e.actor === 'player' ? 'You' : nameOf(view, e.actor);
  const verb = e.data.verb ? TRIED[e.data.verb] : null;
  const tried = verb
    ? `tried to ${verb}${termsOf(proposed)}`
    : e.data.verb
      ? `tried something the rules don’t know (${cut(e.data.verb, 40)})`
      : 'answered in a way the rules couldn’t read';
  return (
    <div className="rule-check">
      <p className="rule-tried">
        {who} {tried}
      </p>
      <p className="rule-blocked">
        <b>Blocked by the rules</b> {cut(e.data.reason, REASON_CHARS)}
      </p>
      <details className="rejected">
        <summary>Technical details</summary>
        <dl>
          <dt>Event</dt>
          <dd>{e.id}</dd>
          <dt>Actor</dt>
          <dd>{e.actor}</dd>
          <dt>Reason</dt>
          <dd className="full-reason">{e.data.reason}</dd>
        </dl>
        <pre className="code">{text}</pre>
      </details>
    </div>
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

// Who a reported world event reached: everyone who sees anything, or the ones named.
function seenBy(e: Extract<EngineEvent, { type: 'HAPPENED' }>, view: StateView): string {
  if (e.data.seen_by === 'everyone') return 'The whole village saw it';
  const npcs = e.witnesses.filter((id) => id !== 'player');
  return npcs.length ? `Seen by ${npcs.map((id) => nameOf(view, id)).join(', ')}` : 'Nobody saw it';
}

// A deal by what it's for, not its id: the item, or the goods and how many.
function dealName(view: StateView, id: string | null): string {
  const c = id ? view.contracts.find((x) => x.contract_id === id) : undefined;
  if (!c) return 'the order';
  return c.kind === 'made_to_order' ? `the ${c.item_name}` : `${c.qty} × ${goodName(c.good)}`;
}

// One line of the log, as a sentence.
function plain(e: EngineEvent, view: StateView): string {
  const name = (id: string | null) => (id === 'player' ? 'you' : nameOf(view, id ?? ''));
  const Who = e.actor === 'player' ? 'You' : nameOf(view, e.actor);
  switch (e.type) {
    case 'CONTRACT_PROPOSED':
      return `${Who} ${e.data.replaces ? 'changed the offer to' : 'offered'} ${name(e.data.customer)}: ${offered(e.data.contract)}`;
    case 'CONTRACT_REFUSED':
      return e.data.contract_id ? `${Who} withdrew the offer for ${dealName(view, e.data.contract_id)}` : `${Who} turned down the order`;
    case 'CONTRACT_ACCEPTED':
      return `${Who} accepted the deal for ${dealName(view, e.data.contract_id)} and paid ${name(e.target)} ${e.data.price} gold`;
    case 'GOODS_DELIVERED':
      return `${Who} handed over ${e.data.qty} × ${goodName(e.data.good)}`;
    case 'WORK_STARTED':
      return `${Who} started work on ${dealName(view, e.data.contract_id)}, ready ${clockText(e.data.due_tick)}`;
    case 'ITEM_DELIVERED':
      return `The ${e.data.item.item_name} is finished and handed to ${name(e.data.item.owner)}`;
    case 'GIVEN':
      return gaveText(e, view);
    case 'GIFT_REFUSED':
      return `${Who} refused ${giftText(e.data)} from ${name(e.target)}`;
    case 'TOLD':
      return `${Who} told ${name(e.target)}: “${e.data.summary}”`;
    case 'RETOLD':
      return `${Who} told everyone nearby: “${e.data.summary}”`;
    case 'ANNOUNCED':
      return `${Who} announced: “${e.data.summary}”`;
    case 'EMOTED':
      return `${Who} ${e.data.text}`;
    case 'HAPPENED': {
      const late = e.data.reported_tick > e.tick ? ` Reported ${e.data.reported_tick - e.tick} h later.` : '';
      return `${e.data.notable ? 'Big news' : 'Something happened'} at the ${e.location.replace(/_/g, ' ')}: ${e.data.text} ${seenBy(e, view)}.${late}`;
    }
    case 'SIGNALED':
      return `${Who} asked the game to ${e.data.signal.replace(/_/g, ' ')}${e.target ? ` for ${name(e.target)}` : ''}. The game’s own code decides.`;
    case 'SYNCED':
      return `The game updated ${name(e.target)}’s things: ${e.data.changes.map((c) => `${c.what === 'gold' ? 'gold' : goodName(c.what)} ${c.from} → ${c.to}`).join(', ')} (${e.data.reason})`;
    case 'TRIGGER_FIRED':
      return `${Who} acts on their own`;
    case 'ACTION_REJECTED':
      return `${Who} was blocked by the rules: ${cut(e.data.reason, REASON_CHARS)}`;
    case 'CLOCK_ADVANCED':
      return 'Time passes';
    case 'SAID':
      return e.data.text;
  }
}
