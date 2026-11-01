import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from './Editor';
import { Entrance } from './Entrance';
import { VillagePage } from './VillagePage';
import './style.css';

type Page = 'home' | 'village' | 'workshop';
const ROUTES: Record<string, Page> = { '': 'home', '#': 'home', '#/': 'home', '#/village': 'village', '#/workshop': 'workshop' };
const TITLES: Record<Page, string> = { home: 'NPC Workshop', village: 'Blacksmith demo · NPC Workshop', workshop: 'Workshop · NPC Workshop' };
// An unknown hash goes to the entrance, and the address says so (replaced, so Back doesn't land on it again).
const pageFromHash = (): Page => {
  const page = ROUTES[location.hash];
  if (page) return page;
  history.replaceState(null, '', '#/');
  return 'home';
};

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const content = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  // A new page starts at the top, and keyboard and screen-reader users start reading it rather than the old link.
  useEffect(() => {
    document.title = TITLES[page];
    if (first.current) return void (first.current = false);
    scrollTo(0, 0);
    content.current?.focus({ preventScroll: true });
  }, [page]);

  return (
    <main className="app">
      {page !== 'home' && (
        <header className="top">
          <a className="brand" href="#/">
            <img className="brand-icon" src="/brand/npc-workshop-icon.png" alt="" width="40" height="40" />
            <span>NPC Workshop</span>
          </a>
          <span className="tag">Models propose. Code decides.</span>
          <nav className="tabs" aria-label="Pages">
            <a href="#/workshop" aria-current={page === 'workshop' ? 'page' : undefined}>
              Workshop
            </a>
            <a href="#/village" aria-current={page === 'village' ? 'page' : undefined}>
              Demo
            </a>
          </nav>
        </header>
      )}
      <div ref={content} tabIndex={-1} className="page">
        {page === 'home' ? <Entrance /> : page === 'workshop' ? <Editor /> : <VillagePage />}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
