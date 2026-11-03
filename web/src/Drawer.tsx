import { useEffect, useId, useRef, type ReactNode } from 'react';

// A panel over the right of the page, beside the village rather than instead of it. Not modal: the village and the chat
// stay usable. It takes focus when it opens, Esc or Close shuts it, and focus goes back to whatever opened it.
// `data-overlay` tells the village scene that keys pressed in here aren't for walking.
// opener: the button that opened it, where focus goes back (Safari doesn't focus a clicked button, so focus alone can't say).
// open: a drawer can stay mounted while closed (hidden), so what's typed in it is still there when it opens again.
// className: where it sits; `slot` keeps it inside the village instead of over the right of the page.
// modal: on a phone the drawer is a sheet over most of the page, so it is modal for real: everything else is inert
// (out of reach of Tab, taps and screen readers), the page behind doesn't scroll, and a tap on the dimmed page closes it.
export function Drawer({
  title,
  onClose,
  opener,
  open = true,
  modal = false,
  id,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  opener?: HTMLElement | null;
  open?: boolean;
  modal?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const heading = useId();
  const box = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const back = useRef(opener);
  back.current = opener;

  // Before the focus effect, so on closing the page is live again before focus goes back to the opener in it.
  useEffect(() => {
    if (!open || !modal) return;
    const made: Element[] = [];
    // Everything beside the drawer and beside each of its ancestors, up to the body: the rest of the page. Not the
    // backdrop, which closes it.
    for (let el = box.current as Element | null; el && el !== document.body; el = el.parentElement) {
      for (const sibling of el.parentElement?.children ?? []) {
        if (sibling === el || sibling.hasAttribute('inert') || sibling.hasAttribute('data-backdrop')) continue;
        sibling.setAttribute('inert', '');
        made.push(sibling);
      }
    }
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      for (const el of made) el.removeAttribute('inert');
      root.style.overflow = overflow;
    };
  }, [open, modal]);

  useEffect(() => {
    if (!open) return;
    const to = back.current ?? (document.activeElement as HTMLElement | null);
    box.current?.focus();
    return () => {
      // Only if focus is still ours (hiding the drawer drops it to the body): a click elsewhere that closed it has
      // already put focus where it belongs, and another drawer opening in its place takes it next.
      if (to?.isConnected && (!document.activeElement || document.activeElement === document.body || box.current?.contains(document.activeElement)))
        to.focus();
    };
  }, [open]);

  return (
    <>
      {modal && <div className="drawer-backdrop" data-backdrop hidden={!open} onClick={() => close.current()} />}
      <aside
        id={id}
        className={className ? `drawer ${className}` : 'drawer'}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={heading}
        ref={box}
        tabIndex={-1}
        hidden={!open}
        data-overlay
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Not on to the village, whose Esc would blur the button focus just went back to.
          e.stopPropagation();
          close.current();
        }}
      >
        <div className="drawer-head">
          <h2 id={heading}>{title}</h2>
          <button className="secondary small" onClick={() => close.current()}>
            Close
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

// A button that shows a small panel under it (the village menu). Esc or clicking elsewhere closes it, and Esc puts
// focus back on the button.
export function Popover({
  label,
  open,
  onOpen,
  onClose,
  children,
  className,
}: {
  label: ReactNode;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && onClose();
    addEventListener('pointerdown', away);
    return () => removeEventListener('pointerdown', away);
  }, [open, onClose]);

  return (
    <div
      className={`popover-wrap ${className ?? ''}`}
      ref={wrap}
      data-overlay
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        onClose();
        button.current?.focus();
      }}
    >
      <button ref={button} className="secondary small" aria-expanded={open} aria-controls={panel} onClick={() => (open ? onClose() : onOpen())}>
        {label}
      </button>
      {open && (
        <div className="popover" id={panel}>
          {children}
        </div>
      )}
    </div>
  );
}
