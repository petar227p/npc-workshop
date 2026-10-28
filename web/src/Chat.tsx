import type { ContractView, EngineEvent, StateView } from '@blacksmith/shared';
// The zod-free module, so the schemas stay out of the bundle.
import { MAX_SAY_LENGTH } from '@blacksmith/shared/src/limits';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clockText } from './api';

type Props = {
  view: StateView;
  talkTo: string; // the NPC the next line goes to
  onTalkTo: (npc: string) => void;
  pending: string | null; // the player's line while that NPC is thinking
  onSay: (text: string) => void;
  onAccept: (contractId: string) => void;
};

// Display names come with each seller's stock in the view.
export const nameOf = (view: StateView, id: string) => view.shops.find((s) => s.id === id)?.name ?? id;

export function Chat({ view, talkTo, onTalkTo, pending, onSay, onAccept }: Props) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const thinking = pending !== null;
  const name = nameOf(view, talkTo);

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
          <label className="chat-name">
            <span className="sr-only">Talking to </span>
            <select value={talkTo} onChange={(e) => onTalkTo(e.target.value)} disabled={thinking} aria-label="Who you talk to">
              {view.shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="tag">Muse Spark · proposes; the ledger decides</div>
        </div>
      </div>
      <div className="messages" ref={box}>
        <div className="msg npc">{talkTo === 'smith' ? 'Brann looks up from the anvil.' : `${name} looks up.`} "What'll it be?"</div>
        {speechFirst(view.events).map((e) => (
          <Entry key={e.id} event={e} view={view} disabled={thinking} onAccept={onAccept} />
        ))}
        {pending !== null && (
          <>
            <div className="msg you">{pending}</div>
            <div className="msg npc thinking" aria-live="polite">
              {name} is thinking<span className="dots" />
            </div>
          </>
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_SAY_LENGTH}
          placeholder={talkTo === 'smith' ? 'Describe what you want forged…' : `Ask ${name} for something…`}
          aria-label={`Message to ${name}`}
          autoFocus
        />
        <button disabled={thinking || !text.trim()}>Send</button>
      </form>
    </section>
  );
}

// An NPC's line is logged after the action it goes with (so a rejected offer is never announced),
// but it reads better above the card. Display order only; the log is untouched.
export function speechFirst(events: EngineEvent[]): EngineEvent[] {
  const out = [...events];
  for (let i = 0; i < out.length - 1; i++) {
    const [a, b] = [out[i], out[i + 1]];
    if ((a.type === 'CONTRACT_PROPOSED' || a.type === 'CONTRACT_REFUSED') && b.type === 'SAID' && b.actor === a.actor) {
      [out[i], out[i + 1]] = [b, a];
      i++;
    }
  }
  return out;
}

function Entry({ event: e, view, disabled, onAccept }: { event: EngineEvent; view: StateView; disabled: boolean; onAccept: (id: string) => void }) {
  switch (e.type) {
    case 'SAID':
      if (e.actor === 'player') return <div className="msg you">{e.data.text}</div>;
      return (
        <div className="msg npc">
          <span className="who">{nameOf(view, e.actor)}</span>
          {e.data.text}
        </div>
      );
    case 'CONTRACT_PROPOSED': {
      const c = view.contracts.find((x) => x.contract_id === e.data.contract.contract_id);
      return c ? <ContractCard c={c} gold={view.gold} disabled={disabled} onAccept={onAccept} /> : null;
    }
    case 'CONTRACT_REFUSED': {
      const who = nameOf(view, e.actor);
      return <div className="note">{e.data.contract_id ? `${who} withdrew offer ${e.data.contract_id}.` : `${who} refused.`}</div>;
    }
    case 'WORK_STARTED':
      return <div className="note">The hammer rings. Ready at {clockText(e.data.due_tick)}.</div>;
    case 'ITEM_DELIVERED': {
      // The clock delivers, so the giver is the contract's seller; without the contract, name nobody rather than guess.
      const seller = view.contracts.find((c) => c.contract_id === e.data.contract_id)?.seller;
      return (
        <div className="note ok">
          {seller ? `${nameOf(view, seller)} hands you` : 'You receive'} the {e.data.item.item_name}.
        </div>
      );
    }
    case 'GOODS_DELIVERED':
      return (
        <div className="note ok">
          {nameOf(view, e.actor)} hands you {e.data.qty} × {goodName(e.data.good)}.
        </div>
      );
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

export const goodName = (good: string) => good.replace(/_/g, ' ');

// Without onAccept (the editor's test bench) an open offer is shown but can't be taken.
export function ContractCard({ c, gold, disabled, onAccept }: { c: ContractView; gold: number; disabled: boolean; onAccept?: (id: string) => void }) {
  const open = c.status === 'proposed';
  const short = gold < c.price;
  return (
    <div className={`contract ${open ? '' : 'closed'}`}>
      {c.kind === 'made_to_order' ? (
        <>
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
            <span className="tag">{Object.entries(c.materials_used).map(([m, n]) => `${n} ${goodName(m)}`).join(', ')}</span>
          </div>
        </>
      ) : (
        <>
          <div className="contract-top">
            <span className="title">
              {c.qty} × {goodName(c.good)}
            </span>
            <span className="tag">{c.contract_id} · from stock</span>
          </div>
          <div className="terms">
            <span>
              🪙 <b>{c.price}</b> · handed over at once
            </span>
          </div>
        </>
      )}
      <div className="remark">"{c.remarks}"</div>
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
