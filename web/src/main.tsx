import type { ActionResponse, StateView } from '@blacksmith/shared';
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { Chat } from './Chat';
import { Editor } from './Editor';
import { Forge as ForgePanel, Inventory, Ledger, Stock } from './Side';
import './style.css';

type Page = 'forge' | 'workshop';
const pageFromHash = (): Page => (location.hash === '#/workshop' ? 'workshop' : 'forge');

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
          <a href="#/" aria-current={page === 'forge' ? 'page' : undefined}>
            Forge
          </a>
          <a href="#/workshop" aria-current={page === 'workshop' ? 'page' : undefined}>
            NPC workshop
          </a>
        </nav>
      </header>
      {page === 'workshop' ? <Editor /> : <ForgePage />}
    </main>
  );
}

// The village forge: chat with Brann, accept, skip time.
function ForgePage() {
  const [view, setView] = useState<StateView | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [talkTo, setTalkTo] = useState('smith');

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

  const run = useCallback(async (p: Promise<ActionResponse>) => {
    setError(null);
    try {
      const r = await p;
      setView(r.view);
      if (!r.ok && r.reason) setError(r.reason);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const say = async (text: string) => {
    setPending(text);
    await run(api.say(text, talkTo));
    setPending(null);
  };

  if (!view) return <div className="loading">{error ?? 'Lighting the forge…'}</div>;
  const busy = pending !== null;

  return (
    <div className="cols">
      <div className="main-col">
        <Chat view={view} talkTo={talkTo} onTalkTo={setTalkTo} pending={pending} onSay={say} onAccept={(id) => run(api.accept(id))} />
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
      <aside className="side-col">
        <ForgePanel view={view} disabled={busy} onSkip={(n) => run(api.tick(n))} onReset={() => run(api.reset())} />
        <Inventory view={view} />
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
