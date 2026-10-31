import { describe, expect, it } from 'vitest';
import { actOptions, answersToSpec, fitAnswers, newsOptions, nextStep, prevStep, questionSteps, suggested, type Answers } from './questions';
import { buildSetup, SETUP_ROLES, supportedSetups, TELLERS, type SetupSpec } from './setup';

// Every way through the questions, answered the way the panel does: each option of each question the path asks.
function everyPath(): Answers[] {
  const out: Answers[] = [];
  for (const job of SETUP_ROLES) {
    for (const teller of questionSteps({ job }).includes('teller') ? TELLERS : [undefined]) {
      const a: Answers = { job, ...(teller && { teller }) };
      for (const auto of actOptions(a)) {
        const b = { ...a, auto };
        if (questionSteps(b).includes('news')) for (const news of newsOptions(b)) out.push({ ...b, news });
        else out.push(b);
      }
    }
  }
  return out;
}
const key = (s: SetupSpec) => JSON.stringify([s.role, s.teller ?? null, s.auto ?? null, s.news ?? null]);

describe('help me choose', () => {
  it('asks at most four questions, and each path only the ones that matter to it', () => {
    expect(questionSteps({})).toEqual(['job', 'act', 'news', 'who']);
    expect(questionSteps({ job: 'merchant' })).toEqual(['job', 'act', 'news', 'who']);
    expect(questionSteps({ job: 'storyteller' })).toEqual(['job', 'teller', 'act', 'who']); // how it shares news, not whether
    expect(questionSteps({ job: 'villager', auto: 'meet' })).toEqual(['job', 'act', 'who']); // meeting people means passing news on
    expect(questionSteps({ job: 'villager', auto: 'timer' })).toEqual(['job', 'act', 'news', 'who']);
    for (const a of everyPath()) expect(questionSteps(a).length).toBeLessThanOrEqual(4);
  });

  it('every finished path is a supported setup that builds without a mismatch, and together they are all of them', () => {
    const specs = everyPath().map((a) => answersToSpec(a)!);
    for (const s of specs) expect(buildSetup(s).unsupported).toEqual([]);
    expect(new Set(specs.map(key))).toEqual(new Set(supportedSetups().map(key)));
    expect(answersToSpec({ job: 'villager', auto: 'meet' })).toMatchObject({ role: 'villager', auto: 'meet', news: 'tells' });
  });

  it("isn't finished while a question is open", () => {
    expect(answersToSpec({})).toBeNull();
    expect(answersToSpec({ job: 'merchant' })).toBeNull();
    expect(answersToSpec({ job: 'merchant', auto: 'none' })).toBeNull();
    expect(answersToSpec({ job: 'storyteller', auto: 'news' })).toBeNull(); // bard or crier not picked
    expect(answersToSpec({ job: 'merchant', auto: 'none', news: 'knows' })).toEqual({ role: 'merchant', auto: 'none', news: 'knows', name: undefined, personality: undefined });
  });

  it("suggests each role's usual answer, and nothing for the job", () => {
    expect(suggested('job', {})).toBeUndefined();
    expect(suggested('act', { job: 'storyteller', teller: 'crier' })).toBe('news');
    expect(suggested('act', { job: 'guard' })).toBe('none');
    expect(suggested('news', { job: 'villager', auto: 'timer' })).toBe('tells');
    expect(suggested('news', { job: 'merchant', auto: 'none' })).toBe('none');
    expect(suggested('teller', { job: 'storyteller' })).toBe('bard');
  });

  it('a changed answer drops only the later ones that no longer fit', () => {
    const villager: Answers = { job: 'villager', auto: 'meet', news: 'tells', name: 'Ada', personality: 'Shy.' };
    expect(fitAnswers({ ...villager, job: 'merchant' })).toEqual({ job: 'merchant', news: 'tells', name: 'Ada', personality: 'Shy.' });
    expect(fitAnswers({ ...villager, job: 'storyteller', teller: 'crier' })).toEqual({ job: 'storyteller', teller: 'crier', name: 'Ada', personality: 'Shy.' });
    expect(fitAnswers({ job: 'guard', teller: 'bard', auto: 'timer' })).toEqual({ job: 'guard', auto: 'timer' });
    expect(fitAnswers({ job: 'villager', auto: 'meet', news: 'none' })).toEqual({ job: 'villager', auto: 'meet' });
  });

  it('back and next walk the same path, and moving never changes an answer', () => {
    const a: Answers = Object.freeze({ job: 'storyteller', teller: 'bard', auto: 'news' });
    expect(nextStep(a, 'job')).toBe('teller');
    expect(nextStep(a, 'teller')).toBe('act');
    expect(nextStep(a, 'act')).toBe('who');
    expect(nextStep(a, 'who')).toBe('review');
    expect(prevStep(a, 'review')).toBe('who');
    expect(prevStep(a, 'who')).toBe('act');
    expect(prevStep(a, 'teller')).toBe('job');
    expect(prevStep(a, 'job')).toBeNull();
    expect(prevStep({ job: 'villager', auto: 'meet' }, 'who')).toBe('act');
    expect(nextStep({ job: 'villager', auto: 'timer' }, 'act')).toBe('news');
  });

  it('a name and personality go through to the setup, and only into its name and persona', () => {
    const spec = answersToSpec({ job: 'guard', auto: 'none', news: 'none', name: 'Sigrun', personality: 'Gruff but fair.' })!;
    const plain = buildSetup({ ...spec, name: undefined, personality: undefined }).draft;
    const named = buildSetup(spec).draft;
    expect(named).toMatchObject({ id: 'sigrun', name: 'Sigrun' });
    expect(named.persona).toMatch(/- Gruff but fair\./);
    expect({ ...named, id: '', name: '', persona: '' }).toEqual({ ...plain, id: '', name: '', persona: '' });
  });
});
