import type { ActionResponse, ArtResponse, BenchResponse, EditorLibrary, Gift, NpcDraft, PreviewResponse, ReadNoteResponse, SaveResponse, SketchResponse, StateView, TranscribeResponse, WorldReport } from '@blacksmith/shared';

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
  report: (r: WorldReport) => call<ActionResponse>('god', r),
  readNote: (note: string) => call<ReadNoteResponse>('god/read', { note }),
  transcribe: async (wav: Uint8Array<ArrayBuffer>): Promise<TranscribeResponse> => {
    const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(err?.error ?? `Nobody heard that (${res.status}).`);
    }
    return (await res.json()) as TranscribeResponse;
  },
};

// Reference pictures are up to a megabyte, and only pictures and saves use them: the checks on every edit and the
// bench turns go without (the browser checked each picture when it was dropped).
const lean = (npc: NpcDraft): NpcDraft => ({ ...npc, art: { ...npc.art, references: [] } });

export const editorApi = {
  library: () => call<EditorLibrary>('editor/library'),
  preview: (npc: NpcDraft) => call<PreviewResponse>('editor/preview', { npc: lean(npc) }),
  say: (npc: NpcDraft, text: string) => call<BenchResponse>('editor/bench/say', { npc: lean(npc), text }),
  tick: (npc: NpcDraft, ticks: number) => call<BenchResponse>('editor/bench/tick', { npc: lean(npc), ticks }),
  reset: () => call<BenchResponse>('editor/bench/reset', {}),
  save: (npc: NpcDraft, overwrite = false) => call<SaveResponse>('editor/save', { npc, overwrite }),
  sketch: (npc: NpcDraft, subject: string) => call<SketchResponse>('editor/sketch', { npc, subject }),
};

// The zod-free module, so the schemas stay out of the bundle. The NPCs' clock fact uses the same text.
export { clockText } from '@blacksmith/shared/src/clock';
