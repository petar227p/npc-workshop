// The zod-free modules, so the schemas stay out of the bundle.
import {
  actOptions,
  ANSWER_OF,
  answersToSpec,
  fitAnswers,
  newsOptions,
  nextStep,
  prevStep,
  QUESTIONS,
  questionSteps,
  suggested,
  type Answers,
  type Step,
} from '@blacksmith/shared/src/questions';
import {
  AUTO_INFO,
  buildSetup,
  MAX_PERSONALITY,
  MAX_SETUP_NAME,
  NEWS_INFO,
  ROLE_CARDS,
  SETUP_ROLES,
  TELLER_INFO,
  TELLERS,
  type SetupResult,
} from '@blacksmith/shared/src/setup';
import { useEffect, useRef, useState, type FormEvent } from 'react';

// "Help me choose": a few questions, then the proposed setup to read and change before anything replaces the draft.
// Nothing here touches the draft or the bench; `onUse` hands the result to the editor, which asks before replacing.

type Option = { value: string; label: string; description: string };

function optionsFor(step: Exclude<Step, 'who'>, a: Answers): Option[] {
  if (step === 'job') return SETUP_ROLES.map((r) => ({ value: r, label: ROLE_CARDS[r].job, description: `${ROLE_CARDS[r].label}: ${ROLE_CARDS[r].blurb}` }));
  if (step === 'teller') return TELLERS.map((t) => ({ value: t, label: TELLER_INFO[t].label, description: TELLER_INFO[t].description }));
  if (step === 'act') return actOptions(a).map((o) => ({ value: o, label: AUTO_INFO[o].label, description: AUTO_INFO[o].description }));
  return newsOptions(a).map((o) => ({ value: o, label: NEWS_INFO[o].label, description: NEWS_INFO[o].description }));
}

// One answer in words, for the review.
function answerText(step: Step, a: Answers, r: SetupResult): string {
  if (step === 'job') return a.job ? ROLE_CARDS[a.job].job : '';
  if (step === 'teller') return a.teller ? TELLER_INFO[a.teller].label : '';
  if (step === 'act') return a.auto ? AUTO_INFO[a.auto].label : '';
  if (step === 'news') return a.news ? NEWS_INFO[a.news].label : '';
  const name = a.name?.trim() ? r.draft.name : `${r.draft.name} (the template's)`;
  return `${name}; ${a.personality?.trim() ? 'your personality' : "the template's personality"}`;
}

export function Questionnaire({ taken, locked, onUse, onCancel }: { taken: string[]; locked: boolean; onUse: (r: SetupResult) => void; onCancel: () => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState<Step | 'review'>('job');
  const [editing, setEditing] = useState(false); // came from the review to change one answer: Next goes straight back
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);

  const steps = questionSteps(answers);
  const spec = answersToSpec(answers);
  const result = step === 'review' && spec ? buildSetup(spec, taken) : null;

  const pick = (value: string) => setAnswers((a) => fitAnswers({ ...a, [ANSWER_OF[step as Exclude<Step, 'who'>]]: value }));
  const chosen = step === 'review' || step === 'who' ? undefined : (answers[ANSWER_OF[step]] ?? suggested(step, answers));

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'review') return;
    if (step !== 'who' && !chosen) return;
    // A suggestion counts as the answer once Next is pressed.
    const a = step === 'who' ? answers : fitAnswers({ ...answers, [ANSWER_OF[step]]: chosen });
    setAnswers(a);
    if (editing && answersToSpec(a)) {
      setEditing(false);
      setStep('review');
    } else setStep(nextStep(a, step));
  };
  const back = () => {
    const p = prevStep(answers, step);
    if (p) setStep(p);
  };
  const change = (s: Step) => {
    setEditing(true);
    setStep(s);
  };

  return (
    <section className="panel starters questions" id="starters" aria-labelledby="questions-h">
      <h3 id="questions-h">Help me choose</h3>
      {step !== 'review' && (
        <form onSubmit={next}>
          <p className="muted small">
            Question {steps.indexOf(step) + 1} of {steps.length}
          </p>
          <h4 ref={heading} tabIndex={-1}>
            {QUESTIONS[step].title}
          </h4>
          <p className="muted small">{QUESTIONS[step].hint}</p>
          {step === 'who' ? (
            <div className="row2">
              <label className="field">
                <span className="field-label">
                  Name <span className="muted">· optional</span>
                </span>
                <input value={answers.name ?? ''} maxLength={MAX_SETUP_NAME} onChange={(e) => setAnswers((a) => ({ ...a, name: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">
                  Personality <span className="muted">· optional, {MAX_PERSONALITY - (answers.personality?.length ?? 0)} characters left</span>
                </span>
                <textarea
                  rows={3}
                  value={answers.personality ?? ''}
                  maxLength={MAX_PERSONALITY}
                  placeholder="e.g. Gruff but fair, suspicious of strangers, proud of the family trade."
                  onChange={(e) => setAnswers((a) => ({ ...a, personality: e.target.value }))}
                />
              </label>
            </div>
          ) : (
            <fieldset className="choices">
              <legend className="sr-only">{QUESTIONS[step].title}</legend>
              {optionsFor(step, answers).map((o) => (
                <label key={o.value} className="check choice">
                  <input type="radio" name={step} value={o.value} checked={chosen === o.value} onChange={() => pick(o.value)} />
                  <span>
                    <b>{o.label}</b> <span className="muted">{o.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="actions">
            <button type="submit" disabled={step !== 'who' && !chosen}>
              {editing && spec ? 'Back to the review' : 'Next'}
            </button>
            <button type="button" className="secondary" onClick={back} disabled={prevStep(answers, step) === null}>
              Back
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {result && (
        <div className="review">
          <h4 ref={heading} tabIndex={-1}>
            Proposed setup: {result.draft.name}, {result.summary.role.toLowerCase()}
          </h4>
          <p className="muted small">
            Nothing has changed yet. <b>Use this setup</b> starts a new draft from it; everything stays editable afterwards, and it stays in this
            browser until saved.
          </p>
          <dl className="answers">
            {steps.map((s) => (
              <div key={s}>
                <dt>{QUESTIONS[s].short}</dt>
                <dd>
                  {answerText(s, answers, result)}{' '}
                  <button type="button" className="secondary small" onClick={() => change(s)} aria-label={`Change: ${QUESTIONS[s].short}`}>
                    Change
                  </button>
                </dd>
              </div>
            ))}
            {!steps.includes('news') && spec?.news && (
              <div>
                <dt>{QUESTIONS.news.short}</dt>
                <dd>
                  {NEWS_INFO[spec.news].label} <span className="muted">(what acting on meeting someone needs)</span>
                </dd>
              </div>
            )}
          </dl>
          <Summary title="What it can do" lines={result.summary.abilities} />
          <Summary title="When it acts" lines={result.summary.behaviour} />
          <Summary title="Example settings, to change in the editor" lines={result.summary.samples} />
          <Summary title="Still up to you or your game" lines={result.summary.integration} />
          <Summary title="Assumed" lines={result.assumptions} />
          <Summary title="Not possible" lines={result.unsupported} />
          <div className="actions">
            <button type="button" onClick={() => onUse(result)} disabled={locked}>
              Use this setup
            </button>
            <button type="button" className="secondary" onClick={back}>
              Back
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
          {locked && <p className="muted small">Waiting for the test bench to finish…</p>}
        </div>
      )}
    </section>
  );
}

function Summary({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      <h5>{title}</h5>
      <ul className="abilities">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </>
  );
}
