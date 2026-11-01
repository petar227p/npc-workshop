import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../../server/src/routes/api';
import { mockClient } from '../../server/src/models';
import { createBridge, type NativeReply } from './bridge';

// Execute the actual AS2 UI methods as JavaScript with host stand-ins. This verifies
// event/lifecycle behavior; native rendering and Flash text-input semantics still need Skyrim.
const as2 = readFileSync(new URL('./ui/ConversationMenu.as', import.meta.url), 'utf8');
const js = ts.transpileModule(as2.replace(/static var /g, 'static ').replace(/static function /g, 'static '), {
  compilerOptions: { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.None },
  // AS2 resolves unqualified static members through the containing class. Give
  // the ES5 host the same lookup scope; this is not needed by the actual MTASC build.
  transformers: { before: [context => source => ts.visitNode(source, function visit(node: ts.Node): ts.Node {
    if (ts.isMethodDeclaration(node) && node.body) {
      return ts.factory.updateMethodDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.questionToken,
        node.typeParameters, node.parameters, node.type, ts.factory.createBlock([
          ts.factory.createWithStatement(ts.factory.createIdentifier('ConversationMenu'), node.body),
        ]));
    }
    return ts.visitEachChild(node, visit, context);
  }) as ts.SourceFile] },
}).outputText;
function setup(token = 'session_menu_1', generation = 1, draft = 'draft') {
  const skse = { SendModEvent: vi.fn(), AllowTextInput: vi.fn(), CloseMenu: vi.fn() };
  const key = { ENTER: 13, SHIFT: 16, ESCAPE: 27, PGUP: 33, PGDN: 34, getCode: vi.fn(), isDown: () => false, addListener: vi.fn(), removeListener: vi.fn() };
  const mouse = { addListener: vi.fn(), removeListener: vi.fn() };
  function clip(): any {
    return { beginFill() {}, lineStyle() {}, moveTo() {}, lineTo() {}, endFill() {},
      createTextField(name: string) { this[name] = { text: '', scroll: 1, maxscroll: 1, setNewTextFormat() {} }; },
      createEmptyMovieClip(name: string) { return this[name] = clip(); },
    };
  }
  const context = createContext({ _global: { skse }, Stage: {}, TextFormat: function() {}, Key: key, Mouse: mouse, Selection: { setFocus: vi.fn() } });
  runInContext(`${js}\nglobalThis.menu = ConversationMenu;`, context);
  const menu = (context as any).menu;
  for (const field of as2.matchAll(/static var (\w+)/g)) if (!(field[1] in menu)) menu[field[1]] = undefined;
  const root = clip();
  menu.main(root);
  root.nwInitialize(token, String(generation), draft);
  const ready = (locked = 'false', id = '') => root.nwReceive(token, 'Ready', locked, '100', '', id, 'ready');
  return { menu, root, skse, key, mouse, ready };
}

describe('conversation SWF event and lifecycle behavior', () => {
  it('locks before connection, submits exact text once, and ignores an unrelated ready update while admission is pending', () => {
    const { menu, root, skse, ready } = setup();
    menu.send();
    expect(skse.SendModEvent).not.toHaveBeenCalled();
    ready();
    menu.input.text = '"Hello"\nčćžšđ <b>plain text</b>';
    menu.send(); menu.send();
    expect(skse.SendModEvent).toHaveBeenCalledTimes(1);
    expect(root.nwSubmitted).toBe(menu.input.text);
    expect(menu.pending.text).toContain(menu.input.text);
    ready();
    expect(menu.busy).toBe(true);
    root.nwPending('session_menu_1', 'cmd-1', menu.input.text);
    ready('true', 'cmd-1');
    root.nwCommand('session_menu_1', 'cmd-1', 'completed');
    ready();
    expect(menu.input.text).toBe('');
    expect(menu.pending.text).toBe('');
    expect(menu.busy).toBe(false);
  });

  it('preserves rejected drafts and ignores late updates for a different menu token or command', () => {
    const { menu, root, ready } = setup();
    ready(); menu.send();
    root.nwPending('session_menu_1', 'cmd-1', 'draft');
    root.nwCommand('old-token', 'cmd-1', 'completed');
    root.nwCommand('session_menu_1', 'old-command', 'completed');
    expect(menu.input.text).toBe('draft');
    root.nwCommand('session_menu_1', 'cmd-1', 'rejected');
    ready();
    expect(root.nwText).toBe('draft');
    root.nwReceive('old-token', 'Wrong', 'true', '0', 'BAD', '');
    root.nwHistory('old-token', 'Wrong transcript', '9');
    expect(menu.status.text).toBe('Ready');
    expect(menu.history.text).toBe('');
  });

  it('keeps reader scroll position on new history and follows replies when already at the end', () => {
    const { menu, root } = setup();
    menu.history.maxscroll = 20; menu.history.scroll = 4;
    root.nwHistory('session_menu_1', 'You: hello\nBrann: hello', '1');
    expect(menu.history.scroll).toBe(4);
    menu.history.scroll = 20;
    root.nwHistory('session_menu_1', 'You: hello\nBrann: new reply', '2');
    expect(menu.history.scroll).toBe(20);
    menu.history.scroll = 8;
    root.nwHistory('session_menu_1', menu.history.text, '2');
    expect(menu.history.scroll).toBe(8);
    menu.scroll(-3);
    expect(menu.history.scroll).toBe(5);
  });

  it('closes while pending without waiting for Papyrus and releases input capture exactly once', () => {
    const { menu, root, skse, key, mouse, ready } = setup();
    ready(); menu.send(); menu.close(); root.onUnload();
    expect(skse.CloseMenu).toHaveBeenCalledWith('CustomMenu');
    expect(skse.SendModEvent).toHaveBeenCalledWith('NWConversationClose_session_menu_1', 'draft', 1);
    expect(skse.AllowTextInput.mock.calls).toEqual([[true], [false]]);
    expect(key.removeListener).toHaveBeenCalled();
    expect(mouse.removeListener).toHaveBeenCalled();
  });

  it('does not submit whitespace or a new message while the server is busy', () => {
    const { menu, skse, ready } = setup();
    ready(); menu.input.text = ' \t\n\r '; menu.send();
    expect(skse.SendModEvent).not.toHaveBeenCalled();
    menu.input.text = 'hello'; ready('true'); menu.send();
    expect(skse.SendModEvent).not.toHaveBeenCalled();
  });
});

const offer = { contract: 'c_001', revision: 1, item: 'iron dagger', quantity: 2, unit_price: 15, total_price: 30 };
function showOffers(root: any, offers = [offer], token = 'session_menu_1', revision = '1') {
  root.nwOffersBegin(token, revision);
  for (const o of offers) root.nwOffer(token, o.contract, String(o.revision), o.item, String(o.quantity), String(o.unit_price), String(o.total_price));
  root.nwOffersEnd(token, revision);
}

describe('offer review and acceptance in the actual conversation SWF methods', () => {
  it('shows quantity, unit and exact total, pages through eight offers, and freezes the selected contract/revision', () => {
    const { menu, root, ready, skse } = setup();
    ready();
    showOffers(root, Array.from({ length: 8 }, (_, i) => ({ ...offer, contract: `c_00${i + 1}`, revision: i + 1 })));
    expect(menu.offerCards[0].text).toBe('2 x iron dagger\nUnit: 15 gold\nTotal: 30 gold');
    menu.pageOffers(3); menu.review(1);
    expect(menu.selected).toMatchObject({ contract: 'c_008', revision: 8, total: 30 });
    expect(menu.confirmation.details.text).toContain('Player gold: 100');
    expect(menu.confirmation.details.text).toContain('c_008 / revision 8');
    expect(skse.SendModEvent).not.toHaveBeenCalled();
    menu.send();
    expect(skse.SendModEvent).not.toHaveBeenCalled();
    menu.dismissConfirmation(); menu.confirm();
    expect(skse.SendModEvent).not.toHaveBeenCalled();
    expect(menu.input.text).toBe('draft');
  });

  it('invalidates confirmation when an offer changes or disappears and ignores other menu tokens', () => {
    const { menu, root, ready, skse } = setup();
    ready(); showOffers(root); menu.review(0);
    showOffers(root, [], 'old-token', '2');
    expect(menu.selected).not.toBeNull();
    showOffers(root); // unchanged polling must preserve the confirmation
    expect(menu.selected.revision).toBe(1);
    showOffers(root, [{ ...offer, revision: 2, total_price: 24, unit_price: 12 }], 'session_menu_1', '2');
    expect(menu.selected).toBeNull();
    expect(menu.confirmation._visible).toBe(false);
    expect(menu.status.text).toContain('Offer changed');
    menu.confirm(); expect(skse.SendModEvent).not.toHaveBeenCalled();
    menu.review(0); showOffers(root, [], 'session_menu_1', '3');
    expect(menu.selected).toBeNull();
    expect(menu.offerCount.text).toBe('No current offers');
  });

  it('locks acceptance immediately, ignores repeated clicks and Enter, and preserves an unsent draft after acceptance', () => {
    const { menu, root, ready, skse, key } = setup();
    ready(); showOffers(root); menu.review(0);
    key.getCode.mockReturnValue(key.ENTER); menu.keys.onKeyDown();
    expect(skse.SendModEvent).not.toHaveBeenCalled();
    menu.confirm(); menu.confirm(); menu.review(0); menu.send();
    expect(skse.SendModEvent.mock.calls).toEqual([['NWConversationAccept', 'session_menu_1', 1]]);
    expect(root.nwAcceptContract).toBe('c_001'); expect(root.nwAcceptRevision).toBe(1);
    ready(); expect(menu.busy).toBe(true); // delayed local admission
    root.nwPending('session_menu_1', 'accept-1', '', 'accept');
    root.nwCommand('session_menu_1', 'accept-1', 'completed');
    root.nwReceive('session_menu_1', 'Applying trade', 'true', '100', '', 'accept-1', 'transfer_pending');
    expect(menu.status.text).toBe('Applying trade');
    expect(menu.pending.text).toContain('waiting for acknowledgement');
    expect(menu.busy).toBe(true);
    expect(menu.input.text).toBe('draft'); expect(root.nwText).toBe('draft');
    root.nwReceive('session_menu_1', 'Trade complete', 'false', '70', '', '', 'delivery_confirmed');
    expect(menu.status.text).toBe('Trade complete'); expect(menu.gold.text).toBe('70 gold');
    expect(menu.busy).toBe(false); expect(menu.pending.text).toBe('');
  });

  it('declines unaffordable offers and closes confirmation when busy or player gold changes', () => {
    const { menu, root, ready, skse } = setup();
    ready(); showOffers(root, [{ ...offer, total_price: 101 }]); menu.review(0);
    expect(menu.selected).toBeNull();
    showOffers(root); menu.review(0);
    ready('true'); expect(menu.selected).toBeNull();
    ready(); menu.review(0);
    root.nwReceive('session_menu_1', 'Ready', 'false', '20', '', '', 'ready');
    expect(menu.selected).toBeNull();
    menu.confirm(); expect(skse.SendModEvent).not.toHaveBeenCalled();
  });

  it('renders fractional unit prices as approximate while keeping the exact integer total', () => {
    const { menu, root, ready } = setup();
    ready(); showOffers(root, [{ ...offer, quantity: 3, unit_price: 10 / 3, total_price: 10 }]);
    expect(menu.offerCards[0].text).toBe('3 x iron dagger\nUnit: ~3.33 gold\nTotal: 10 gold');
    menu.review(0); expect(menu.confirmation.details.text).toContain('Total: 10 gold');
  });

  it('Esc closes confirmation and releases input without accepting', () => {
    const { menu, root, ready, key, skse } = setup();
    ready(); showOffers(root); menu.review(0);
    key.getCode.mockReturnValue(key.ESCAPE); menu.keys.onKeyDown();
    expect(skse.CloseMenu).toHaveBeenCalledWith('CustomMenu');
    expect(skse.AllowTextInput.mock.calls).toEqual([[true], [false]]);
    expect(skse.SendModEvent.mock.calls.some(([name]) => name === 'NWConversationAccept')).toBe(false);
  });

  it('reopens a pending acceptance without replay, preserves its draft, and ignores the retired menu snapshot', () => {
    const first = setup();
    first.ready(); showOffers(first.root); first.menu.review(0); first.menu.confirm(); first.menu.close();
    expect(first.skse.AllowTextInput.mock.calls).toEqual([[true], [false]]);
    const reopened = setup('session_menu_3', 3, first.root.nwText);
    const { menu, root, skse } = reopened;
    root.nwPending('session_menu_3', 'buy', '', 'accept');
    root.nwReceive('session_menu_3', 'Applying trade', 'true', '100', '', 'buy', 'transfer_pending');
    menu.confirm(); menu.send();
    showOffers(root, [offer], 'session_menu_1');
    root.nwReceive('session_menu_1', 'Trade complete', 'false', '70', '', '', 'delivery_confirmed');
    expect(menu.status.text).toBe('Applying trade'); expect(menu.offers).toHaveLength(0);
    expect(skse.SendModEvent).not.toHaveBeenCalled();
    root.nwCommand('session_menu_3', 'buy', 'completed');
    root.nwReceive('session_menu_3', 'Trade complete', 'false', '70', '', '', 'delivery_confirmed');
    expect(menu.input.text).toBe('draft'); expect(menu.status.text).toBe('Trade complete');
    expect(menu.busy).toBe(false);
  });

  it('keeps a rejected acceptance draft and never claims delivery on a completed receipt or recovery', () => {
    const { menu, root, ready } = setup();
    ready(); showOffers(root); menu.review(0); menu.confirm();
    root.nwPending('session_menu_1', 'accept-1', '', 'accept');
    root.nwCommand('session_menu_1', 'accept-1', 'rejected');
    root.nwReceive('session_menu_1', 'Offer not accepted (stale_offer). Review current terms.', 'false', '100', '', '', 'offer_rejected');
    expect(menu.input.text).toBe('draft'); expect(menu.status.text).toContain('stale_offer');
    menu.review(0); menu.confirm();
    root.nwPending('session_menu_1', 'accept-2', '', 'accept');
    root.nwCommand('session_menu_1', 'accept-2', 'uncertain');
    root.nwReceive('session_menu_1', 'Recovery required. Reload a known save.', 'true', '100', 'NW_RECOVERY', '', 'recovery_required');
    expect(menu.status.text).not.toContain('Trade complete');
    expect(menu.busy).toBe(true); expect(menu.input.text).toBe('draft');
  });

  it('negotiates and accepts the displayed offer against the real ledger, with one transfer and acknowledgement before success', async () => {
    const proposal = JSON.stringify({ action: 'OFFER', say: 'Thirty gold for two.',
      offer: { kind: 'in_stock', good: 'iron_dagger', qty: 2, price: 30, remarks: '' }, contract_id: null });
    const counter = JSON.stringify({ action: 'COUNTER_OFFER', say: 'Twenty-four, then.',
      offer: { kind: 'in_stock', good: 'iron_dagger', qty: 2, price: 24, remarks: '' }, contract_id: 'c_001' });
    const api = createApi({ makeModel: () => ({ model: 'test', client: mockClient([proposal, counter]) }) });
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => api.request(String(url), init));
    const bridge = createBridge({ fetcher: fetcher as typeof fetch });
    const { menu, root, skse } = setup();
    const packet = { version: 2, session: 'test-save', request: 0, generation: 1, near: true,
      ack: '', failed: false, pgold: 100, sgold: 50, pitem: 0, sitem: 6 };
    function render(reply: ReturnType<typeof NativeReply.parse>) {
      const ui = reply.ui;
      root.nwCommand('session_menu_1', ui.command.id, ui.command.state);
      root.nwReceive('session_menu_1', ui.status_text, String(ui.busy), String(ui.gold), ui.support_code, ui.command.id, ui.status);
      showOffers(root, ui.offers, 'session_menu_1', String(ui.revision));
    }
    const poll = async (command?: object) => bridge.pollV2({ ...packet, request: ++packet.request, ...(command ? { command } : {}) });
    render(await poll());
    render(await poll({ id: 'ask', kind: 'say', text: 'Two daggers?' }));
    menu.review(0);
    render(await poll({ id: 'negotiate', kind: 'say', text: 'Twenty-four?' }));
    expect(menu.selected).toBeNull();
    expect(menu.offerCards[0].text).toContain('Total: 24 gold');
    menu.review(0); menu.confirm(); menu.confirm();
    expect(skse.SendModEvent.mock.calls.filter(([name]) => name === 'NWConversationAccept')).toHaveLength(1);
    const accept = { id: 'buy', kind: 'accept', contract: root.nwAcceptContract, revision: root.nwAcceptRevision };
    root.nwPending('session_menu_1', accept.id, '', 'accept');
    const transfer = await poll(accept); render(transfer);
    expect(transfer.plan).not.toBe('');
    expect(menu.status.text).toBe('Applying trade'); expect(menu.busy).toBe(true);
    expect(menu.gold.text).toBe('100 gold');
    expect((await poll(accept)).plan).toBe(transfer.plan);
    // Emulate only the checked physical transfer/ack; actual Papyrus inventory calls require Skyrim.
    Object.assign(packet, { ack: transfer.plan, pgold: 76, sgold: 74, pitem: 2, sitem: 4 });
    render(await poll());
    expect(menu.status.text).toBe('Trade complete'); expect(menu.gold.text).toBe('76 gold');
    expect(menu.busy).toBe(false); expect(menu.input.text).toBe('draft');
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/accept'))).toHaveLength(1);
    expect((await poll(accept)).plan).toBe('');
  });
});
