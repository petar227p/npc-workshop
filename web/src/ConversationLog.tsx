import type { ReactNode } from 'react';

// Keep transient thinking indicators outside the committed-message log.
export function ConversationLog({ name, children }: { name: string; children: ReactNode }) {
  return <div className="conversation-log" role="log" aria-label={`Conversation with ${name}`} aria-live="polite" aria-relevant="additions" aria-atomic="false">
    {children}
  </div>;
}
