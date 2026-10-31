import type { StateView } from '@blacksmith/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from './Drawer';
import { dismissedIn, nextBaseline, selectHint, type Baseline, type Hint, type HintLink, type WorldGuidance } from './hints';

// Where hints are remembered: whether they're on at all (this browser, every world), and what was dismissed in the
// current world (replaced when the world changes). Versioned, so a later shape can ignore these. Storage can be missing
// or throw (private windows, blocked site data): then hints are on and nothing is remembered past the page.
const ENABLED_KEY = 'npcw.hints.v1';
const WORLD_KEY = 'npcw.hints.world.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembered for this page only.
  }
}

// view: null until the village has loaded (the page's hooks run before it has).
export function useHints({ view, talkTo, engaged, canClick }: { view: StateView | null; talkTo: string; engaged: boolean; canClick: boolean }) {
  const [enabled, setEnabledState] = useState(() => read<boolean>(ENABLED_KEY) !== false);
  const [saved, setSaved] = useState<{ world: string | undefined; ids: Set<string> } | null>(null);
  const baseline = useRef<Baseline | null>(null);

  // Settled during render, so the first view's history is history before any hint is picked from it.
  if (view) baseline.current = nextBaseline(baseline.current, view);
  // What was dismissed in this world: read from storage the moment the world is new to the page (its first view, or
  // a new game), so a dismissed hint never shows for a frame.
  const world = view?.world_id;
  const dismissed = saved && saved.world === world ? saved.ids : dismissedIn(read<WorldGuidance>(WORLD_KEY), world);
  useEffect(() => {
    if (view && saved?.world !== world) setSaved({ world, ids: dismissed });
  }, [view, saved, world, dismissed]);

  const hint = useMemo(
    () => (enabled && view ? selectHint({ view, talkTo, engaged, canClick, baseline: baseline.current!.ids, dismissed }) : null),
    [enabled, view, talkTo, engaged, canClick, dismissed],
  );

  const dismiss = useCallback(
    (h: Hint) => {
      const ids = new Set([...dismissed, ...h.covers]);
      setSaved({ world, ids });
      if (world) write(WORLD_KEY, { world, dismissed: [...ids] } satisfies WorldGuidance);
    },
    [dismissed, world],
  );
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    write(ENABLED_KEY, on);
  }, []);

  return { hint, dismiss, enabled, setEnabled };
}

// The one hint, above the chat. Polite live region: read out when it changes, never taking focus.
export function HintBar({
  hint,
  onDismiss,
  onExample,
  onLink,
  onTurnOff,
}: {
  hint: Hint | null;
  onDismiss: (h: Hint) => void;
  onExample: (text: string) => void;
  onLink: (to: HintLink, h: Hint) => void;
  onTurnOff: () => void;
}) {
  return (
    <div className="hint-slot" aria-live="polite">
      {hint && (
        <div className="hint" key={hint.key}>
          <div className="hint-main">
            <span className="hint-text">{hint.text}</span>
            {hint.link && (
              <button className="secondary small" onClick={() => onLink(hint.link!.to, hint)}>
                {hint.link.label}
              </button>
            )}
            <button className="hint-off" onClick={onTurnOff}>
              Turn off hints
            </button>
            <button className="hint-x" aria-label="Dismiss hint" onClick={() => onDismiss(hint)}>
              ×
            </button>
          </div>
          {hint.examples && (
            <div className="hint-examples">
              <span className="muted small">Try:</span>
              {hint.examples.map((x) => (
                <button key={x} className="secondary small" onClick={() => onExample(x)} aria-label={`Put in the message box: ${x}`}>
                  {x}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Help in the time-and-gold bar: the basic controls, and hints back on (or off).
export function HelpMenu({ enabled, onEnabled, canClick }: { enabled: boolean; onEnabled: (on: boolean) => void; canClick: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Popover label="Help" open={open} onOpen={() => setOpen(true)} onClose={close} className="help-menu">
      <h3 className="help-title">Getting around</h3>
      <ul className="help-list">
        {canClick && <li>Click a villager to talk to them.</li>}
        <li>Walk with WASD or the arrow keys; press E next to someone to talk.</li>
        <li>Or choose who to talk to from the name at the top of the chat.</li>
        <li>Esc leaves the message box, so the keys walk again.</li>
        <li>Village time moves only when you choose: +1 hour, or Wait until ready.</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        Show hints
      </label>
    </Popover>
  );
}
