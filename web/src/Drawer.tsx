import { useEffect, useId, useRef, type ReactNode } from 'react';

// A panel over the right of the page, beside the village rather than instead of it. Not modal: the village and the chat
// stay usable. It takes focus when it opens, Esc or Close shuts it, and focus goes back to whatever opened it.
// `data-overlay` tells the village scene that keys pressed in here aren't for walking.
// opener: the button that opened it, where focus goes back (Safari doesn't focus a clicked button, so focus alone can't say).
export function Drawer({ title, onClose, opener, children }: { title: string; onClose: () => void; opener?: HTMLElement | null; children: ReactNode }) {
  const heading = useId();
  const box = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const back = opener ?? (document.activeElement as HTMLElement | null);
    box.current?.focus();
    return () => {
      // Only if focus is still ours: a click elsewhere that closed it has already put focus where it belongs.
      if (back?.isConnected && (!document.activeElement || document.activeElement === document.body || box.current?.contains(document.activeElement)))
        back.focus();
    };
  }, []);

  return (
    <aside
      className="drawer"
      role="dialog"
      aria-labelledby={heading}
      ref={box}
      tabIndex={-1}
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
