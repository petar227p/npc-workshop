import type { EngineEvent, ItemArt, StateView } from '@blacksmith/shared';
import { clockText } from './api';

type ForgeProps = { view: StateView; disabled: boolean; onSkip: (ticks: number) => void; onReset: () => void };

export function Forge({ view, disabled, onSkip, onReset }: ForgeProps) {
  const jobs = view.contracts.filter((c) => c.status === 'in_progress');
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

export function Stock({ view }: { view: StateView }) {
  return (
    <section className="panel">
      <h2>Brann's stock</h2>
      <ul className="stock">
        {Object.entries(view.materials).map(([m, n]) => (
          <li key={m} className={n <= 0 ? 'muted' : ''}>
            <span>{m.replace('_', ' ')}</span>
            <b>{n}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Inventory({ view }: { view: StateView }) {
  if (view.items.length === 0) return null;
  return (
    <section className="panel">
      <h2>Your gear</h2>
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
    </section>
  );
}

// The Muse Image sprite once it's drawn; Kenney's sword tile until then (pulsing while Brann's sketch is on its way).
function ItemPicture({ name, art }: { name: string; art: ItemArt | undefined }) {
  if (art?.url) return <img className="item-sprite" src={art.url} alt={name} width={64} height={64} />;
  const drawing = art?.status === 'rendering';
  return <div className={`portrait item-art${drawing ? ' drawing' : ''}`} title={drawing ? 'Being drawn…' : name} />;
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
            <span>{describe(e)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function kind(e: EngineEvent) {
  if (e.type === 'ACTION_REJECTED') return 'reject';
  if (e.type === 'CLOCK_ADVANCED') return 'clock';
  return 'event';
}

function describe(e: EngineEvent): string {
  switch (e.type) {
    case 'CONTRACT_PROPOSED': {
      const c = e.data.contract;
      return `${c.contract_id} offered: ${c.item_name}, ${c.price} gold, ${c.delivery_ticks} h${e.data.replaces ? ` (replaces ${e.data.replaces})` : ''}`;
    }
    case 'CONTRACT_REFUSED':
      return e.data.contract_id ? `${e.data.contract_id} withdrawn` : 'Order refused';
    case 'CONTRACT_ACCEPTED':
      return `${e.data.contract_id} accepted: ${e.data.price} gold paid, materials reserved`;
    case 'WORK_STARTED':
      return `${e.data.contract_id} work started, due ${clockText(e.data.due_tick)}`;
    case 'ITEM_DELIVERED':
      return `${e.data.contract_id} delivered by the clock: ${e.data.item.item_name}`;
    case 'ACTION_REJECTED':
      return `Rejected ${e.actor} ${e.data.verb ?? 'output'}: ${e.data.reason}`;
    case 'CLOCK_ADVANCED':
      return `Time passes (${e.tick - e.data.from} h)`;
    case 'SAID':
      return e.data.text;
  }
}
