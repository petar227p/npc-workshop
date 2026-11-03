import { useEffect, useRef, type ReactNode } from 'react';

export type Page = 'home' | 'village' | 'workshop';

// The shared page bar. The workshop puts its draft's state and actions on the right, and its panes
// stick below the bar, so the bar's height is kept in --top-h.
export function SiteHeader({ page, children }: { page: Page; children?: ReactNode }) {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <header ref={bar} className={children === undefined ? 'top' : 'top studio-top'}>
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
      {children}
    </header>
  );
}
