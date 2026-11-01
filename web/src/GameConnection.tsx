import { useEffect, useRef, useState } from 'react';
import { MODEL_INFO } from '@blacksmith/shared/src/npc-info';
import { abilitiesOf, type Ability } from '@blacksmith/shared/src/setup';

const ABILITY_NAMES: Record<Ability, string> = { talk: 'Conversation', gesture: 'Gestures', sell: 'Selling goods', craft: 'Crafting', grant: 'Free items', knows: 'Knows news', tell: 'Sharing news', retell: 'Retelling news', announce: 'Announcements', signal: 'Game signals', give: 'Gifts' };
import { gameExampleCommand, type HandoffSnapshot } from './gameHandoff';
import { ImportNpcButton } from './ImportNpcButton';
import { ConnectionVerification } from './ConnectionVerification';

export function GameConnection({ snapshot, downloaded, stale, valid, busy, currentName, notice, errors, onBack, onDownload, onImport }: {
  snapshot: HandoffSnapshot;
  downloaded: boolean;
  stale: boolean;
  valid: boolean;
  busy: boolean;
  currentName: string;
  notice: string | null;
  errors: { title: string; errors: string[] } | null;
  onBack: () => void;
  onDownload: () => void;
  onImport: (file: File) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [server, setServer] = useState(() => location.origin);
  const [file, setFile] = useState(snapshot.filename);
  const [copy, setCopy] = useState<string | null>(null);
  const command = gameExampleCommand(server, file);
  const ready = downloaded && !stale;
  useEffect(() => {
    const title = document.title;
    document.title = `Use ${snapshot.npc.name} in your game · NPC Workshop`;
    heading.current?.focus();
    scrollTo(0, 0);
    return () => { document.title = title; };
  }, [snapshot.npc.name]);
  useEffect(() => { setFile(snapshot.filename); setCopy(null); }, [snapshot.filename, snapshot.sourceKey]);
  const copyCommand = async () => {
    if (!command.ok) return;
    try {
      await navigator.clipboard.writeText(command.command);
      setCopy('Command copied.');
    } catch { setCopy('Couldn’t copy automatically. Select and copy the command below.'); }
  };
  return (
    <section className="game-connection" aria-labelledby="game-connection-heading">
      <div className="connection-top">
        <button type="button" className="secondary" onClick={onBack} disabled={busy}>← Back to Workshop</button>
        <ImportNpcButton disabled={busy} onImport={onImport} />
      </div>
      <header className="panel connection-intro">
        <p className="eyebrow">From Workshop to your game</p>
        <h2 id="game-connection-heading" tabIndex={-1} ref={heading}>Use {snapshot.npc.name} in your game</h2>
        <p>Download this character, run the JavaScript backend example, then check its reply and events.</p>
        <dl className="connection-snapshot">
          <div><dt>Character</dt><dd>{snapshot.npc.name} <code>({snapshot.npc.id})</code></dd></div>
          <div><dt>Model</dt><dd>{MODEL_INFO[snapshot.npc.model].label}</dd></div>
          <div><dt>Abilities</dt><dd>{abilitiesOf(snapshot.npc).map((ability) => ABILITY_NAMES[ability]).join(' · ')}</dd></div>
          <div><dt>NPC file</dt><dd><code>{snapshot.filename}</code></dd></div>
        </dl>
        <p className="muted small">This is a fixed copy of the character’s complete settings, including personality, rules and reference pictures. Editing Workshop later does not update a world already running in your game.</p>
        <details className="snapshot-details"><summary>Review this copy’s settings</summary><pre className="code">{JSON.stringify({ ...snapshot.npc, art: { ...snapshot.npc.art, references: `${snapshot.npc.art.references.length} embedded reference picture(s)` } }, null, 2)}</pre></details>
      </header>
      {stale && <div className="connection-stale" role="status"><b>Your downloaded copy needs updating.</b><p>This copy is {snapshot.npc.name}. The current draft, {currentName || 'unnamed NPC'}, has changed. Download the updated NPC before running the example. Existing game worlds keep the older settings.</p>{!valid && <p>Return to Workshop and fix the draft’s validation errors first.</p>}</div>}
      {notice && <div className="note-box" role="status">{notice}</div>}
      {busy && <div className="note-box" role="status">Preparing the NPC file…</div>}
      {errors && <div className="errors" role="alert"><b>{errors.title}</b><ul>{errors.errors.map((error, i) => <li key={i}>{error}</li>)}</ul><p>Your draft and test conversation have been kept.</p></div>}
      <ol className="connection-steps">
        <li className="panel connection-step">
          <span className="step-number" aria-hidden="true">1</span>
          <div><h3>Download NPC</h3>
            <p>{downloaded ? `Download requested: ${snapshot.filename}. Locate the file in your downloads.` : 'Keep a portable copy of this character to pass to your game’s backend.'}</p>
            <button type="button" onClick={onDownload} disabled={busy || !valid}>{stale ? 'Download updated NPC' : downloaded ? 'Download NPC again' : 'Download NPC'}</button>
            <p className="muted small">Includes character settings and embedded reference pictures. Conversations, world progress and generated item pictures are separate. The character sprite uses the bundled sprite sheet.</p>
          </div>
        </li>
        <li className="panel connection-step">
          <span className="step-number" aria-hidden="true">2</span>
          <div><h3>Run the example</h3>
            <p>On your local machine or game backend, open this repository’s folder in a terminal. Use Node 26 and run <code>npm install</code> once. Keep the NPC server running with the selected model’s provider key.</p>
            <div className="connection-fields">
              <label>Server URL<input value={server} onChange={(e) => { setServer(e.target.value); setCopy(null); }} type="url" spellCheck={false} aria-describedby="server-url-help" /></label>
              <label>NPC file path<input value={file} onChange={(e) => { setFile(e.target.value); setCopy(null); }} spellCheck={false} aria-describedby="npc-path-help" /></label>
            </div>
            <p className="muted small" id="server-url-help">Use the address serving this Workshop’s API. For local development, the NPC server is also available at http://localhost:8787.</p>
            <p className="muted small" id="npc-path-help">Enter the downloaded file’s full path if it is in Downloads, or put it in the terminal’s current folder. Use the actual saved filename, including any browser-added suffix. Use a literal path; <code>~</code> and environment variables are not expanded.</p>
            {!ready && <p className="muted small">{stale ? 'Download the updated copy to use these instructions.' : 'Download the NPC first, then run this command.'}</p>}
            {command.ok ? <pre className="code connection-command" tabIndex={0} aria-label="Backend example command">{command.command}</pre> : <p className="error" role="alert">{command.error}</p>}
            <button type="button" className="secondary" onClick={() => void copyCommand()} disabled={busy || !ready || !command.ok}>Copy command</button>
            {copy && <p className="small" role="status">{copy}</p>}
            <p>The example creates a fresh world, sends a normal request and a rule challenge, then stays open. Try <code>/accept ID</code> for a checked offer, <code>/tick 8</code> for deliveries, <code>/events</code> to inspect events, or <code>/quit</code>.</p>
            <p className="muted small">The token stays in backend memory and can be copied from its local verification page. Handle each event once by its ID. Signals ask your game to act; implement those handlers and game rules in your own code. No NPC file saving or server restart is needed.</p>
          </div>
        </li>
        <li className="panel connection-step">
          <span className="step-number" aria-hidden="true">3</span>
          <div><h3>Verify connection</h3>
            {stale ? <p role="status">Not connected to the current draft. Download the updated NPC and run the example again; the old world keeps the older configuration.</p>
              : command.ok ? <ConnectionVerification key={`${server}:${snapshot.sourceKey}`} server={new URL(server).origin} npc={snapshot.npc} />
              : <p>Enter a valid server URL in step 2 before verifying.</p>}
            <p className="muted small">Worlds can be evicted when idle, and a server restart removes them. Run the example again with this file to create a fresh world; it restores the settings, not an old conversation or inventory.</p>
          </div>
        </li>
      </ol>
      <p className="muted small">Import NPC restores another downloaded character through the normal replacement checks and opens a fresh test session. Back to Workshop keeps your current draft and test session.</p>
    </section>
  );
}
