import { useEffect, useRef, useState } from 'react';
import { buildSetup, MAX_SETUP_NAME, MAX_PERSONALITY, type SetupRole, type Teller, type SetupResult } from '@blacksmith/shared/src/setup';
import { benchIdeas } from '@blacksmith/shared/src/handoff';
import { MAX_PERSONA_LENGTH } from '@blacksmith/shared/src/npc-info';
import { markSetupPersonality } from './personality';
import { RoleLogo, ROLE_OPTIONS, type RoleOption } from './RoleLogo';

// `initial` is a role already picked on the starting points, which skips the role step.
export function GuidedSetup({ initial, taken, locked, onUse, onCancel, cancelLabel = 'Cancel' }: { initial?: RoleOption; taken: string[]; locked: boolean; onUse: (result: SetupResult) => void; onCancel: () => void; cancelLabel?: string }) {
  const [step, setStep] = useState(initial ? 1 : 0);
  const [role, setRole] = useState<SetupRole | null>(initial?.role ?? null);
  const [teller, setTeller] = useState<Teller>(initial?.teller ?? 'bard');
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const result = role ? buildSetup({ role, ...(role === 'storyteller' ? { teller } : {}), name, personality }, taken) : null;
  if (result && personality.trim()) {
    const marked = markSetupPersonality(result.draft.persona, personality.replace(/\s+/g, ' ').trim().slice(0, MAX_PERSONALITY).trim());
    if (marked.length <= MAX_PERSONA_LENGTH) result.draft.persona = marked;
  }
  const idea = result ? benchIdeas(result.draft) : null;
  return <section className="panel starters guided" id="starters" aria-labelledby="guide-heading">
    <p className="muted small">Step {step + 1} of 3 · {['Choose a role', 'Make it yours', 'Review and test'][step]}</p>
    <h3 id="guide-heading" ref={heading} tabIndex={-1}>{['What does your character do?', 'Make the character yours', 'Your character is ready to review'][step]}</h3>
    {step === 0 && <>
      <p className="muted small">Choose a starting point. You can change the settings later.</p>
      <fieldset className="role-choices"><legend className="sr-only">Character role</legend>
        {ROLE_OPTIONS.map(option => <label className="role-choice" key={option.logo}>
          <input type="radio" name="guided-role" checked={role === option.role && (!option.teller || teller === option.teller)} onChange={() => { setRole(option.role); if (option.teller) setTeller(option.teller); }} />
          <RoleLogo role={option.logo} />
          <span className="role-choice-copy"><b>{option.label}</b><span>{option.description}</span></span>
        </label>)}
      </fieldset>
    </>}
    {step === 1 && <><p className="muted small">Both fields are optional. Leave them empty to use the example character.</p>
      <label className="field"><span className="field-label">Name</span><input value={name} maxLength={MAX_SETUP_NAME} onChange={e => setName(e.target.value)} placeholder="e.g. Mira" /></label>
      <label className="field"><span className="field-label">Personality</span><textarea rows={3} value={personality} maxLength={MAX_PERSONALITY} onChange={e => setPersonality(e.target.value)} placeholder="e.g. Friendly, but always looking for a good deal." /></label>
    </>}
    {step === 2 && result && <><p><b>{result.draft.name}</b> · {result.summary.role}</p>
      <h4>What they can do</h4><ul className="abilities">{result.summary.abilities.map(x => <li key={x}>{x}</li>)}</ul>
      <h4>When they act</h4><ul className="abilities">{result.summary.behaviour.map(x => <li key={x}>{x}</li>)}</ul>
      <p className="muted small">This creates an editable draft in this browser with example settings. Try a suggested message in an isolated test session. Testing does not publish to the example village.</p>
      {idea && <p><b>Try asking:</b> “{idea.normal}”</p>}
    </>}
    <div className="actions">{step < 2 ? <button type="button" disabled={step === 0 && !role} onClick={() => setStep(step + 1)}>Next</button> : <button type="button" disabled={locked || !result} onClick={() => result && onUse(result)}>Create draft and test</button>}
      {/* A role picked on the starting points goes back there rather than to this setup's own role step. */}
      <button type="button" className="secondary" disabled={step === 0} onClick={() => (initial && step === 1 ? onCancel() : setStep(step - 1))}>Back</button>
      <button type="button" className="secondary" disabled={locked} onClick={onCancel}>{cancelLabel}</button></div>
    {locked && <p className="muted small">Waiting for the test session to finish…</p>}
  </section>;
}
