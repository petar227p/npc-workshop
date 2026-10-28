import type { ActionResponse, ArtResponse, BenchResponse, EditorLibrary, Gift, NpcDraft, PreviewResponse, SaveResponse, StateView } from '@blacksmith/shared';

export class ApiError extends Error {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(err?.error ?? `The forge didn't answer (${res.status}).`);
  }
  return (await res.json()) as T;
}

export const api = {
  state: () => call<StateView>('state'),
  art: () => call<ArtResponse>('art'),
  say: (text: string, npc?: string) => call<ActionResponse>('say', { text, npc }),
  accept: (contract_id: string) => call<ActionResponse>('accept', { contract_id }),
  tick: (ticks: number) => call<ActionResponse>('tick', { ticks }),
  give: (to: string, gift: Gift) => call<ActionResponse>('give', { to, gift }),
  reset: () => call<ActionResponse>('reset', {}),
};

export const editorApi = {
  library: () => call<EditorLibrary>('editor/library'),
  preview: (npc: NpcDraft) => call<PreviewResponse>('editor/preview', { npc }),
  say: (npc: NpcDraft, text: string) => call<BenchResponse>('editor/bench/say', { npc, text }),
  tick: (npc: NpcDraft, ticks: number) => call<BenchResponse>('editor/bench/tick', { npc, ticks }),
  reset: () => call<BenchResponse>('editor/bench/reset', {}),
  save: (npc: NpcDraft, overwrite = false) => call<SaveResponse>('editor/save', { npc, overwrite }),
};

// Tick 0 is 08:00 on day 1; one tick is one hour.
export function clockText(tick: number): string {
  const h = 8 + tick;
  return `Day ${Math.floor(h / 24) + 1} · ${String(h % 24).padStart(2, '0')}:00`;
}
