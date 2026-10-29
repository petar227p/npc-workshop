import type { ActionResponse, Gift, StateView } from '@blacksmith/shared';
import { lazy, StrictMode, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Chat, type Pending } from './Chat';
import { Editor } from './Editor';
import { God } from './God';

// Phaser is most of the bundle, so the village loads on its own and the workshop doesn't wait for it.
const Village = lazy(() => import('./game/Village').then((m) => ({ default: m.Village })));
import { Forge as ForgePanel, Inventory, Ledger, News, Stock } from './Side';
import './style.css';

type Page = 'village' | 'workshop';
const pageFromHash = (): Page => (location.hash === '#/workshop' ? 'workshop' : 'village');

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  return (
    <main className="app">
      <header className="top">
        <h1>The Blacksmith</h1>
        <span className="tag">Models propose. Code decides.</span>
        <nav className="tabs" aria-label="Pages">
          <a href="#/" aria-current={page === 'village' ? 'page' : undefined}>
            Village
          </a>
          <a href="#/workshop" aria-current={page === 'workshop' ? 'page' : undefined}>
            NPC workshop
          </a>
        </nav>
      </header>
      {page === 'workshop' ? <Editor /> : <VillagePage />}
    </main>
  );
}

// The village: walk up to someone and talk, accept offers, skip time.
function VillagePage() {
  const [view, setView] = useState<StateView | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [talkTo, setTalkTo] = useState('smith');
  const chatInput = useRef<HTMLInputElement>(null);
  // E next to someone: talk to them, with the keys in the chat box until Esc. Not to someone else while an NPC is
  // thinking: the picker is locked then too, and the reply on its way belongs to the one asked.
  const talk = useCallback(
    (npc: string) => {
      if (pending !== null && npc !== talkTo) return;
      setTalkTo(npc);
      chatInput.current?.focus();
    },
    [pending, talkTo],
  );

  useEffect(() => {
    api.state().then(setView, (e: Error) => setError(e.message));
  }, []);

  // A picture takes 10–30 s after work starts. Poll just the pictures until none is still being drawn.
  const drawing = Object.values(view?.art ?? {}).some((a) => a.status === 'rendering');
  useEffect(() => {
    if (!drawing) return;
    const timer = setInterval(() => {
      api.art().then(({ art }) => setView((v) => (v ? { ...v, art } : v)), () => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [drawing]);

  // Passing time can wait on NPCs acting on their own, so every action locks the buttons until it's back.
  // True when the action went through, so a form can keep what was typed when it didn't.
  const [waiting, setWaiting] = useState(false);
  const run = useCallback(async (p: Promise<ActionResponse>): Promise<boolean> => {
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

  if (!view) return <div className="loading">{error ?? 'Waking the village…'}</div>;
  const busy = pending !== null || waiting;

  return (
    <div className="cols">
      <div className="main-col village-col">
        <Suspense fallback={<div className="game" />}>
          <Village view={view} onTalk={talk} />
        </Suspense>
        <Chat view={view} talkTo={talkTo} onTalkTo={setTalkTo} pending={pending} onSay={say} onAccept={(id) => run(api.accept(id))} inputRef={chatInput} />
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
      <aside className="side-col">
        <ForgePanel view={view} disabled={busy} onSkip={(n) => run(api.tick(n))} onReset={() => run(api.reset())} />
        <Inventory view={view} disabled={busy} onGive={give} />
        <God view={view} disabled={busy} onRead={readNote} onReport={(r) => run(api.report(r))} />
        <News view={view} />
        <Stock view={view} />
        <Ledger view={view} />
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
