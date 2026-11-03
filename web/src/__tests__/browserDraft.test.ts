import { buildSetup } from '@npc-workshop/shared/src/setup';
import { describe, expect, it } from 'vitest';
import { BROWSER_DRAFT_KEY, BROWSER_DRAFTS_KEY, MAX_DRAFTS, readDrafts, saveBrowserDraft, saveDrafts, shelveDraft } from '../browserDraft';

describe('browser draft persistence', () => {
  it('stores a complete draft that can be restored', () => {
    const draft = buildSetup({ role: 'merchant' }).draft;
    const values = new Map<string, string>();
    expect(saveBrowserDraft(draft, () => ({ setItem: (key, value) => { values.set(key, value); } }))).toBe(true);
    expect(JSON.parse(values.get(BROWSER_DRAFT_KEY)!)).toEqual(draft);
  });

  it('reports blocked storage access without modifying the current draft', () => {
    const draft = buildSetup({ role: 'guard' }).draft;
    const before = structuredClone(draft);
    expect(saveBrowserDraft(draft, () => { throw new Error('Storage access denied'); })).toBe(false);
    expect(draft).toEqual(before);
  });

  it('keeps the previously saved copy when a write fails and can retry the latest draft', () => {
    const oldDraft = buildSetup({ role: 'merchant' }).draft;
    const latestDraft = { ...oldDraft, name: 'Updated name' };
    let saved = JSON.stringify(oldDraft);
    let full = true;
    const storage = () => ({ setItem: (_key: string, value: string) => {
      if (full) throw new Error('Storage quota exceeded');
      saved = value;
    } });
    expect(saveBrowserDraft(latestDraft, storage)).toBe(false);
    expect(JSON.parse(saved)).toEqual(oldDraft);
    full = false;
    expect(saveBrowserDraft(latestDraft, storage)).toBe(true);
    expect(JSON.parse(saved)).toEqual(latestDraft);
  });
});

describe('drafts set aside', () => {
  const merchant = buildSetup({ role: 'merchant' }).draft;
  const guard = buildSetup({ role: 'guard' }).draft;

  it('puts the replaced draft first and takes the opened one out', () => {
    const list = shelveDraft([], merchant, null, 1, 'a');
    expect(list.map((d) => d.key)).toEqual(['a']);
    const next = shelveDraft(list, guard, 'a', 2, 'b');
    expect(next).toEqual([{ key: 'b', saved: 2, draft: guard }]);
  });

  it('keeps at most the limit, dropping the oldest', () => {
    let list: ReturnType<typeof shelveDraft> = [];
    for (let i = 0; i < MAX_DRAFTS + 3; i++) list = shelveDraft(list, merchant, null, i, `k${i}`);
    expect(list).toHaveLength(MAX_DRAFTS);
    expect(list[0].key).toBe(`k${MAX_DRAFTS + 2}`);
  });

  it('round-trips through storage and ignores malformed entries', () => {
    const values = new Map<string, string>();
    const list = shelveDraft([], merchant, null, 5, 'x');
    expect(saveDrafts(list, () => ({ setItem: (k, v) => { values.set(k, v); } }))).toBe(true);
    values.set(BROWSER_DRAFTS_KEY, JSON.stringify([...JSON.parse(values.get(BROWSER_DRAFTS_KEY)!), { key: 1 }, null]));
    expect(readDrafts(() => ({ getItem: (k) => values.get(k) ?? null }))).toEqual(list);
  });

  it('reads nothing from unreadable or blocked storage', () => {
    expect(readDrafts(() => ({ getItem: () => '{not json' }))).toEqual([]);
    expect(readDrafts(() => { throw new Error('blocked'); })).toEqual([]);
    expect(saveDrafts([], () => { throw new Error('blocked'); })).toBe(false);
  });
});
