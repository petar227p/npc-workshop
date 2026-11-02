import type { Sighting, StateView, WorldReport } from '@blacksmith/shared';
// The zod-free module, so the schemas stay out of the bundle.
import { MAX_HAPPENED_LENGTH, MAX_HOURS_AGO, MAX_NOTE_LENGTH } from '@blacksmith/shared/src/limits';
import { useState } from 'react';

// God mode: tell the engine something happened that no verb covers (a boss slain, a fire). A game would report it
// itself; here you type it. The engine logs it with whoever saw it, and gossip carries it from there.
//
// The usual way is a note in your own words: Read it has Muse Spark turn it into a report, shown as a preview, and
// nothing happens until you make it so. The model only drafts; the engine checks the report again when it arrives.
// Fill it in yourself is the form a game would send, field by field.

// onRead: the report Muse Spark reads from a note (the page is locked while it reads); onReport: true once logged.
type Props = { view: StateView; disabled: boolean; onRead: (note: string) => Promise<WorldReport>; onReport: (r: WorldReport) => Promise<boolean> };

const show = (name: string) => name.replace(/_/g, ' ');
const AGO = [0, 1, 2, 3, 6, 12, 24, 48].filter((h) => h <= MAX_HOURS_AGO);
const agoText = (h: number) => (h === 0 ? 'Just now' : h === 1 ? 'An hour ago' : `${h} hours ago`);
// Written as the person typing. The text is logged as typed and villagers read it as a report with no speaker, so an
// "I" or "me" in it is nobody, and each listener takes it as their own. Only Read it makes them the stranger.
const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself|we|us|our)\b/i;

// note: your words, before reading; preview: the report Read it made, to send or change; form: every field by hand.
type Step = 'note' | 'preview' | 'form';

export function God({ view, disabled, onRead, onReport }: Props) {
  const places = view.places;
  const [step, setStep] = useState<Step>('note');
  const [noteText, setNoteText] = useState(''); // what you wrote, kept beside what Read it made of it
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [involved, setInvolved] = useState<string[]>([]);
  const [seen, setSeen] = useState<Sighting['kind']>('nearby');
  const [only, setOnly] = useState<string[]>([]);
  const [notable, setNotable] = useState(false);
  const [ago, setAgo] = useState(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState(false); // the fields came from Read it, so "the stranger" is already worked out
  const [asYou, setAsYou] = useState(false); // Make it so was pressed on first-person text: ask before sending

  // No place until one is picked (or read): a place left over from the last report would put this one in the wrong spot.
  const where = places.includes(place) ? place : '';
  const people = [{ id: 'player', name: 'the stranger' }, ...view.people];
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  // Nothing can have happened before the village's first hour; a reading may name a time between the steps.
  const agos = [...new Set([...AGO, ago])].filter((h) => h <= view.tick).sort((a, b) => a - b);
  const hoursAgo = Math.min(ago, view.tick);
  const long = text.trim().length > MAX_HAPPENED_LENGTH;
  const busy = disabled || reading;

  const readNote = async (note: string) => {
    setReading(true);
    setError(null);
    setAsYou(false);
    try {
      const report = await onRead(note);
      setNoteText(note);
      setText(report.text);
      setPlace(report.place);
      setInvolved(report.involved);
      setSeen(report.seen_by.kind);
      setOnly(report.seen_by.kind === 'only' ? report.seen_by.ids : []);
      setNotable(report.notable);
      setAgo(report.hours_ago);
      setRead(true);
      setStep('preview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  const reset = () => {
    setStep('note');
    setNoteText('');
    setText('');
    setPlace('');
    setInvolved([]);
    setSeen('nearby');
    setOnly([]);
    setNotable(false);
    setAgo(0);
    setError(null);
    setRead(false);
    setAsYou(false);
  };

  // Everything empties only once the engine has logged it: a refused report (or a busy village) keeps what was typed.
  const send = async (anyway = false) => {
    if (!anyway && !read && FIRST_PERSON.test(text)) return setAsYou(true);
    setAsYou(false);
    const seen_by: Sighting = seen === 'only' ? { kind: 'only', ids: only } : { kind: seen };
    if (await onReport({ text, place: where, involved, seen_by, notable, hours_ago: hoursAgo })) reset();
  };

  const sawText = seen === 'everyone' ? 'The whole village' : seen === 'only' ? (only.length ? only.map(nameOf).join(', ') : 'Nobody') : 'Anyone near enough';

  return (
    <section className="panel god">
      <h2>God mode</h2>
      <p className="muted small">Something happened that no action covers. A game would report it; here you write it.</p>
      {error && <p className="tag bad" role="alert">{error}</p>}

      {step === 'note' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            readNote(noteText);
          }}
        >
          <label className="field">
            <span className="field-label">What happened?</span>
            <textarea
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="I killed the troll outside the gate. Its roar woke the whole village."
            />
            <span className="muted small">In your own words. Read it turns this into a report you can check before anything happens.</span>
          </label>
          <div className="actions god-actions">
            <button disabled={busy || !noteText.trim()}>{reading ? 'Reading…' : 'Read it'}</button>
            <button
              type="button"
              className="god-link"
              disabled={busy}
              onClick={() => {
                setText(noteText);
                setRead(false);
                setStep('form');
              }}
            >
              Fill it in yourself
            </button>
          </div>
        </form>
      )}

      {step === 'preview' && (
        <div className="god-preview" aria-live="polite">
          <p className="god-wrote">
            <span className="god-label">You wrote</span>
            {noteText}
          </p>
          <div className="god-report">
            <span className="god-label">Will be logged as</span>
            <p className="god-text">{text}</p>
            <dl>
              <dt>Where</dt>
              <dd>{where ? show(where) : 'No place picked'}</dd>
              <dt>When</dt>
              <dd>{agoText(hoursAgo)}</dd>
              <dt>Took part</dt>
              <dd>{involved.length ? involved.map(nameOf).join(', ') : 'Nobody in particular'}</dd>
              <dt>Saw it</dt>
              <dd>{sawText}</dd>
              {notable && (
                <>
                  <dt>Big news</dt>
                  <dd>Yes: villagers will still talk about it days later</dd>
                </>
              )}
            </dl>
          </div>
          {long && <p className="tag bad">At most {MAX_HAPPENED_LENGTH} characters. Edit the details to shorten it.</p>}
          <div className="actions god-actions">
            <button onClick={() => send()} disabled={busy || long || !where}>
              Make it so
            </button>
            <button type="button" className="secondary" onClick={() => setStep('form')} disabled={busy}>
              Edit details
            </button>
            <button type="button" className="god-link" onClick={reset} disabled={busy}>
              Start over
            </button>
          </div>
        </div>
      )}

      {step === 'form' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="field">
            <span className="field-label">What happened</span>
            <textarea
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setRead(false);
                setAsYou(false);
              }}
              placeholder="The stranger killed the troll outside the gate. Its roar woke the whole village."
            />
            <span className="muted small">As a villager would tell it. The one playing is “the stranger”.</span>
            {long && <span className="tag bad">At most {MAX_HAPPENED_LENGTH} characters.</span>}
          </label>
          <div className="row2">
            <label className="field">
              <span className="field-label">When</span>
              <select value={hoursAgo} onChange={(e) => setAgo(Number(e.target.value))}>
                {agos.map((h) => (
                  <option key={h} value={h}>
                    {agoText(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check god-notable" title="Stays in villagers' minds however much happens after it">
              <input type="checkbox" checked={notable} onChange={(e) => setNotable(e.target.checked)} />
              Big news
            </label>
          </div>
          <label className="field">
            <span className="field-label">Where</span>
            <select value={where} onChange={(e) => setPlace(e.target.value)}>
              <option value="" disabled>
                Pick a place…
              </option>
              {places.map((p) => (
                <option key={p} value={p}>
                  {show(p)}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="field-label">Who took part</span>
            <People people={people} chosen={involved} onToggle={(id) => setInvolved((l) => toggle(l, id))} />
          </div>
          <label className="field">
            <span className="field-label">Who saw it</span>
            <select value={seen} onChange={(e) => setSeen(e.target.value as Sighting['kind'])}>
              <option value="nearby">Anyone near enough</option>
              <option value="everyone">The whole village</option>
              <option value="only">Only…</option>
            </select>
          </label>
          {seen === 'only' && <People people={view.people} chosen={only} onToggle={(id) => setOnly((l) => toggle(l, id))} />}
          {asYou && (
            <div className="god-as-you" role="alert">
              <p>
                <b>Written as yourself?</b> Villagers won’t know who “I” or “me” is, so each one will take it as their own. Read it first, and
                it becomes the stranger: you.
              </p>
              <div className="actions">
                <button type="button" className="small" onClick={() => readNote(text)} disabled={busy}>
                  {reading ? 'Reading…' : 'Read it first'}
                </button>
                <button type="button" className="secondary small" onClick={() => send(true)} disabled={busy || long || !where}>
                  Send as written
                </button>
              </div>
            </div>
          )}
          <div className="actions god-actions">
            <button disabled={busy || !text.trim() || long || !where}>Make it so</button>
            {!where && text.trim() && <span className="muted small">Pick a place first.</span>}
            <button type="button" className="god-link" onClick={reset} disabled={busy}>
              Start over
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function People({ people, chosen, onToggle }: { people: { id: string; name: string }[]; chosen: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="god-people">
      {people.map((p) => (
        <label key={p.id} className="check">
          <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => onToggle(p.id)} />
          {p.name}
        </label>
      ))}
    </div>
  );
}
