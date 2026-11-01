import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createBridge, nativeFailure, NativePoll } from './bridge';
import { ZodError } from 'zod';
import { spikePoll } from './spike';

export function localApp(bridge: ReturnType<typeof createBridge>, port = 8788) {
  const app = new Hono();
  const csrf = randomBytes(24).toString('hex');
  const origin = `http://127.0.0.1:${port}`;
  app.use('*', async (c, next) => {
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(c.req.header('host') ?? '')) return c.text('Bad host', 403);
    const source = c.req.header('origin');
    if (source && source !== origin) return c.text('Bad origin', 403);
    c.header('Cache-Control', 'no-store');
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${csrf}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
    await next();
  });
  app.use('*', bodyLimit({ maxSize: 16_384 }));
  app.get('/', c => c.html(page(csrf)));
  app.get('/state', c => c.json(bridge.view()));
  app.post('/command', async c => {
    if (c.req.header('origin') !== origin || c.req.header('x-workshop-ui') !== csrf) return c.json({ error: 'Bad UI request' }, 403);
    try {
      const body = await c.req.json();
      bridge.enqueue(body.command, body.session);
      return c.json({ ok: true });
    } catch (e) { return c.json({ error: e instanceof Error ? e.message : 'Invalid command' }, 409); }
  });
  app.post('/skyrim/poll', async c => {
    // Native SKSE_HTTP has no Origin and sends fixed Basic auth; it cannot send the world bearer token.
    if (c.req.header('origin') || !c.req.header('content-type')?.startsWith('application/json')) return c.text('Native JSON requests only', 403);
    let raw: any;
    try { raw = await c.req.json(); return c.json(await bridge.poll(raw)); }
    catch { return c.json({ bridge: 'npc-workshop', session: typeof raw?.session === 'string' ? raw.session : '',
      request: raw?.request ?? 0, plan: '', reset: true, message: 'Bridge/API unavailable or invalid snapshot. Reload a known save after checking the server.' }); }
  });
  app.post('/skyrim/spike/poll', async c => {
    if (c.req.header('origin') || !c.req.header('content-type')?.startsWith('application/json')) return c.text('Native JSON requests only', 403);
    let raw: any;
    try { raw = await c.req.json(); return c.json(await spikePoll(bridge, raw)); }
    catch { return c.json({ bridge: 'npc-workshop', session: typeof raw?.session === 'string' ? raw.session : '',
      request: raw?.request ?? 0, menu: 'npc-workshop-menu-spike', generation: raw?.generation ?? 0,
      plan: '', reset: true, message: 'Menu probe failed. Reload a known save after checking the server.' }); }
  });
  app.post('/skyrim/v2/poll', async c => {
    if (c.req.header('origin') || !c.req.header('content-type')?.startsWith('application/json')) return c.text('Native JSON requests only', 403);
    let raw: unknown;
    try {
      raw = await c.req.json();
      const parsed = NativePoll.safeParse(raw);
      if (parsed.success && parsed.data.command) {
        const original = (raw as { command: { kind: unknown } }).command.kind;
        if (original !== parsed.data.command.kind) console.error('[NWNative] canonicalized command enum', parsed.data.command.kind);
      }
      const reply = await bridge.pollV2(raw);
      if (reply.reset) console.error('[NWNative] recovery', JSON.stringify({ request: reply.request, generation: reply.generation, code: reply.ui.command.code }));
      return c.json(reply);
    } catch (error) {
      const request = NativePoll.safeParse(raw);
      // Paths/codes only: never log player text, packet values, credentials, or raw exceptions.
      console.error('[NWNative] failure', JSON.stringify({ stage: request.success ? 'processing_or_reply' : 'request',
        issues: error instanceof ZodError ? error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })) : [] }));
      return c.json(nativeFailure(raw));
    }
  });
  return app;
}

function page(csrf: string) {
  // Preserve JavaScript escapes such as '\n' in the generated inline script.
  return String.raw`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Brann • Whiterun</title>
<style>body{font:18px system-ui;max-width:760px;margin:40px auto;padding:20px;background:#20201d;color:#f4ead4}button,textarea{font:inherit;padding:10px}textarea{width:95%}#lines{white-space:pre-wrap;max-height:50vh;overflow:auto}button{margin:8px}#error{color:#ffba91}</style>
<h1>Brann at Warmaidens</h1><p>Stand near Brann and press F8 in Skyrim. Type here, then return to the game. Offers need your acceptance; trades use actual Skyrim gold and iron daggers.</p>
<p id="status">Waiting for Skyrim…</p><div id="lines"></div><div id="offers"></div><textarea id="text" maxlength="500" placeholder="What would you charge for an iron dagger?"></textarea><button id="send">Say</button><p id="error"></p>
<script nonce="${csrf}">
let state;const el=id=>document.getElementById(id);
async function command(command){try{const r=await fetch('/command',{method:'POST',headers:{'content-type':'application/json','x-workshop-ui':'${csrf}'},body:JSON.stringify({session:state.session,command})});const b=await r.json();if(!r.ok)throw Error(b.error);el('error').textContent='';}catch(e){el('error').textContent=e.message;}}
el('send').onclick=()=>{if(el('text').value.trim())command({kind:'say',text:el('text').value});};
async function refresh(){try{state=await(await fetch('/state')).json();el('status').textContent=state.fault||(state.connected?(state.fresh?'Connected':'Game paused or in background — queue your message, then return to Skyrim')+' • '+state.gold+' ledger gold'+(state.busy?' • Return to Skyrim to continue…':''):'Waiting for Skyrim');el('lines').textContent=state.messages.join('\n');el('send').disabled=!state.connected||state.busy||!!state.fault;el('offers').replaceChildren();for(const o of state.offers){const b=document.createElement('button');b.textContent='Accept '+o.contract_id+': '+o.qty+' iron dagger(s), '+o.price+' gold';b.disabled=el('send').disabled;b.onclick=()=>command({kind:'accept',contract:o.contract_id,revision:o.revision});el('offers').append(b);}}catch{el('error').textContent='Local bridge disconnected';}setTimeout(refresh,1000);}refresh();
</script></html>`;
}
