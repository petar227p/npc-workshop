import type { ActionResponse, Gift, StateView } from '@blacksmith/shared';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { Chat, nameOf, type Pending } from './Chat';
import { Drawer } from './Drawer';
import { God } from './God';
import { Forge, Hud, Inventory, Ledger, News, Stock } from './Side';
import { HelpMenu, HintBar, useHints } from './HintBar';
import { SiteHeader } from './SiteHeader';
import type { HintLink } from './hints';
import { Help } from './Tip';

// Phaser is most of the bundle, so the village loads on its own and the workshop doesn't wait for it.
const Village = lazy(() => import('./game/Village').then((m) => ({ default: m.Village })));

type Tool = 'knowledge' | 'events' | 'sandbox';

// What the demo is built with, and the way back to building one: on the right of the bar, after the village controls.
const buildLink = (
  <a className="demo-build" href="#/workshop">
    Build your own NPC <span aria-hidden="true">→</span>
  </a>
);

// Someone heard of an event from someone else: one key per (event, listener), so a retelling to a new person is new.
const heardKeys = (view: StateView) => new Set(view.news.flatMap((n) => n.knowers.filter((k) => k.how === 'told_by').map((k) => `${n.event_id}:${k.id}`)));

// What changed since the last view, for the cues. The first view is only the starting point: what a returning session
// already had isn't news.
function useArrivals(view: StateView | null) {
  const last = useRef<StateView | null>(null);
  const [gear, setGear] = useState(0); // counts up when something new is in the player's hands
  const [heard, setHeard] = useState(false); // someone learned of an event secondhand since Who knows what was last opened
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
  const [tools, setTools] = useState<ReadonlySet<Tool>>(new Set());
  const [stockOpen, setStockOpen] = useState(false);
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
  // The village tools fold open in the rail, each on its own, so the village and the chat stay in view beside them.
  const openTool = (t: Tool, open: boolean) => {
    if (t === 'knowledge' && open) arrivals.seenHeard();
    setTools((ts) => {
      const next = new Set(ts);
      if (open) next.add(t);
      else next.delete(t);
      return next;
    });
  };
  const opener = useRef<HTMLElement | null>(null);
  const closeStock = useCallback(() => setStockOpen(false), []);
  // What a hint's link shows, once the section it's in has rendered and settled: a task later, so the target gets
  // focus after anything that took it while opening.
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
      openTool('knowledge', true);
      setRevealing(`know-${to.event_id}-${to.knower}`);
    } else {
      setGearOpen(true);
      setRevealing(to.kind === 'item' ? `item-${to.id}` : 'gear');
    }
  };
  // Another seller's stock, or none: the stock drawer belongs to whoever the chat is with.
  useEffect(() => setStockOpen(false), [talkTo]);

  if (!view)
    return (
      <div className="demo-page">
        <SiteHeader page="village">
          <div className="studio-actions">{buildLink}</div>
        </SiteHeader>
        <div className="loading">{error ?? 'Waking the village…'}</div>
      </div>
    );
  const busy = pending !== null || waiting;
  const seller = view.shops.some((s) => s.id === talkTo);
  const tool = (t: Tool, name: ReactNode, hint: string, body: ReactNode) => (
    <div className={tools.has(t) ? 'tool open' : 'tool'}>
      <button aria-expanded={tools.has(t)} aria-controls={`tool-${t}`} onClick={() => openTool(t, !tools.has(t))}>
        <span className="tool-name">{name}</span>
        <span className="tool-hint">{hint}</span>
      </button>
      {/* Kept while folded, so a half-typed report is still there when it opens again. */}
      <div id={`tool-${t}`} className="tool-body" hidden={!tools.has(t)}>
        {body}
      </div>
    </div>
  );

  return (
    <div className="demo-page">
      {/* Time and gold in the bar, where the workshop keeps its draft's state: always in view, at every width. */}
      <SiteHeader page="village">
        <div className="studio-actions">
          <Hud
            view={view}
            disabled={busy}
            onSkip={(n) => run(api.tick(n))}
            onReset={() => run(api.reset())}
            help={<HelpMenu enabled={hints.enabled} onEnabled={hints.setEnabled} canClick />}
          />
          {buildLink}
        </div>
      </SiteHeader>
      <div className="cols">
        <div className="main-col village-col">
          <Suspense fallback={<div className="game" />}>
            <Village view={view} onTalk={talk} />
          </Suspense>
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
                <button
                  className="secondary small"
                  aria-expanded={stockOpen}
                  onClick={(e) => {
                    opener.current = e.currentTarget;
                    setStockOpen((o) => !o);
                  }}
                >
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
          <Forge view={view} disabled={busy} onSkip={(n) => run(api.tick(n))} />
          <Inventory view={view} disabled={busy} onGive={give} open={gearOpen} onToggle={() => setGearOpen((o) => !o)} />
          <nav className="panel tools" aria-labelledby="tools-label">
            <h2 id="tools-label" className="rail-label">Village tools</h2>
            {tool(
              'knowledge',
              <>
                Who knows what
                {arrivals.heard && !tools.has('knowledge') && <span className="cue">new</span>}
              </>,
              'Who saw each event, and who heard it from whom',
              <News view={view} />,
            )}
            {tool('events', 'Inspect events', 'Recorded actions, newest first, and the rules that accepted or rejected them', <Ledger view={view} />)}
            {tool(
              'sandbox',
              'Sandbox tools',
              'Tell the village something happened that no action covers',
              <God view={view} disabled={busy} onRead={readNote} onReport={(r) => run(api.report(r))} />,
            )}
          </nav>
        </aside>
        {seller && stockOpen && (
          <Drawer title={`${nameOf(view, talkTo)}'s stock`} onClose={closeStock} opener={opener.current}>
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
