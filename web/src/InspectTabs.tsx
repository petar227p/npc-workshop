import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { InspectTab } from './demoPanels';

const TABS: { id: InspectTab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'sandbox', label: 'Sandbox' },
];

// Inspect village's two sections as tabs: arrows, Home and End move between them (and show the one they land on), Tab
// leaves for the section's contents. Both sections stay mounted, so the log's filter and an unsent report survive.
export function InspectTabs({ tab, onTab, panels }: { tab: InspectTab; onTab: (t: InspectTab) => void; panels: Record<InspectTab, ReactNode> }) {
  const base = useId();
  const buttons = useRef<Partial<Record<InspectTab, HTMLButtonElement | null>>>({});
  const move = (e: KeyboardEvent) => {
    const at = TABS.findIndex((t) => t.id === tab);
    const to =
      e.key === 'ArrowRight' ? (at + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    onTab(TABS[to].id);
    buttons.current[TABS[to].id]?.focus();
  };
  return (
    <>
      <div className="inspect-tabs" role="tablist" aria-label="Inspect village" onKeyDown={move}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-${t.id}-tab`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} id={`${base}-${t.id}`} role="tabpanel" aria-labelledby={`${base}-${t.id}-tab`} hidden={tab !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </>
  );
}
