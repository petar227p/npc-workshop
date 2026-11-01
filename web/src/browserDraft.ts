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
