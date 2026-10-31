import { useEffect, useState } from 'react';
import type { NpcDraft } from '@blacksmith/shared';
import { connectionState, NOT_CONNECTED, pollConnection, readConnection, snapshotHash, type Verification } from './connectionStatus';

const LABELS = { not_connected: 'Not connected', created: 'World created', reply: 'First reply received', unavailable: 'Unavailable or expired', mismatch: 'Configuration mismatch' };

export function ConnectionVerification({ server, npc }: { server: string; npc: NpcDraft }) {
  const [id, setId] = useState('');
  const [token, setToken] = useState('');
  const [session, setSession] = useState<{ id: string; token: string } | null>(null);
  const [result, setResult] = useState<Verification>(NOT_CONNECTED);
  const [done, setDone] = useState(true);
  useEffect(() => {
    if (!session) return;
    setDone(false);
    const hash = snapshotHash(npc);
    return pollConnection(async (signal) => {
      const expected = await hash;
      if (signal.aborted) throw new Error('Cancelled');
      return connectionState(await readConnection(server, session.id, session.token, signal), npc.id, expected);
    }, (value, finished) => { setResult(value); setDone(finished); });
  }, [session, server, npc]);
  const reset = () => { setSession(null); setResult(NOT_CONNECTED); setDone(true); };
  return <div>
    <span className="pill">{LABELS[result.state]}</span>
    <p role="status" aria-live="polite">{result.message}</p>
    <p>In the interactive example, type <code>/verify</code>. Open its temporary local page and copy the world ID and token here. The token can control that world; keep it private.</p>
    <form onSubmit={(e) => { e.preventDefault(); setSession({ id: id.trim(), token: token.trim() }); }} autoComplete="off">
      <div className="connection-fields">
        <label>World ID<input value={id} onChange={(e) => { reset(); setId(e.target.value); }} required maxLength={128} spellCheck={false} autoCapitalize="none" /></label>
        <label>World token<input type="password" value={token} onChange={(e) => { reset(); setToken(e.target.value); }} required maxLength={256} spellCheck={false} autoCapitalize="none" autoComplete="off" /></label>
      </div>
      <div className="connection-top">
        <button type="submit" disabled={!id.trim() || !token.trim()}>{session ? 'Retry verification' : 'Verify connection'}</button>
        <button type="button" className="secondary" onClick={() => { reset(); setId(''); setToken(''); }}>Clear credentials</button>
      </div>
    </form>
    <p className="muted small">{session && (done ? 'Automatic checks stopped. Retry to check again. ' : 'Checking up to six times while this screen is open. ')}Credentials stay in memory and are cleared when you leave, change the server or copy, or choose Clear credentials.</p>
  </div>;
}
