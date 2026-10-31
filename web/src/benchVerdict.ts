import type { BenchResponse } from '@blacksmith/shared';

// A failed provider may return no attempts. Report that failure before checking for an NPC that never answers.
export function outcomeText(t: Pick<BenchResponse, 'attempts' | 'outcome'>): string {
  if (t.outcome === 'unavailable') return "The model didn't answer, so it said its fallback line. Nothing changed. Try again in a moment.";
  if (t.attempts.length === 0) return "No model call: it doesn't answer when spoken to.";
  if (t.outcome === 'fallback') return "The ledger rejected the model's answers, so it said its fallback line. Nothing changed.";
  const verb = verbIn(t.attempts.find((a) => a.ok)?.content ?? '');
  const answer = verb ? `answered with ${verb}` : 'answered';
  return t.attempts.some((a) => !a.ok) ? `The ledger rejected the model's first answer; then it ${answer}, and the ledger accepted that.` : `The model ${answer}, and the ledger accepted it.`;
}

function verbIn(content: string): string | null {
  try {
    const action = (JSON.parse(content) as { action?: unknown }).action;
    return typeof action === 'string' ? action : null;
  } catch {
    return null;
  }
}
