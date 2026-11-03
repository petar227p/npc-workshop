import type { ActionResponse, Gift, StateView } from '@blacksmith/shared';
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { Chat, nameOf, type Pending } from './Chat';
import { NO_PANELS, panelsReducer, type Panel } from './demoPanels';
import { Drawer } from './Drawer';
import { God } from './God';
import { Forge, gearCount, Hud, InventoryContent, News, Stock, VillageLog } from './Side';
import { HelpMenu, HintBar, useHints } from './HintBar';
import { InspectTabs } from './InspectTabs';
import { SiteHeader } from './SiteHeader';
import type { HintLink } from './hints';
import { Help } from './Tip';

// Phaser is most of the bundle, so the village loads on its own and the workshop doesn't wait for it.
const Village = lazy(() => import('./game/Village').then((m) => ({ default: m.Village })));


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
  const [unseen, setUnseen] = useState(false); // something arrived since the Bag was last opened
  const [heard, setHeard] = useState(false); // someone learned of an event secondhand since Rumours was last opened
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
    // A new game has nothing new in it yet, so the cue goes with the old world.
    if (prev.world_id !== view.world_id) setUnseen(more);
    else if (more) setUnseen(true);
    const known = heardKeys(before);
    const newHeard = [...heardKeys(view)].some((k) => !known.has(k));
    if (prev.world_id !== view.world_id) setHeard(newHeard);
    else if (newHeard) setHeard(true);
  }, [view]);
  return { gear, unseen, heard, seenHeard: useCallback(() => setHeard(false), []), seenGear: useCallback(() => setUnseen(false), []) };
}

// Phone width, where the village stacks above the conversation and its drawers become modal sheets. The same
// breakpoint as the stylesheet's.
const NARROW = '(max-width: 860px)';
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(NARROW).matches);
  useEffect(() => {
    const m = matchMedia(NARROW);
    const update = () => setNarrow(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);
  return narrow;
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
// (which drops focus), and may be gone once it's done (an offer's Accept, Wait until ready with the last order). Back on
// it if it's still there; if not, on the next step: after an accepted offer, Wait until ready (or the message box,
// when it was handed over at once); after the forge's last order, the Bag button (that's where the work went); else
// on +1 hour.
function keepFocus(from: HTMLElement | null) {
  if (!from || from === document.body) return;
  // Where it was, read now: once the action is done the button may be detached along with what held it.
  const wasIn = from.closest('.contract') ? 'offer' : from.closest('.forge') ? 'forge' : null;
  setTimeout(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (from.isConnected && !(from as HTMLButtonElement).disabled) return from.focus();
    const visible = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null;
    const first = (selector: string) => [...document.querySelectorAll(selector)].find(visible);
    const next = wasIn === 'offer' ? (first('.forge-head button') ?? first('.chat-form input')) : wasIn === 'forge' ? first('#bag-button') : undefined;
    (next ?? first('[data-focus-home]'))?.focus();
  });
}

// The village: the world and the conversation first; time and gold always in view; everything else a button away.
export function VillagePage() {
  const [view, setView] = useState<StateView | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [talkTo, setTalkTo] = useState('smith');
  const [panels, panel] = useReducer(panelsReducer, NO_PANELS);
  const narrow = useNarrow();
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

  // Something arrived: the Bag's count goes up, its button glows briefly and says "new" until the Bag is opened, and the
  // hint offers Show it. The chat's handover line says what it was, so nothing more is announced. The Bag doesn't open
  // on its own: it's a drawer over the village and would take focus from wherever the player is.
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (!arrivals.gear) return;
    setGlow(true);
    const timer = setTimeout(() => setGlow(false), 1600);
    return () => clearTimeout(timer);
  }, [arrivals.gear]);
  // Opening Rumours is reading them; opening the Bag is seeing what arrived.
  const { seenHeard, seenGear } = arrivals;
  useEffect(() => {
    if (panels.open === 'rumours') seenHeard();
    if (panels.open === 'bag') seenGear();
  }, [panels.open, seenHeard, seenGear]);

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
  // What a hint's link shows, once the panel it's in has rendered and settled: a task later, so the target gets
  // focus after anything that took it while opening.
  useEffect(() => {
    const target = panels.reveal;
    if (!target) return;
    const timer = setTimeout(() => {
      reveal(target);
      panel({ type: 'revealed' });
    });
    return () => clearTimeout(timer);
  }, [panels.reveal]);
  // A hint's link: show the thing it's about. Following it is as good as reading it, so the hint goes.
  const follow = (to: HintLink, h: Parameters<typeof hints.dismiss>[0]) => {
    hints.dismiss(h);
    panel({ type: 'follow', to });
  };
  // Another seller's stock, or none: the stock drawer belongs to whoever the chat is with.
  useEffect(() => panel({ type: 'partner' }), [talkTo]);

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
  const gear = gearCount(view);
  // The utility bar's buttons: one panel at a time (demoPanels).
  const barButton = (p: Panel, label: ReactNode, className?: string) => (
    <button
      id={`${p}-button`}
      className={className}
      aria-expanded={panels.open === p}
      aria-controls={`panel-${p}`}
      onClick={() => panel({ type: 'toggle', panel: p })}
    >
      {label}
    </button>
  );
  // The panels open in one drawer slot over the village's left side, beside the buttons that open them, so the
  // conversation stays in view and usable. On a phone the slot is a sheet from the bottom, modal. Each stays mounted while closed: the log's filter, an unsent report and
  // the Give form keep what they had. Closing puts focus back on the panel's own button.
  const drawer = (p: Panel, title: string, body: ReactNode) => (
    <Drawer
      id={`panel-${p}`}
      className="slot"
      title={title}
      open={panels.open === p}
      modal={narrow}
      onClose={() => panel({ type: 'close', panel: p })}
      opener={document.getElementById(`${p}-button`)}
    >
      {body}
    </Drawer>
  );
  return (
    <div className="demo-page">
      {/* The site bar is only where you are and the way to build your own; the village's controls are on the village. */}
      <SiteHeader page="village">
        <div className="studio-actions">{buildLink}</div>
      </SiteHeader>
      {/* A wide screen fills the window: the village on the left (its toolbar, the scene, its utility bar) and the
          conversation on the right. A narrow one stacks the village above the conversation. */}
      <div className="demo-layout">
        <div className="village-col">
          {/* Time and gold, always in view with the village they belong to. */}
          <div className="village-toolbar">
            <Hud
              view={view}
              disabled={busy}
              onSkip={(n) => run(api.tick(n))}
              onReset={() => run(api.reset())}
              help={<HelpMenu enabled={hints.enabled} onEnabled={hints.setEnabled} canClick />}
            />
          </div>
          <div className="stage">
            <Suspense fallback={<div className="game" />}>
              <Village view={view} onTalk={talk} selected={talkTo} />
            </Suspense>
            <HintBar
              hint={hints.hint}
              onDismiss={hints.dismiss}
              onExample={(text) => setPrefill((p) => ({ text, n: (p?.n ?? 0) + 1 }))}
              onLink={follow}
              onTurnOff={() => hints.setEnabled(false)}
            />
            {drawer('bag', 'Bag', <InventoryContent view={view} disabled={busy} onGive={give} />)}
            {drawer(
              'rumours',
              'Rumours',
              <>
                <p className="muted small">What’s going around, and who heard it from whom.</p>
                <News view={view} />
              </>,
            )}
            {drawer(
              'inspect',
              'Inspect village',
              <InspectTabs
                tab={panels.tab}
                onTab={(tab) => panel({ type: 'tab', tab })}
                panels={{
                  activity: (
                    <>
                      <p className="muted small">Everything that happened, and what the rules allowed.</p>
                      <VillageLog view={view} />
                    </>
                  ),
                  sandbox: <God view={view} disabled={busy} onRead={readNote} onReport={(r) => run(api.report(r))} />,
                }}
              />,
            )}
            {seller &&
              drawer(
                'stock',
                `${nameOf(view, talkTo)}'s stock`,
                <>
                  <p className="muted small">
                    What {nameOf(view, talkTo)} has on hand right now, not counting reserved materials{' '}
                    <Help about="reserved materials" text="These materials are set aside for accepted orders." />
                  </p>
                  <Stock view={view} shop={talkTo} />
                </>,
              )}
          </div>
          <div className="utility">
            <nav className="utility-bar" aria-label="Village tools">
              {barButton(
                'bag',
                <>
                  Bag
                  <span className="bar-count">
                    {gear}
                    <span className="sr-only">{gear === 1 ? ' thing' : ' things'}</span>
                  </span>
                  {arrivals.unseen && panels.open !== 'bag' && <span className="cue">new</span>}
                </>,
                glow ? 'arrived' : undefined,
              )}
              {barButton(
                'rumours',
                <>
                  Rumours
                  {arrivals.heard && panels.open !== 'rumours' && <span className="cue">new</span>}
                </>,
              )}
              {barButton('inspect', 'Inspect village')}
            </nav>
          </div>
        </div>
        <div className="talk-col">
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
                  id="stock-button"
                  className="secondary small"
                  aria-expanded={panels.open === 'stock'}
                  aria-controls="panel-stock"
                  onClick={() => panel({ type: 'toggle', panel: 'stock' })}
                >
                  {nameOf(view, talkTo)}'s stock
                </button>
              )
            }
            // Under the conversation, above the message box: what went wrong, and the work the conversation started.
            beforeComposer={
              <>
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                <Forge view={view} disabled={busy} onSkip={(n) => run(api.tick(n))} />
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
