import { describe, expect, it } from 'vitest';
import { MAX_PERSONA_LENGTH, RESERVED_IDS } from './npc-info';
import { abilitiesOf, autoChoices, buildSetup, freshNpcId, newsChoices, ROLE_CARDS, SETUP_ROLES, supportedSetups, type SetupSpec } from './setup';

// The ids of the village's NPC files, as the editor's library would list them.
const LIBRARY = ['bard', 'cottager', 'crier', 'farmer', 'guard', 'keeper', 'merchant', 'smith'];
const build = (spec: SetupSpec, taken = LIBRARY) => buildSetup(spec, taken);

describe('guided setup', () => {
  it('has the five cards, each a fresh draft with its own id and name, none a village NPC', () => {
    expect(SETUP_ROLES.map((r) => ROLE_CARDS[r].label)).toEqual(['Merchant', 'Craftsperson', 'Villager', 'Bard / Town crier', 'Guard']);
    const drafts = SETUP_ROLES.map((role) => build({ role }).draft);
    for (const d of drafts) {
      expect(LIBRARY).not.toContain(d.id);
      expect(d.id).toMatch(/^[a-z][a-z0-9_]{0,40}$/);
      expect(['Brann', 'Mira', 'Garrick', 'Pell', 'Osric', 'Tobin', 'Edda', 'Wren']).not.toContain(d.name);
      expect(d.persona.length).toBeLessThanOrEqual(MAX_PERSONA_LENGTH);
    }
    expect(new Set(drafts.map((d) => d.id)).size).toBe(5);
  });

  it('picks what each ability needs, and leaves the code-only verbs out of what the model may choose', () => {
    const merchant = build({ role: 'merchant' }).draft;
    expect(merchant.verbs).toEqual(['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE']);
    expect(merchant.facts).toEqual(['clock', 'purse', 'stock', 'catalogue', 'price_floor', 'open_offers']);
    expect(merchant.catalogue.in_stock).toBeDefined();

    const crafter = build({ role: 'craftsperson' }).draft;
    expect(crafter.verbs).toContain('START_WORK');
    expect(crafter.model_verbs).toEqual(['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE']);
    expect(crafter.catalogue.made_to_order).toBeDefined();

    const guard = build({ role: 'guard' }).draft;
    expect(guard.verbs).toEqual(['SAY', 'OFFER', 'REFUSE', 'SIGNAL']);
    expect(guard.facts).toEqual(expect.arrayContaining(['signals', 'stock', 'catalogue', 'open_offers']));
    expect(Object.keys(guard.signals)).toEqual(['open_gate', 'raise_alarm']);

    expect(build({ role: 'storyteller' }).draft.verbs).toEqual(['SAY', 'EMOTE', 'RETELL']);
    const crier = build({ role: 'storyteller', teller: 'crier' }).draft;
    expect(crier.verbs).toEqual(['SAY', 'ANNOUNCE']);
    expect(crier.triggers.map((t) => t.kind)).toEqual(['on_spoken_to', 'on_new_memory']);

    for (const spec of supportedSetups()) {
      const d = build(spec).draft;
      expect(d.verbs).not.toContain('ACCEPT');
      expect(d.verbs).not.toContain('GIVE'); // no role gives things away, and the sellers may not
      expect(d.model_verbs as string[]).not.toContain('START_WORK');
      expect(d.model_verbs.every((v) => d.verbs.includes(v))).toBe(true);
      if (d.verbs.some((v) => v === 'TELL' || v === 'RETELL' || v === 'ANNOUNCE')) expect(d.facts).toContain('memories');
    }
  });

  it('knowing the news and passing it on are separate choices', () => {
    const none = build({ role: 'merchant', news: 'none' }).draft;
    const knows = build({ role: 'merchant', news: 'knows' }).draft;
    const tells = build({ role: 'merchant', news: 'tells' }).draft;
    expect(none.facts).not.toContain('memories');
    expect(knows.facts).toContain('memories');
    expect(knows.verbs).not.toContain('TELL');
    expect(knows.persona).toMatch(/you don't pass news on/);
    expect(tells.verbs).toContain('TELL');
    expect(tells.cue).toMatch(/\(TELL\)/);
    expect(tells.persona).toMatch(/`event_id`/);
  });

  it('only offers the triggers a role can use, and only the news choices a trigger can work with', () => {
    expect(autoChoices('merchant')).toEqual(['none', 'timer']);
    expect(autoChoices('villager')).toEqual(['meet', 'none', 'timer']);
    expect(autoChoices('storyteller', 'crier')).toEqual(['news', 'none', 'timer']);
    expect(newsChoices('villager', 'meet')).toEqual(['tells']);
    expect(newsChoices('villager', 'timer')).toEqual(['none', 'knows', 'tells']);
    expect(newsChoices('storyteller', 'news')).toEqual([]);
    // Every path through the questions builds without a mismatch.
    const all = supportedSetups();
    expect(new Set(all.map((s) => s.role))).toEqual(new Set(SETUP_ROLES));
    for (const spec of all) expect(build(spec).unsupported).toEqual([]);
  });

  it("explains a choice that doesn't fit and never adds an ability that wasn't asked for", () => {
    const quiet = build({ role: 'villager', auto: 'meet', news: 'none' });
    expect(quiet.draft.verbs).not.toContain('TELL');
    expect(quiet.draft.triggers).toEqual([{ kind: 'on_spoken_to' }]);
    expect(quiet.unsupported.join()).toMatch(/On meeting someone needs it to share news/);

    const merchant = build({ role: 'merchant', auto: 'news' });
    expect(merchant.draft.triggers).toEqual([{ kind: 'on_spoken_to' }]);
    expect(merchant.unsupported.join()).toMatch(/On hearing news isn't offered for a merchant/);

    const bard = build({ role: 'storyteller', news: 'none' });
    expect(bard.draft.verbs).toContain('RETELL');
    expect(bard.unsupported.join()).toMatch(/always shares the news/);

    expect(build({ role: 'guard', teller: 'crier' }).unsupported.join()).toMatch(/only applies to the Bard \/ Town crier card/);
    expect(build({ role: 'storyteller' }).assumptions.join()).toMatch(/Made a bard/);
  });

  it('a timer gets an example interval and a cue that keeps offers for when someone asks', () => {
    const d = build({ role: 'merchant', auto: 'timer' }).draft;
    expect(d.triggers[1]).toMatchObject({ kind: 'every_hours', hours: 4 });
    expect(d.triggers[1].kind === 'every_hours' && d.triggers[1].cue).toMatch(/Make offers only when someone asks/);
  });

  it('every draft is its own: changing one changes no other, nor the template', () => {
    const a = build({ role: 'guard' }).draft;
    const b = build({ role: 'guard' }).draft;
    a.start.stock.gate_pass = 99;
    a.catalogue.in_stock!.gate_pass.min_price = 50;
    a.signals.open_gate = 'changed';
    a.labels.gate_pass = 'changed';
    a.triggers.push({ kind: 'every_hours', hours: 1, cue: 'x' });
    a.fallbacks.rejected = 'changed';
    a.art.references.push('x');
    const c = build({ role: 'guard' }).draft;
    expect(c).toEqual(b);
    expect(c.start.stock.gate_pass).toBe(3);
    const v = build({ role: 'villager' }).draft;
    v.schedule[0].place = 'gate';
    expect(build({ role: 'villager' }).draft.schedule[0].place).toBe('cottage');
  });

  it('a personality goes into the persona and nowhere else', () => {
    const plain = build({ role: 'merchant' }).draft;
    const gruff = build({ role: 'merchant', personality: 'Gruff,\n  suspicious of   strangers.' }).draft;
    expect(gruff.persona).toMatch(/- Gruff, suspicious of strangers\./);
    expect(gruff.persona).not.toMatch(/born trader/);
    expect({ ...gruff, persona: '' }).toEqual({ ...plain, persona: '' });
    const long = build({ role: 'merchant', personality: 'x'.repeat(400) });
    expect(long.draft.persona).toContain(`- ${'x'.repeat(300)}\n`);
    expect(long.assumptions.join()).toMatch(/cut to 300/);
  });

  it('ids come from the name, and never take a library id or an engine one', () => {
    expect(build({ role: 'merchant', name: 'Old Mára' }).draft).toMatchObject({ id: 'old_mara', name: 'Old Mára' });
    expect(build({ role: 'merchant', name: 'Smith' }).draft.id).toBe('smith_2');
    expect(freshNpcId('Smith', 'x', ['smith', 'smith_2'])).toBe('smith_3');
    for (const id of RESERVED_IDS) expect(freshNpcId(id, 'x')).toBe(`${id}_2`);
    expect(build({ role: 'merchant', name: '9 lives' }).draft.id).toBe('stallkeeper');
    expect(build({ role: 'merchant', name: '   ' }).draft).toMatchObject({ id: 'hesta', name: 'Hesta' }); // the template's name, then its id
    expect(freshNpcId('stallkeeper', 'x', ['stallkeeper'])).toBe('stallkeeper_2');
    const long = freshNpcId('a'.repeat(60), 'x', ['a'.repeat(36)]);
    expect(long).toBe(`${'a'.repeat(36)}_2`);
    expect(build({ role: 'merchant', name: 'N'.repeat(50) }).draft.name).toHaveLength(40);
  });

  it('the summary says what it does, when, with what example numbers, and what is left to the game', () => {
    const guard = build({ role: 'guard' }).summary;
    expect(guard.role).toBe('Guard');
    expect(guard.abilities.join(' ')).toMatch(/free items from its stock \(gate pass\)\. The ledger counts each one/);
    expect(guard.abilities.join(' ')).toMatch(/These are requests/);
    expect(guard.samples.join(' ')).toMatch(/Example signal open_gate, a request to the game/);
    expect(guard.integration.join(' ')).toMatch(/Your game has to act on open_gate and raise_alarm itself/);

    const merchant = build({ role: 'merchant' }).summary;
    expect(merchant.samples[0]).toBe('Example stock and minimum prices: candle ×12 at 1 gold or more each, rations ×8 at 3 gold or more each, rope ×4 at 4 gold or more each, waterskin ×3 at 5 gold or more each, lantern ×1 at 20 gold or more each.');
    expect(build({ role: 'craftsperson' }).summary.samples.join(' ')).toMatch(/Lowest price: material cost \+ 25%/);

    // A talk-only villager claims no trade and no news.
    const talker = build({ role: 'villager', news: 'none' }).summary;
    expect(talker.abilities.join(' ')).not.toMatch(/offer|news/i);
    expect(talker.behaviour).toEqual(['Answers when spoken to.', 'Its day (example): cottage from 7:00, square from 10:00, cottage from 13:00, tavern from 19:00, cottage from 23:00.']);
    for (const spec of supportedSetups()) expect(build(spec).summary.integration[0]).toMatch(/test bench only/);
  });

  it('reads back the abilities a setup switched on, and only those', () => {
    expect(abilitiesOf(build({ role: 'merchant', news: 'tells' }).draft)).toEqual(['talk', 'sell', 'tell']);
    expect(abilitiesOf(build({ role: 'craftsperson' }).draft)).toEqual(['talk', 'craft']);
    expect(abilitiesOf(build({ role: 'guard', news: 'knows' }).draft)).toEqual(['talk', 'grant', 'knows', 'signal']);
    expect(abilitiesOf(build({ role: 'storyteller', teller: 'crier' }).draft)).toEqual(['talk', 'announce']);
    // A verb the ledger allows but the model may not choose isn't something it does on its own.
    const d = build({ role: 'merchant' }).draft;
    expect(abilitiesOf({ ...d, model_verbs: ['SAY'] })).toEqual(['talk']);
  });
});
