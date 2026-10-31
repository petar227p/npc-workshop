import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';

// Short explanations of controls a newcomer may not know. Hovering or keyboard focus shows one; Esc hides it. On a
// touch screen there's no hover, so a small ? beside the control (or on its own, with Help) toggles it instead.
// Only ever a sentence or two of plain text: anything to click belongs in a drawer or popover, not here. Nothing
// essential lives only in a tip.

type Shown = 'no' | 'hover' | 'pinned';

function useTip() {
  const [shown, setShown] = useState<Shown>('no');
  const wrap = useRef<HTMLSpanElement>(null);
  const hide = useCallback(() => setShown('no'), []);
  // Esc hides it before anything else hears the key (a drawer would close, the village would blur the field).
  useEffect(() => {
    if (shown === 'no') return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      hide();
    };
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && hide();
    addEventListener('keydown', key, true);
    addEventListener('pointerdown', away);
    // A tip is placed once; scrolling or resizing would leave it beside nothing, so it goes.
    addEventListener('scroll', hide, true);
    addEventListener('resize', hide);
    return () => {
      removeEventListener('keydown', key, true);
      removeEventListener('pointerdown', away);
      removeEventListener('scroll', hide, true);
      removeEventListener('resize', hide);
    };
  }, [shown, hide]);

  // Mouse only: a touch fires these too, and on a tap the control's own action is what's wanted.
  const handlers = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setShown((s) => (s === 'no' ? 'hover' : s)),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === 'mouse' && setShown((s) => (s === 'hover' ? 'no' : s)),
    // Keyboard focus only (:focus-visible): a click or tap focuses a button too, and that isn't asking what it is.
    onFocus: (e: React.FocusEvent) => (e.target as HTMLElement).matches(':focus-visible') && setShown((s) => (s === 'no' ? 'hover' : s)),
    onBlur: (e: React.FocusEvent) => !wrap.current?.contains(e.relatedTarget as Node) && setShown((s) => (s === 'hover' ? 'no' : s)),
    // Using the control is the answer to what it does: a hover tip goes (a pinned one was asked for, and stays).
    onClick: () => setShown((s) => (s === 'hover' ? 'no' : s)),
  };
  return { shown, setShown, wrap, handlers };
}

// The bubble itself, fixed to the viewport under its anchor (above it if there's no room), kept inside the edges.
function Bubble({ id, anchor, open, children }: { id: string; anchor: RefObject<HTMLElement>; open: boolean; children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return setAt(null);
    const a = anchor.current?.getBoundingClientRect();
    const b = box.current?.getBoundingClientRect();
    if (!a || !b) return;
    const gap = 6;
    const left = Math.max(8, Math.min(a.left + a.width / 2 - b.width / 2, innerWidth - b.width - 8));
    const below = a.bottom + gap;
    const top = below + b.height > innerHeight - 8 && a.top - gap - b.height > 8 ? a.top - gap - b.height : below;
    setAt({ left, top });
  }, [open, anchor]);
  return (
    // Always in the page while its control is, so aria-describedby has text to read even when it's hidden.
    <span
      id={id}
      role="tooltip"
      ref={box}
      className="tip"
      hidden={!open}
      style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: open ? 'hidden' : undefined }}
    >
      {children}
    </span>
  );
}

// An explanation for one control. The control keeps its own label and action; the tip only describes it.
export function Tip({ text, children }: { text: string; children: ReactElement }) {
  const id = useId();
  const { shown, setShown, wrap, handlers } = useTip();
  return (
    <span className="tip-wrap" ref={wrap} {...handlers}>
      {cloneElement(children, { 'aria-describedby': id })}
      <button
        type="button"
        className="tip-help"
        aria-label="What's this?"
        aria-expanded={shown === 'pinned'}
        onClick={() => setShown((s) => (s === 'pinned' ? 'no' : 'pinned'))}
      >
        ?
      </button>
      <Bubble id={id} anchor={wrap} open={shown !== 'no'}>
        {text}
      </Bubble>
    </span>
  );
}

// An explanation on its own: a ? button for something that isn't a control (a label, a number).
export function Help({ about, text }: { about: string; text: string }) {
  const id = useId();
  const { shown, setShown, wrap, handlers } = useTip();
  return (
    <span className="tip-wrap" ref={wrap} {...handlers}>
      <button
        type="button"
        className="help"
        aria-label={`About ${about}`}
        aria-describedby={id}
        aria-expanded={shown === 'pinned'}
        onClick={() => setShown((s) => (s === 'pinned' ? 'no' : 'pinned'))}
      >
        ?
      </button>
      <Bubble id={id} anchor={wrap} open={shown !== 'no'}>
        {text}
      </Bubble>
    </span>
  );
}
