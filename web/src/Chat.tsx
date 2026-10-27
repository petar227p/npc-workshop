import type { ContractView, EngineEvent, StateView } from '@blacksmith/shared';
// The zod-free module, so the schemas stay out of the bundle.
import { MAX_SAY_LENGTH } from '@blacksmith/shared/src/limits';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clockText } from './api';

type Props = {
  view: StateView;
  pending: string | null; // the player's line while Brann is thinking
  onSay: (text: string) => void;
  onAccept: (contractId: string) => void;
};

export function Chat({ view, pending, onSay, onAccept }: Props) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const thinking = pending !== null;

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' });
  }, [view.events.length, pending]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || thinking) return;
    setText('');
    onSay(t);
  };

  return (
    <section className="panel chat-panel">
      <div className="chat-head">
        <div className="portrait" />
        <div>
          <div className="chat-name">Brann the Smith</div>
          <div className="tag">Muse Spark · proposes; the ledger decides</div>
        </div>
      </div>
      <div className="messages" ref={box}>
        <div className="msg npc">Brann looks up from the anvil. "What'll it be?"</div>
        {speechFirst(view.events).map((e) => (
          <Entry key={e.id} event={e} view={view} disabled={thinking} onAccept={onAccept} />
        ))}
        {pending !== null && (
          <>
            <div className="msg you">{pending}</div>
            <div className="msg npc thinking" aria-live="polite">
              Brann is thinking<span className="dots" />
            </div>
          </>
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_SAY_LENGTH}
          placeholder="Describe what you want forged…"
          aria-label="Message to Brann"
          autoFocus
        />
        <button disabled={thinking || !text.trim()}>Send</button>
      </form>
    </section>
  );
}

// The smith's line is logged after the action it goes with (so a rejected offer is never announced),
// but it reads better above the card. Display order only; the log is untouched.
export function speechFirst(events: EngineEvent[], npc = 'smith'): EngineEvent[] {
  const out = [...events];
  for (let i = 0; i < out.length - 1; i++) {
    const [a, b] = [out[i], out[i + 1]];
    if ((a.type === 'CONTRACT_PROPOSED' || a.type === 'CONTRACT_REFUSED') && b.type === 'SAID' && b.actor === npc) {
      [out[i], out[i + 1]] = [b, a];
      i++;
    }
  }
  return out;
}

function Entry({ event: e, view, disabled, onAccept }: { event: EngineEvent; view: StateView; disabled: boolean; onAccept: (id: string) => void }) {
  switch (e.type) {
    case 'SAID':
      return <div className={`msg ${e.actor === 'smith' ? 'npc' : 'you'}`}>{e.data.text}</div>;
    case 'CONTRACT_PROPOSED': {
      const c = view.contracts.find((x) => x.contract_id === e.data.contract.contract_id);
      return c ? <ContractCard c={c} gold={view.gold} disabled={disabled} onAccept={onAccept} /> : null;
    }
    case 'CONTRACT_REFUSED':
      return <div className="note">{e.data.contract_id ? `Brann withdrew offer ${e.data.contract_id}.` : 'Brann refused.'}</div>;
    case 'WORK_STARTED':
      return <div className="note">The hammer rings. Ready at {clockText(e.data.due_tick)}.</div>;
    case 'ITEM_DELIVERED':
      return <div className="note ok">Brann hands you the {e.data.item.item_name}.</div>;
    default:
      return null;
  }
}

const STATUS: Record<ContractView['status'], string> = {
  proposed: '',
  superseded: 'replaced by a counter-offer',
  refused: 'withdrawn',
  accepted: 'accepted',
  in_progress: 'on the anvil',
  delivered: 'delivered',
};

// Without onAccept (the editor's test bench) an open offer is shown but can't be taken.
export function ContractCard({ c, gold, disabled, onAccept }: { c: ContractView; gold: number; disabled: boolean; onAccept?: (id: string) => void }) {
  const open = c.status === 'proposed';
  const short = gold < c.price;
  return (
    <div className={`contract ${open ? '' : 'closed'}`}>
      <div className="contract-top">
        <span className="title">{c.item_name}</span>
        <span className="tag">
          {c.contract_id} · {c.item_type}
        </span>
      </div>
      <div className="muted desc">{c.description}</div>
      <div className="stats">
        <div>
          <b>{c.stats.damage}</b>damage
        </div>
        <div>
          <b>{c.stats.weight}</b>weight
        </div>
        <div>
          <b>{c.stats.durability}</b>durability
        </div>
      </div>
      <div className="terms">
        <span>
          🪙 <b>{c.price}</b> · ready in <b>{c.delivery_ticks} h</b>
        </span>
        <span className="tag">{Object.entries(c.materials_used).map(([m, n]) => `${n} ${m.replace('_', ' ')}`).join(', ')}</span>
      </div>
      <div className="remark">"{c.smith_remarks}"</div>
      {open && onAccept ? (
        <div className="actions">
          <button disabled={disabled || short} onClick={() => onAccept(c.contract_id)}>
            Accept · pay {c.price}
          </button>
          {short && <span className="tag bad">You have {gold} gold.</span>}
        </div>
      ) : (
        <div className="tag status">{STATUS[c.status] || 'open offer'}</div>
      )}
    </div>
  );
}
