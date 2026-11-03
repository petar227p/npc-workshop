import type { HintLink } from './hints';

// The demo's utility panels: at most one is open, so they never overlap. Stock is one of them, though its button sits
// beside the conversation. Which Inspect village section shows is kept apart from whether Inspect is open, so closing
// and reopening it (or visiting another panel) lands on the same section.
export type Panel = 'bag' | 'rumours' | 'inspect' | 'stock';
export type InspectTab = 'activity' | 'sandbox';
export type Panels = {
  open: Panel | null;
  tab: InspectTab;
  reveal: string | null; // the element a hint's link points at, revealed once its panel has rendered
};

export type PanelAction =
  | { type: 'toggle'; panel: Panel; tab?: InspectTab } // a panel's own button
  | { type: 'close'; panel?: Panel } // only that panel, if given: a late close from one already replaced is ignored
  | { type: 'tab'; tab: InspectTab }
  | { type: 'follow'; to: HintLink } // a hint's link: open what it's about and point at it
  | { type: 'revealed' }
  | { type: 'arrived' } // something new is in the player's hands
  | { type: 'partner' }; // the conversation moved to someone else, whose stock is not the one shown

export const NO_PANELS: Panels = { open: null, tab: 'activity', reveal: null };

// Where a hint's link goes: the panel, and the id of the entry in it.
export function linkTarget(to: HintLink): { panel: Panel; id: string } {
  if (to.kind === 'news') return { panel: 'rumours', id: `know-${to.event_id}-${to.knower}` };
  return { panel: 'bag', id: to.kind === 'item' ? `item-${to.id}` : 'bag-goods' };
}

export function panelsReducer(s: Panels, a: PanelAction): Panels {
  switch (a.type) {
    case 'toggle': {
      const tab = a.tab ?? s.tab;
      // Inspect's buttons name a section: the open one closes it, another switches to it.
      const same = s.open === a.panel && (a.panel !== 'inspect' || tab === s.tab);
      return { ...s, open: same ? null : a.panel, tab };
    }
    case 'close':
      return a.panel && a.panel !== s.open ? s : { ...s, open: null };
    case 'tab':
      return { ...s, tab: a.tab };
    case 'follow': {
      const { panel, id } = linkTarget(a.to);
      return { ...s, open: panel, reveal: id };
    }
    case 'revealed':
      return { ...s, reveal: null };
    // Until the Bag has its own arrival cue, an arrival shows the Bag, but never in place of a panel the player opened.
    case 'arrived':
      return s.open === null ? { ...s, open: 'bag' } : s;
    case 'partner':
      return s.open === 'stock' ? { ...s, open: null } : s;
  }
}
