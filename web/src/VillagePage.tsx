import type { ActionResponse, Gift, StateView } from '@blacksmith/shared';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Chat, nameOf, type Pending } from './Chat';
import { Drawer } from './Drawer';
import { God } from './God';
import { Forge, Hud, Inventory, Ledger, News, Stock } from './Side';
import { HelpMenu, HintBar, useHints } from './HintBar';
import type { HintLink } from './hints';
import { Help, Tip } from './Tip';

// Phaser is most of the bundle, so the village loads on its own and the workshop doesn't wait for it.
const Village = lazy(() => import('./game/Village').then((m) => ({ default: m.Village })));

type Panel = 'knowledge' | 'events' | 'sandbox' | 'stock';

function DemoIntro() {
  return (
    <section className="demo-intro" aria-labelledby="demo-heading">
      <div className="demo-intro-copy">
        <h2 id="demo-heading">Blacksmith demo — built with NPC Workshop</h2>
        <p>Meet Brann in the example village. Negotiate an order, accept a checked offer, and collect the finished item.</p>
      </div>
      <a className="demo-build" href="#/workshop">Build your own NPC <span aria-hidden="true">→</span></a>
    </section>
  );
}

// Someone heard of an event from someone else: one key per (event, listener), so a retelling to a new person is new.
const heardKeys = (view: StateView) => new Set(view.news.flatMap((n) => n.knowers.filter((k) => k.how === 'told_by').map((k) => `${n.event_id}:${k.id}`)));

// What changed since the last view, for the cues. The first view is only the starting point: what a returning session
// already had isn't news.
function useArrivals(view: StateView | null) {
  const last = useRef<StateView | null>(null);
  const [gear, setGear] = useState(0); // counts up when something new is in the player's hands
  const [heard, setHeard] = useState(false); // someone learned of an event secondhand since the panel was last opened
  useEffect(() => {
    if (!view) return;
    const prev = last.current;
    last.current = view;
    if (!prev) return;
    // After a new game, everything is compared with an empty world: its ids start again from the old world's numbers.
    const before = prev.world_id === view.world_id ? prev : { ...view, items: [], goods: {}, news: [] };
    const items = new Set(before.items.map((i) => i.item_id));
    const more = view.items.some((i) => !items.has(i.item_id)) || Object.entries(view.goods).some(([g, n]) => n > (before.goods[g] ?? 0));
    if (more) setGear((n) => n + 1);
    const known = heardKeys(before);
    const newHeard = [...heardKeys(view)].some((k) => !known.has(k));
    if (prev.world_id !== view.world_id) setHeard(newHeard);
    else if (newHeard) setHeard(true);
  }, [view]);
  return { gear, heard, seenHeard: useCallback(() => setHeard(false), []) };
}

// Bring an element into view and put focus on it, with a brief highlight. A disclosure opens, and its summary takes
// focus (the details element itself can't).
function reveal(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  const target = el instanceof HTMLDetailsElement ? (el.querySelector('summary') ?? el) : el;
  el.scrollIntoView({ block: 'nearest' });
  target.focus({ preventScroll: true });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

// After an action, keyboard focus stays where the player was: the button used is disabled while the village is busy
// (which drops focus), and may be gone once it's done (Wait until ready, with the work). Back on it if it's still
// there; if not, on Your gear after the forge's last job (that's where the work went), else on +1 hour.
function keepFocus(from: HTMLElement | null) {
  if (!from || from === document.body) return;
  setTimeout(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (from.isConnected && !(from as HTMLButtonElement).disabled) return from.focus();
    const visible = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null;
    const gear = document.getElementById('gear');
    if (from.closest('.forge') && visible(gear)) return gear.focus();
    [...document.querySelectorAll('[data-focus-home]')].find(visible)?.focus();
  });
}

// The village: the world and the conversation first; time and gold always in view; everything else a button away.
export function VillagePage() {
  const [view, setView] = useState<StateView | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [talkTo, setTalkTo] = useState('smith');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [gearOpen, setGearOpen] = useState(false);
  const chatInput = useRef<HTMLInputElement>(null);
  const arrivals = useArrivals(view);
  // Whether the player has opened a conversation this visit (E, the picker, the message box): the first hint is how to.
  const [engagedWorld, setEngagedWorld] = useState<string | null>(null);
  const engaged = !!view?.world_id && engagedWorld === view.world_id;
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const hints = useHints({ view, talkTo, engaged, canClick: true });
  // E next to someone: talk to them, with the keys in the chat box until Esc. Not to someone else while an NPC is
  // thinking: the picker is locked then too, and the reply on its way belongs to the one asked.
  const talk = useCallback(
    (npc: string) => {
      if (pending !== null && npc !== talkTo) return;
      setTalkTo(npc);
      setEngagedWorld(view?.world_id ?? null);
      chatInput.current?.focus();
    },
    [pending, talkTo, view?.world_id],
  );
  const pickNpc = useCallback((npc: string) => {
    setTalkTo(npc);
    setEngagedWorld(view?.world_id ?? null);
  }, [view?.world_id]);

  useEffect(() => {
    api.state().then(setView, (e: Error) => setError(e.message));
  }, []);

  // Something arrived: unfold the gear so it shows, without taking focus from wherever the player is.
  useEffect(() => {
    if (arrivals.gear) setGearOpen(true);
  }, [arrivals.gear]);

  // A picture takes 10–30 s after work starts. Poll just the pictures until none is still being drawn.
  const drawing = Object.values(view?.art ?? {}).some((a) => a.status === 'rendering');
  useEffect(() => {
    if (!drawing) return;
    let active = true;
    const world = view?.world_id;
    const timer = setInterval(() => {
      api.art().then(
        ({ art }) => {
          if (active) setView((v) => (v && v.world_id === world ? { ...v, art } : v));
        },
        () => {},
      );
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [drawing, view?.world_id]);

  // Passing time can wait on NPCs acting on their own, so every action locks the buttons until it's back.
  // True when the action went through, so a form can keep what was typed when it didn't.
  const [waiting, setWaiting] = useState(false);
  const run = useCallback(async (p: Promise<ActionResponse>): Promise<boolean> => {
    const from = document.activeElement as HTMLElement | null;
    setError(null);
    setWaiting(true);
    try {
      const r = await p;
      setView(r.view);
      if (!r.ok && r.reason) setError(r.reason);
      return r.ok;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setWaiting(false);
      keepFocus(from);
    }
  }, []);

  // Reading a note waits on Muse Spark and holds the village's lock, so it locks the buttons like any action.
  const readNote = async (note: string) => {
    setError(null);
    setWaiting(true);
    try {
      return (await api.readNote(note)).report;
    } finally {
      setWaiting(false);
    }
  };

  const say = async (text: string) => {
    setPending({ text, npc: talkTo });
    await run(api.say(text, talkTo));
    setPending(null);
  };
  // Giving opens the chat with whoever it's for: what happened (taken, or handed back) is a note in that chat only.
  const give = (to: string, gift: Gift) => {
    setTalkTo(to);
    run(api.give(to, gift));
  };
  const opener = useRef<HTMLElement | null>(null);
  const toggle = (p: Panel, e: React.MouseEvent<HTMLElement>) => {
    opener.current = e.currentTarget;
    if (p === 'knowledge') arrivals.seenHeard();
    setPanel((open) => (open === p ? null : p));
  };
  const closePanel = useCallback(() => setPanel(null), []);
  const knowledgeButton = useRef<HTMLButtonElement>(null);
  // What a hint's link shows, once the panel it's in has rendered and settled: a task later, after the drawer has taken
  // focus as it opens (in development StrictMode runs that twice), so the target has it last.
  const [revealing, setRevealing] = useState<string | null>(null);
  useEffect(() => {
    if (!revealing) return;
    const timer = setTimeout(() => {
      reveal(revealing);
      setRevealing(null);
    });
    return () => clearTimeout(timer);
  }, [revealing]);
  // A hint's link: show the thing it's about. Following it is as good as reading it, so the hint goes.
  const follow = (to: HintLink, h: Parameters<typeof hints.dismiss>[0]) => {
    hints.dismiss(h);
    if (to.kind === 'news') {
      opener.current = knowledgeButton.current;
      arrivals.seenHeard();
      setPanel('knowledge');
      setRevealing(`know-${to.event_id}-${to.knower}`);
    } else {
      setGearOpen(true);
      setRevealing(to.kind === 'item' ? `item-${to.id}` : 'gear');
    }
  };
  // Another seller's stock, or none: the stock panel belongs to whoever the chat is with.
  useEffect(() => setPanel((p) => (p === 'stock' ? null : p)), [talkTo]);

  if (!view) return <div className="demo-page"><DemoIntro /><div className="loading">{error ?? 'Waking the village…'}</div></div>;
  const busy = pending !== null || waiting;
  const seller = view.shops.some((s) => s.id === talkTo);
  const shown = panel === 'stock' && !seller ? null : panel;
  // Time and gold, always in view: beside the village on a wide screen, between it and the chat on a narrow one (CSS
  // shows one), where the side column would put them below the conversation.
  const hud = (where: string) => (
    <Hud
      className={where}
      view={view}
      disabled={busy}
      onSkip={(n) => run(api.tick(n))}
      onReset={() => run(api.reset())}
      help={<HelpMenu enabled={hints.enabled} onEnabled={hints.setEnabled} canClick />}
    />
  );

  return (
    <div className="demo-page">
      <DemoIntro />
      <div className="cols">
        <div className="main-col village-col">
          <Suspense fallback={<div className="game" />}>
            <Village view={view} onTalk={talk} />
          </Suspense>
          {hud('hud-top')}
          <HintBar
            hint={hints.hint}
            onDismiss={hints.dismiss}
            onExample={(text) => setPrefill((p) => ({ text, n: (p?.n ?? 0) + 1 }))}
            onLink={follow}
            onTurnOff={() => hints.setEnabled(false)}
          />
          <Chat
            view={view}
            talkTo={talkTo}
            onTalkTo={pickNpc}
            onInputFocus={() => setEngagedWorld(view.world_id ?? null)}
            prefill={prefill}
            pending={pending}
            onSay={say}
            onAccept={(id) => run(api.accept(id))}
            inputRef={chatInput}
            onError={setError}
            headExtra={
              seller && (
                <button className="secondary small" aria-expanded={shown === 'stock'} onClick={(e) => toggle('stock', e)}>
                  {nameOf(view, talkTo)}'s stock
                </button>
              )
            }
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
        <aside className="side-col" aria-label="Your things and village tools">
          {hud('hud-side')}
          <Forge view={view} disabled={busy} onSkip={(n) => run(api.tick(n))} />
          <Inventory view={view} disabled={busy} onGive={give} open={gearOpen} onToggle={() => setGearOpen((o) => !o)} />
          <nav className="panel tools" aria-label="Village tools">
            <button ref={knowledgeButton} className="secondary" aria-expanded={shown === 'knowledge'} onClick={(e) => toggle('knowledge', e)}>
              Who knows what
              {arrivals.heard && shown !== 'knowledge' && <span className="cue">new</span>}
            </button>
            <Tip text="See the recorded actions and the rules that accepted or rejected them.">
              <button className="secondary" aria-expanded={shown === 'events'} onClick={(e) => toggle('events', e)}>
                Inspect events
              </button>
            </Tip>
            <button className="secondary" aria-expanded={shown === 'sandbox'} onClick={(e) => toggle('sandbox', e)}>
              Sandbox tools
            </button>
          </nav>
        </aside>
        {shown === 'knowledge' && (
          <Drawer title="Who knows what" onClose={closePanel} opener={opener.current}>
            <News view={view} />
          </Drawer>
        )}
        {shown === 'events' && (
          <Drawer title="Inspect events" onClose={closePanel} opener={opener.current}>
            <p className="muted small">Every recorded action, newest first, and the rules that accepted or rejected it.</p>
            <Ledger view={view} />
          </Drawer>
        )}
        {shown === 'sandbox' && (
          <Drawer title="Sandbox tools" onClose={closePanel} opener={opener.current}>
            <God view={view} disabled={busy} onRead={readNote} onReport={(r) => run(api.report(r))} />
          </Drawer>
        )}
        {shown === 'stock' && (
          <Drawer title={`${nameOf(view, talkTo)}'s stock`} onClose={closePanel} opener={opener.current}>
            <p className="muted small">
              What {nameOf(view, talkTo)} has on hand right now, not counting reserved materials{' '}
              <Help about="reserved materials" text="These materials are set aside for accepted orders." />
            </p>
            <Stock view={view} shop={talkTo} />
          </Drawer>
        )}
      </div>
    </div>
  );
}
