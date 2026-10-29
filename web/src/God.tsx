import type { Sighting, StateView, TiledMap, WorldReport } from '@blacksmith/shared';
// The zod-free modules, so the schemas stay out of the bundle.
import { MAX_HAPPENED_LENGTH, MAX_HOURS_AGO, MAX_NOTE_LENGTH } from '@blacksmith/shared/src/limits';
import { readVillage } from '@blacksmith/shared/src/village';
import { useEffect, useState } from 'react';
import { api } from './api';

// God mode: tell the engine something happened that no verb covers (a boss slain, a fire). A game would report it
// itself; here you type it. The engine logs it with whoever saw it, and gossip carries it from there. "Read it" has
// Muse Spark fill in the form from your own words; nothing happens until you send it.

type Props = { view: StateView; disabled: boolean; onReport: (r: WorldReport) => Promise<boolean> }; // true once logged

const show = (name: string) => name.replace(/_/g, ' ');
const AGO = [0, 1, 2, 3, 6, 12, 24, 48].filter((h) => h <= MAX_HOURS_AGO);
const agoText = (h: number) => (h === 0 ? 'Just now' : h === 1 ? 'An hour ago' : `${h} hours ago`);

// The map's places, as the server reads them from the same file.
function usePlaces(): string[] {
  const [places, setPlaces] = useState<string[]>([]);
  useEffect(() => {
    fetch('/assets/village.tmj')
      .then((r) => r.json())
      .then((m: TiledMap) => setPlaces(readVillage(m).places.map((p) => p.name)), () => {});
  }, []);
  return places;
}

export function God({ view, disabled, onReport }: Props) {
  const places = usePlaces();
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [involved, setInvolved] = useState<string[]>([]);
  const [seen, setSeen] = useState<Sighting['kind']>('nearby');
  const [only, setOnly] = useState<string[]>([]);
  const [notable, setNotable] = useState(false);
  const [ago, setAgo] = useState(0);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // No place until one is picked (or read): a place left over from the last report would put this one in the wrong spot.
  const where = places.includes(place) ? place : '';
  const people = [{ id: 'player', name: 'the stranger' }, ...view.people];
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  // Nothing can have happened before the village's first hour; a reading may name a time between the steps.
  const agos = [...new Set([...AGO, ago])].filter((h) => h <= view.tick).sort((a, b) => a - b);
  const hoursAgo = Math.min(ago, view.tick);

  const read = async () => {
    setReading(true);
    setNote(null);
    try {
      const { report } = await api.readNote(text);
      setText(report.text);
      setPlace(report.place);
      setInvolved(report.involved);
      setSeen(report.seen_by.kind);
      setNotable(report.notable);
      setAgo(report.hours_ago);
      setNote('Read. Check it, then make it so.');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  // The form empties only once the engine has logged it: a refused report (or a busy village) keeps what was typed.
  const send = async () => {
    const seen_by: Sighting = seen === 'only' ? { kind: 'only', ids: only } : { kind: seen };
    if (!(await onReport({ text, place: where, involved, seen_by, notable, hours_ago: hoursAgo }))) return;
    setText('');
    setPlace('');
    setInvolved([]);
    setSeen('nearby');
    setOnly([]);
    setNotable(false);
    setAgo(0);
    setNote(null);
  };

  const long = text.trim().length > MAX_HAPPENED_LENGTH;
  return (
    <section className="panel god">
      <h2>God mode</h2>
      <p className="muted small">Something happened that no verb covers. A game would report it; here you type it.</p>
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
            onChange={(e) => setText(e.target.value)}
            placeholder="I killed the troll outside the gate. Its roar woke the whole village."
          />
          {long && <span className="tag bad">At most {MAX_HAPPENED_LENGTH} characters: Read it to shorten it, or cut it down.</span>}
        </label>
        <div className="actions god-read">
          <button type="button" className="secondary small" onClick={read} disabled={disabled || reading || !text.trim()} title="Muse Spark fills in the form from your words">
            {reading ? 'Reading…' : 'Read it'}
          </button>
          {note && <span className="muted small">{note}</span>}
        </div>
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
        <div className="actions">
          <button disabled={disabled || reading || !text.trim() || long || !where}>Make it so</button>
        </div>
      </form>
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
