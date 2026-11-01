import { buildSetup } from '@blacksmith/shared/src/setup';
import { describe, expect, it } from 'vitest';
import { BROWSER_DRAFT_KEY, saveBrowserDraft } from '../browserDraft';

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
