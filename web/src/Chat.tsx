import type { ContractView, EngineEvent, StateView } from '@blacksmith/shared';
// The zod-free module, so the schemas stay out of the bundle.
import { MAX_SAY_LENGTH } from '@blacksmith/shared/src/limits';
import { MODEL_INFO } from '@blacksmith/shared/src/npc-info';
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { api, clockText } from './api';
import { withRole } from './roles';
import { ConversationLog } from './ConversationLog';
import { canRecord, record, type Recording } from './voice';

export type Pending = { text: string; npc: string }; // the player's line while that NPC is thinking

type Props = {
  view: StateView;
  talkTo: string; // the NPC the next line goes to; the chat shows only the conversation with it
  onTalkTo: (npc: string) => void;
  pending: Pending | null;
  onSay: (text: string) => void;
  onAccept: (contractId: string) => void;
  inputRef?: RefObject<HTMLInputElement>; // the village focuses it when the player walks up to someone
  onError?: (message: string | null) => void; // where the mic's trouble is shown
  headExtra?: ReactNode; // beside the name: the village's way to this NPC's stock
  prefill?: { text: string; n: number } | null; // a suggested line put in the box (each new n), for the player to edit or send
  onInputFocus?: () => void;
};

// A Tiny Dungeon character frame at 3x, as the portrait's background.
const portraitStyle = (frame: number) => ({ backgroundPosition: `-${(frame % 12) * 48}px -${Math.floor(frame / 12) * 48}px` });

// Display names come with the people in the view (and each seller's stock).
export const nameOf = (view: StateView, id: string) => view.people.find((p) => p.id === id)?.name ?? view.shops.find((s) => s.id === id)?.name ?? id;

export function Chat({ view, talkTo, onTalkTo, pending, onSay, onAccept, inputRef, onError, headExtra, prefill, onInputFocus }: Props) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text.slice(0, MAX_SAY_LENGTH));
    inputRef?.current?.focus();
  }, [prefill?.n]);
  const box = useRef<HTMLDivElement>(null);
  // One NPC thinks at a time and the server is locked until it's done, so nobody can be spoken to meanwhile.
  const thinking = pending !== null;
  const name = nameOf(view, talkTo);
  const person = view.people.find((p) => p.id === talkTo);
  const lines = speechFirst(view.events.filter((e) => between(e, talkTo, view)));

  // On the newest line, not the count: once the log is past the view's cap, a line can arrive as an old one drops out.
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' });
  }, [lines.at(-1)?.id, pending]);
  // Another NPC's chat starts at its latest line, without scrolling through.
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [talkTo]);

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
        <div className="portrait" style={portraitStyle(person?.sprite ?? 86)} />
        <div>
          <label className="chat-name">
            <span className="sr-only">Talking to </span>
            <select value={talkTo} onChange={(e) => onTalkTo(e.target.value)} disabled={thinking} aria-label="Who you talk to">
              {view.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {withRole(p.id, p.name)}
                </option>
              ))}
            </select>
          </label>
          <div className="tag">{(person && MODEL_INFO[person.model]?.label) ?? 'The model'} · proposes; the ledger decides</div>
        </div>
        {headExtra && <div className="chat-head-extra">{headExtra}</div>}
      </div>
      <div className="messages" ref={box}>
        <ConversationLog key={`${view.world_id}:${talkTo}`} name={name}>
          <div className="msg npc">{talkTo === 'smith' ? 'Brann looks up from the anvil.' : `${name} looks up.`} "What'll it be?"</div>
          {lines.map((e) => (
            <Entry key={e.id} event={e} view={view} disabled={thinking} onAccept={onAccept} />
          ))}
        </ConversationLog>
        {pending?.npc === talkTo && (
          <>
            <div className="msg you">{pending.text}</div>
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
          ref={inputRef}
          onFocus={onInputFocus}
          // Esc hands the keys back to walking.
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
        {canRecord() && (
          <Mic
            disabled={thinking}
            onError={onError ?? (() => {})}
            // What was heard goes in the box, after anything typed, for the player to read over and send.
            onText={(heard) => {
              setText((t) => (t.trim() ? `${t.trim()} ${heard}` : heard).slice(0, MAX_SAY_LENGTH));
              inputRef?.current?.focus();
            }}
          />
        )}
        <button disabled={thinking || !text.trim()}>Send</button>
      </form>
    </section>
  );
}

// Click to speak, click again to stop: the clip goes to Muse Voice Transcribe and the words come back into the box.
// It stops itself at the server's limit. Nothing is said to anyone until Send.
function Mic({ disabled, onText, onError }: { disabled: boolean; onText: (text: string) => void; onError: (message: string | null) => void }) {
  const [state, setState] = useState<'idle' | 'listening' | 'hearing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<Recording | null>(null);

  useEffect(() => () => rec.current?.cancel(), []);
  useEffect(() => {
    if (state !== 'listening') return;
    const began = Date.now();
    setSeconds(0);
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 250);
    return () => clearInterval(timer);
  }, [state]);

  const finish = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setState('hearing');
    try {
      const wav = await r.stop();
      if (wav.length < 44 + 16_000 * 2 * 0.4) return onError('Hold the mic a little longer, then click again to stop.');
      const { text } = await api.transcribe(wav);
      if (text) onText(text);
      else onError("Nobody caught any words. Try again, or type it.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setState('idle');
    }
  };

  const start = async () => {
    onError(null);
    try {
      rec.current = await record(() => void finish());
      setState('listening');
    } catch {
      onError('No microphone to listen with. Allow it in the browser, or type instead.');
    }
  };

  const listening = state === 'listening';
  return (
    <button
      type="button"
      className={`secondary mic ${listening ? 'on' : ''}`}
      disabled={state === 'hearing' || (disabled && !listening)}
      onClick={() => void (listening ? finish() : start())}
      aria-label={listening ? 'Stop and use what you said' : 'Speak instead of typing'}
      aria-pressed={listening}
      title={listening ? 'Click to stop' : 'Speak (Muse Voice Transcribe)'}
    >
      {state === 'hearing' ? '…' : listening ? `■ ${seconds}s` : '🎙'}
    </button>
  );
}

// Whether an event belongs in the player's chat with `npc`: what the two said and gave each other, the NPC's offers
// to the player and its own sales' handovers. An NPC's lines to nobody in particular (acting on its own) count too.
// Same split as the NPC's own history on the server (npcs/history.ts), from the player's side.
export function between(e: EngineEvent, npc: string, view: StateView): boolean {
  const toPlayer = e.actor === npc && e.target === 'player';
  switch (e.type) {
    case 'SAID':
    case 'EMOTED':
    case 'SIGNALED':
      return (e.actor === npc && e.target === null) || toPlayer || (e.actor === 'player' && e.target === npc);
    case 'GIVEN':
    case 'GIFT_REFUSED':
      return toPlayer || (e.actor === 'player' && e.target === npc);
    case 'TOLD':
      return toPlayer;
    case 'CONTRACT_PROPOSED':
    case 'CONTRACT_REFUSED':
    case 'WORK_STARTED':
    case 'GOODS_DELIVERED':
      return toPlayer;
    case 'ITEM_DELIVERED': // the clock delivers, so the contract says whose work it was
      return e.target === 'player' && view.contracts.find((c) => c.contract_id === e.data.contract_id)?.seller === npc;
    default:
      return false;
  }
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
      if (e.actor === 'player') return <div className="msg you"><span className="sr-only">You: </span>{e.data.text}</div>;
      return (
        <div className="msg npc">
          <span className="who">{nameOf(view, e.actor)}</span>
          {e.data.text}
        </div>
      );
    case 'EMOTED':
      return (
        <div className="msg npc emote">
          <span className="who">{nameOf(view, e.actor)}</span>
          <i>{e.data.text}</i>
        </div>
      );
    case 'GIVEN':
      return <div className="note ok">{gaveText(e, view)}</div>;
    // A request to the game. The village has no code behind it, so it only shows what a game would be asked.
    case 'SIGNALED':
      return (
        <div className="note">
          {nameOf(view, e.actor)} signals <code>{e.data.signal}</code>. A game would act on it here.
        </div>
      );
    // The line itself is the SAID after it; this is the ledger's side: which event.
    case 'TOLD':
      return (
        <div className="note">
          {nameOf(view, e.actor)} passes on news ({e.data.event_id}). Who knows what shows how it spread.
        </div>
      );
    case 'GIFT_REFUSED':
      return <div className="note">{refusedText(e, view)}</div>;
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

type Given = Extract<EngineEvent, { type: 'GIVEN' }>;
type Refused = Extract<EngineEvent, { type: 'GIFT_REFUSED' }>;
export const giftText = ({ gift, item_name }: Given['data']) =>
  gift.kind === 'gold' ? `${gift.amount} gold` : gift.kind === 'good' ? `${gift.qty} × ${goodName(gift.good)}` : `the ${item_name ?? gift.item_id}`;

// From the player's side: "Mira gives you 2 × torch", "You give Brann 5 gold".
export function gaveText(e: Given, view: StateView): string {
  const from = e.actor === 'player' ? 'You give' : `${nameOf(view, e.actor)} gives`;
  const to = e.target === 'player' ? 'you' : nameOf(view, e.target ?? '');
  return `${from} ${to} ${giftText(e.data)}.`;
}

// The refuser is the actor: "Mira won't take the Steel Axe; you keep it."
export function refusedText(e: Refused, view: StateView): string {
  const who = e.actor === 'player' ? 'You' : nameOf(view, e.actor);
  const keeps = e.target === 'player' ? 'you keep it' : `${nameOf(view, e.target ?? '')} keeps it`;
  return `${who} won't take ${giftText(e.data)}; ${keeps}.`;
}

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
