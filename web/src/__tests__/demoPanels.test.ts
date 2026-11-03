import { describe, expect, it } from 'vitest';
import { linkTarget, NO_PANELS, panelsReducer, type PanelAction, type Panels } from '../demoPanels';

const run = (...actions: PanelAction[]): Panels => actions.reduce(panelsReducer, NO_PANELS);

describe('demo panels', () => {
  it('opens one panel at a time, and its button closes it again', () => {
    expect(run({ type: 'toggle', panel: 'bag' }).open).toBe('bag');
    expect(run({ type: 'toggle', panel: 'bag' }, { type: 'toggle', panel: 'rumours' }).open).toBe('rumours');
    expect(run({ type: 'toggle', panel: 'rumours' }, { type: 'toggle', panel: 'rumours' }).open).toBeNull();
    expect(run({ type: 'toggle', panel: 'rumours' }, { type: 'toggle', panel: 'stock' }).open).toBe('stock');
  });

  it('keeps the Inspect section while Inspect is closed or another panel is open', () => {
    const s = run({ type: 'toggle', panel: 'inspect', tab: 'sandbox' }, { type: 'toggle', panel: 'bag' }, { type: 'toggle', panel: 'inspect' });
    expect(s).toMatchObject({ open: 'inspect', tab: 'sandbox' });
    expect(run({ type: 'tab', tab: 'sandbox' }, { type: 'close' }).tab).toBe('sandbox');
  });

  it("an Inspect section's button switches to it, or closes Inspect when it's the one showing", () => {
    const sandbox = run({ type: 'toggle', panel: 'inspect', tab: 'activity' }, { type: 'toggle', panel: 'inspect', tab: 'sandbox' });
    expect(sandbox).toMatchObject({ open: 'inspect', tab: 'sandbox' });
    expect(panelsReducer(sandbox, { type: 'toggle', panel: 'inspect', tab: 'sandbox' }).open).toBeNull();
  });

  it("a close from a panel that's already been replaced changes nothing", () => {
    const s = run({ type: 'toggle', panel: 'stock' }, { type: 'toggle', panel: 'bag' });
    expect(panelsReducer(s, { type: 'close', panel: 'stock' })).toBe(s);
    expect(panelsReducer(s, { type: 'close', panel: 'bag' }).open).toBeNull();
  });

  it("a hint's link opens the panel and points at the entry, until it has been revealed", () => {
    const news = run({ type: 'toggle', panel: 'bag' }, { type: 'follow', to: { kind: 'news', event_id: 'e_0004', knower: 'cottager' } });
    expect(news).toMatchObject({ open: 'rumours', reveal: 'know-e_0004-cottager' });
    expect(panelsReducer(news, { type: 'revealed' })).toMatchObject({ open: 'rumours', reveal: null });
    expect(run({ type: 'follow', to: { kind: 'item', id: 'i_1' } })).toMatchObject({ open: 'bag', reveal: 'item-i_1' });
    expect(linkTarget({ kind: 'goods' })).toEqual({ panel: 'bag', id: 'bag-goods' });
  });

  it('an arrival shows the Bag only when nothing else is open', () => {
    expect(run({ type: 'arrived' }).open).toBe('bag');
    expect(run({ type: 'toggle', panel: 'inspect' }, { type: 'arrived' }).open).toBe('inspect');
  });

  it('talking to someone else closes the stock, and only the stock', () => {
    expect(run({ type: 'toggle', panel: 'stock' }, { type: 'partner' }).open).toBeNull();
    expect(run({ type: 'toggle', panel: 'rumours' }, { type: 'partner' }).open).toBe('rumours');
  });
});
