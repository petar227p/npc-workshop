import type { NpcDraft } from '@blacksmith/shared';

export const BROWSER_DRAFT_KEY = 'bs_npc_draft';

// Access can fail before setItem runs (for example, when browser storage is blocked).
export function saveBrowserDraft(draft: NpcDraft, storage: () => Pick<Storage, 'setItem'> = () => localStorage): boolean {
  try {
    storage().setItem(BROWSER_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

// Drafts set aside when another NPC is started or opened, newest first. Each keeps its own key so two drafts with the
// same name or id stay apart. The stored draft is raw: the editor normalizes it on the way back in.
export const BROWSER_DRAFTS_KEY = 'bs_npc_drafts';
export const MAX_DRAFTS = 20;
export type ShelvedDraft = { key: string; saved: number; draft: NpcDraft };

export function readDrafts(storage: () => Pick<Storage, 'getItem'> = () => localStorage): { key: string; saved: number; draft: unknown }[] {
  try {
    const raw: unknown = JSON.parse(storage().getItem(BROWSER_DRAFTS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((d): d is { key: string; saved: number; draft: unknown } =>
      Boolean(d) && typeof d === 'object' && typeof d.key === 'string' && typeof d.saved === 'number' && Boolean(d.draft) && typeof d.draft === 'object');
  } catch {
    return [];
  }
}

export function saveDrafts(drafts: ShelvedDraft[], storage: () => Pick<Storage, 'setItem'> = () => localStorage): boolean {
  try {
    storage().setItem(BROWSER_DRAFTS_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

// Sets `draft` aside at the top of the list and takes `opening` (a key) out of it. Past the limit the oldest go.
export function shelveDraft(drafts: ShelvedDraft[], draft: NpcDraft | null, opening: string | null, now: number, key: string): ShelvedDraft[] {
  const rest = drafts.filter((d) => d.key !== opening);
  return (draft ? [{ key, saved: now, draft }, ...rest] : rest).slice(0, MAX_DRAFTS);
}
