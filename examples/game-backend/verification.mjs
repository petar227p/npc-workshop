import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

// Temporary, loopback-only UI. Credentials are returned only to a same-origin form POST,
// never to a URL, terminal logger, cross-origin fetch, GET response or file.
/** @param {{ worldId: string; token: string }} credentials */
export async function verificationPage(credentials) {
  let origin = '';
  const nonce = randomBytes(18).toString('base64');
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    if (req.headers.host !== new URL(origin).host || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin' && req.headers['sec-fetch-site'] !== 'none')) {
      res.writeHead(403).end('Open the local verification page directly.'); return;
    }
    const show = req.method === 'POST' && req.url === '/credentials' && req.headers.origin === origin && req.headers['x-verification-ui'] === '1';
    if (!show && !(req.method === 'GET' && req.url === '/')) { res.writeHead(403).end('Use the local form.'); return; }
    if (show) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(credentials)); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local game verification</title>
      <h1>Verify your game in Workshop</h1><p>This page expires in five minutes. Close it after copying. Keep the world token private: it controls this world.</p>
      <form><button>Show verification credentials</button></form><p id="message" role="status"></p>
      <div hidden id="credentials"><p><label>World ID <input readonly autocomplete="off" id="world"></label></p><p><label>World token <textarea readonly autocomplete="off" id="token" rows="2" cols="36"></textarea></label></p></div>
      <script nonce="${nonce}">document.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const response = await fetch('/credentials', {method:'POST', headers:{'X-Verification-UI':'1'}, cache:'no-store', redirect:'error'});
          if (!response.ok) throw new Error();
          const data = await response.json();
          document.getElementById('world').value = data.worldId;
          document.getElementById('token').value = data.token;
          document.getElementById('credentials').hidden = false;
          document.getElementById('message').textContent = 'Copy each value into Workshop’s Verify connection form.';
        } catch { document.getElementById('message').textContent = 'Local page unavailable. Type /verify in the example again.'; }
      });</script></html>`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Cannot open local verification page.');
  origin = `http://127.0.0.1:${address.port}`;
  const close = () => { clearTimeout(timer); server.close(); server.closeAllConnections(); };
  const timer = setTimeout(close, 5 * 60_000);
  timer.unref();
  return { url: origin, close };
}
