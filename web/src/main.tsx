import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from './Editor';
import { Entrance } from './Entrance';
import type { Page } from './SiteHeader';
import { VillagePage } from './VillagePage';
import './style.css';

const ROUTES: Record<string, Page> = { '': 'home', '#': 'home', '#/': 'home', '#/village': 'village', '#/workshop': 'workshop', '#/workshop/new': 'workshop' };
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
    <main className={page === 'home' ? 'app' : 'app app-wide'}>
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
