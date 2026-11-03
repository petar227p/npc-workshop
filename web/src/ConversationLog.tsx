import type { ReactNode } from 'react';

// New lines glide into view, unless the reader asked for less motion.
export const newLineScroll = (): ScrollBehavior =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// Keep transient thinking indicators outside the committed-message log.
export function ConversationLog({ name, children }: { name: string; children: ReactNode }) {
  return <div className="conversation-log" role="log" aria-label={`Conversation with ${name}`} aria-live="polite" aria-relevant="additions" aria-atomic="false">
    {children}
  </div>;
}
