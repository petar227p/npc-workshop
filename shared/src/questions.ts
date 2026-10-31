import { autoChoices, newsChoices, usualNews, type AutoChoice, type NewsChoice, type SetupRole, type SetupSpec, type Teller } from './setup';

// "Help me choose": at most four questions, each path set by the answers so far, ending in an ordinary SetupSpec for
// buildSetup. Stock, prices, materials, signals and schedules aren't asked: the setup's examples are changed in the
// editor afterwards. No zod here, so the browser can import it.

export type Answers = { job?: SetupRole; teller?: Teller; auto?: AutoChoice; news?: NewsChoice; name?: string; personality?: string };
export const STEPS = ['job', 'teller', 'act', 'news', 'who'] as const;
export type Step = (typeof STEPS)[number];
type Choice = 'job' | 'teller' | 'act' | 'news';
// Which answer each choice question sets.
export const ANSWER_OF = { job: 'job', teller: 'teller', act: 'auto', news: 'news' } as const satisfies Record<Choice, keyof Answers>;

export const QUESTIONS: Record<Step, { title: string; hint: string; short: string }> = {
  job: { short: 'Main job', title: 'What is its main job?', hint: 'This picks a starting role with example settings. You can change all of it afterwards.' },
  teller: { short: 'Shares news as', title: 'How does it share the news?', hint: 'Either way it only passes on events it really knows: the ledger checks each one.' },
  act: { short: 'Acts', title: 'When should it act?', hint: 'It always answers when spoken to. Should it also do something on its own?' },
  news: { short: 'News', title: 'Should it share the news it knows?', hint: 'Being told the news and being allowed to pass it on are two separate things.' },
  who: {
    short: 'Name and personality',
    title: 'Who is it?',
    hint: "Both optional. The personality only goes into its persona: it never changes prices, stock or what the ledger allows.",
  },
};

export const actOptions = (a: Answers): AutoChoice[] => (a.job ? autoChoices(a.job, a.teller) : []);
// Before the act question is answered, its suggestion decides which news answers fit.
export const newsOptions = (a: Answers): NewsChoice[] => (a.job ? newsChoices(a.job, a.auto ?? actOptions(a)[0]) : []);

// The questions this path asks, in order. A bard or crier is asked how it shares the news instead of whether it does;
// the news question is skipped when only one answer fits (meeting people is for passing news on).
export function questionSteps(a: Answers): Step[] {
  const steps: Step[] = ['job'];
  if (a.job === 'storyteller') steps.push('teller');
  steps.push('act');
  if (!a.job || newsOptions(a).length > 1) steps.push('news');
  steps.push('who');
  return steps;
}

// What a question shows picked before it's answered: the role's usual choice. The job has none: that one is asked.
export function suggested(step: Choice, a: Answers): string | undefined {
  if (step === 'teller') return 'bard';
  if (step === 'act') return actOptions(a)[0];
  if (step === 'news') {
    const options = newsOptions(a);
    return a.job && options.includes(usualNews(a.job)) ? usualNews(a.job) : options[0];
  }
  return undefined;
}

// After an earlier answer changes, later ones that no longer fit are dropped, to be asked again; the rest are kept.
export function fitAnswers(a: Answers): Answers {
  const out: Answers = { ...a };
  if (out.job !== 'storyteller') delete out.teller;
  if (out.auto && !actOptions(out).includes(out.auto)) delete out.auto;
  if (out.news && !newsOptions(out).includes(out.news)) delete out.news;
  return out;
}

const answered = (s: Step, a: Answers) => s === 'who' || a[ANSWER_OF[s]] !== undefined;

// The finished answers as a setup, or null while a question is still open. Where only one news answer fits, it's that one.
export function answersToSpec(a: Answers): SetupSpec | null {
  const f = fitAnswers(a);
  if (!f.job || !questionSteps(f).every((s) => answered(s, f))) return null;
  const only = newsOptions(f);
  const news = f.news ?? (only.length === 1 ? only[0] : undefined);
  return { role: f.job, ...(f.teller && { teller: f.teller }), auto: f.auto, ...(news && { news }), name: f.name, personality: f.personality };
}

// The question after this one on its path, or the review once the last is answered.
export function nextStep(a: Answers, step: Step): Step | 'review' {
  const steps = questionSteps(a);
  const i = steps.indexOf(step);
  return i < 0 ? 'review' : (steps[i + 1] ?? 'review');
}

// The question before this one, or null on the first.
export function prevStep(a: Answers, step: Step | 'review'): Step | null {
  const steps = questionSteps(a);
  if (step === 'review') return steps[steps.length - 1];
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
}
