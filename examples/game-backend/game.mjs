// Run from the repo root: npm run game-example -- --server http://localhost:8787 --bundle /path/to/npc.npc.json
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { benchIdeas, MAX_NPC_BUNDLE_BYTES, MAX_SAY_LENGTH, parseNpcBundle } from '@blacksmith/shared';
import { verificationPage } from './verification.mjs';

/** @typedef {import('@blacksmith/shared').NpcDraft} NpcDraft */
/** @typedef {import('@blacksmith/shared').EngineEvent} EngineEvent */
/** @typedef {import('@blacksmith/shared').ApiResult} ApiResult */
/** @typedef {import('@blacksmith/shared').ApiWorldCreated} ApiWorldCreated */
/** @typedef {(line: string) => void} Output */
/** @typedef {Extract<EngineEvent, { type: 'SIGNALED' }>} SignalEvent */

/** @param {string} file */
export async function readBundle(file) {
  try {
    if ((await stat(file)).size > MAX_NPC_BUNDLE_BYTES) throw new Error('NPC bundle exceeds 2 MiB. Reduce reference pictures or catalogue size.');
    const parsed = parseNpcBundle(await readFile(file, 'utf8'));
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.bundle;
  } catch (error) {
    throw new Error(`Cannot load NPC bundle: ${error instanceof Error ? error.message : 'choose a downloaded .npc.json file'}`);
  }
}

/** @param {string} server */
export function serverOrigin(server) {
  let url;
  try { url = new URL(server); } catch { throw new Error('--server must be a full URL, e.g. http://localhost:8787'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('--server must be an HTTP(S) origin without credentials, a path, query or fragment.');
  }
  return url.origin;
}

/** @param {string} text */
function playerText(text) {
  if (!text.trim() || text.trim().length > MAX_SAY_LENGTH) throw new Error(`Player messages must contain 1–${MAX_SAY_LENGTH} characters.`);
  return text.trim();
}

/**
 * Consume only checked events. Do not also apply result.said or result.signals.
 * The set lives with one world. A real game's durable effects need a durable event cursor/transaction.
 * @param {NpcDraft} npc
 * @param {Output} log
 * @param {(event: SignalEvent) => void} [onSignal] Game-owned implementation, not an instruction parser.
 */
export function eventConsumer(npc, log, onSignal = () => {}) {
  const seen = new Set();
  /** @param {EngineEvent[]} events */
  return (events) => {
    for (const event of events) {
      if (seen.has(event.id)) continue;
      const name = event.actor === npc.id ? npc.name : event.actor;
      switch (event.type) {
        case 'SAID':
          if (event.actor !== 'player') log(`${name}: ${event.data.text}`);
          break;
        case 'CONTRACT_PROPOSED': {
          const c = event.data.contract;
          const item = c.kind === 'in_stock' ? `${c.qty} × ${npc.labels[c.good] ?? c.good}` : c.item_name;
          log(`Checked offer ${c.contract_id}: ${item}, ${c.price} gold. Accept with /accept ${c.contract_id}.`);
          break;
        }
        case 'ACTION_REJECTED':
          log(`Ledger rejected ${event.data.verb ?? 'proposal'}: ${event.data.reason}`);
          break;
        case 'SIGNALED':
          if (event.actor !== npc.id || !Object.hasOwn(npc.signals, event.data.signal)) throw new Error('Received an undeclared signal; no game handler was called.');
          log(`Signal ${event.data.signal} from ${name}: ${npc.signals[event.data.signal]}`);
          onSignal(event); // Only a declared, checked event reaches your game's code.
          break;
        default:
          log(`Checked event ${event.id}: ${event.type}`);
      }
      seen.add(event.id);
    }
  };
}

/**
 * A game's backend connection. The bearer token stays in this closure; no token in URLs, output or files.
 * @param {{ server: string; npc: NpcDraft; log?: Output; fetcher?: typeof fetch; onSignal?: (event: SignalEvent) => void }} options
 */
export async function connectGame({ server, npc, log = console.log, fetcher = fetch, onSignal }) {
  const origin = serverOrigin(server);
  let token = '';
  /** @param {string} path @param {unknown} [body] */
  async function request(path, body) {
    let response;
    try {
      response = await fetcher(`${origin}/api/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new Error('Cannot reach the NPC server, or the request timed out. Check --server and that the server is running. A timed-out action may still finish; it was not retried automatically.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const recovery = response.status === 404 ? 'World unavailable: the server may have restarted or evicted it. Run the example again to create a fresh world.'
        : response.status === 401 ? 'This world token was refused. Run the example again for a new world and token.'
        : response.status === 429 ? 'Quota or log limit reached. For a per-minute limit, wait a minute; for a world call/log limit, create a fresh world.'
        : response.status === 503 ? 'Server/provider unavailable or world storage is full. Check server capacity and the selected model provider key, then try again later.'
        : response.status === 409 ? 'The world is still answering. Wait for the current action to finish before sending another.'
        : response.status === 413 ? 'Payload too large. Reduce reference pictures/catalogue size and download the NPC again.'
        : response.status === 400 ? 'Invalid configuration or action. Fix the reported fields in Workshop and download again, or correct the command.'
        : 'The NPC server could not complete this request. Check its logs and try again later.';
      const detail = typeof data?.error === 'string' ? data.error : 'No JSON error details.';
      throw new Error(`HTTP ${response.status}: ${detail.replaceAll(token || '\0', '[redacted]')}\n${recovery}`);
    }
    if (!data) throw new Error('The NPC server returned an unexpected response; check --server points to the NPC API.');
    return data;
  }

  /** @type {ApiWorldCreated} */
  const created = await request('/worlds', { definitions: [npc] });
  if (!created.world_id || !created.token || !created.state) throw new Error('The server did not return a world and token. Check the NPC server version.');
  token = created.token;
  const path = `/worlds/${encodeURIComponent(created.world_id)}`;
  const consume = eventConsumer(npc, log, onSignal);
  let state = created.state;
  log(`World created for ${npc.name}: ${created.world_id}`);
  log('Token held in this backend process; it is not printed or saved.');

  /** @param {string} action @param {unknown} body */
  async function act(action, body) {
    /** @type {ApiResult} */
    const result = await request(`${path}/${action}`, body);
    // Authoritative totals replace the local inventory view; never add snapshot totals as deltas.
    state = result.state;
    consume(result.events);
    if (!result.ok) log(`Action refused: ${result.reason}`);
    if (result.outcome === 'fallback') log('Fallback: no model proposal passed. This is a safe fallback, not a successful model reply.');
    if (result.outcome === 'unavailable') log('Model unavailable: no successful model reply. Check the selected provider key, outage or call quota; retry later.');
    if (action === 'say' && result.outcome === null && result.ok) log('No model reply: this NPC has no on_spoken_to trigger. Enable it in Workshop and download again to test conversation.');
    log(`Player inventory: ${state.gold} gold; goods ${JSON.stringify(state.goods)}; items ${state.items.length}. Model calls left: ${state.calls_left}.`);
    return result;
  }

  return {
    worldId: created.world_id,
    openVerification: () => verificationPage({ worldId: created.world_id, token }),
    /** @param {string} text */
    say: (text) => act('say', { npc: npc.id, text: playerText(text) }),
    /** @param {string} contractId */
    accept: (contractId) => act('accept', { contract_id: contractId }),
    /** @param {number} hours */
    tick: (hours) => {
      if (!Number.isInteger(hours) || hours < 1 || hours > 48) throw new Error('/tick needs a whole number of hours from 1 to 48.');
      return act('tick', { hours });
    },
    getState: () => state,
    async replayEvents() {
      let since = '';
      for (let page = 0; page < 20; page++) {
        /** @type {import('@blacksmith/shared').ApiEvents} */
        const data = await request(`${path}/events?limit=500${since ? `&since=${encodeURIComponent(since)}` : ''}`);
        consume(data.events);
        if (!data.more) { log('Event log caught up; already handled event IDs were skipped.'); return; }
        if (!data.last_event_id || data.last_event_id === since) break;
        since = data.last_event_id;
      }
      throw new Error('Event catch-up exceeded its page limit. Stop and inspect the world before continuing.');
    },
  };
}

const help = `Usage: npm run game-example -- --server http://localhost:8787 --bundle /path/to/npc.npc.json
  --message "..."     Override the normal request generated from this NPC's abilities.
  --challenge "..."   Override its generated rule challenge (both messages are sent).
  --interactive       Then keep the same world: type messages, /accept ID, /tick HOURS, /events, /verify, /quit.
  --help              Show this help. Node 26 and npm install in this repository are required.`;

/** @param {string[]} argv @param {Output} [log] */
export async function main(argv, log = console.log) {
  const { values } = parseArgs({ args: argv, options: {
    server: { type: 'string' }, bundle: { type: 'string' }, message: { type: 'string' }, challenge: { type: 'string' },
    interactive: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) { log(help); return 0; }
  if (!values.server || !values.bundle) throw new Error(`Both --server and --bundle are required.\n${help}`);
  serverOrigin(values.server);
  const { npc } = await readBundle(values.bundle);
  const ideas = benchIdeas(npc);
  // Check both lines before allocating a world or spending any model calls.
  const normal = playerText(values.message ?? ideas.normal);
  const challenge = playerText(values.challenge ?? ideas.challenges[0]);
  const game = await connectGame({ server: values.server, npc, log, onSignal: (event) => {
    // Replace this callback with your own checks/handlers. Never evaluate model text as game code.
    log(`Game handler needed for ${event.data.signal} (target: ${event.target ?? 'none'}). This example logs the request; your game decides what happens.`);
  } });
  for (const [label, text] of [['Normal request', normal], ['Rule challenge', challenge]]) {
    log(`\n${label}\nYou: ${text}`);
    let result;
    try { result = await game.say(text); }
    catch (error) {
      if (!values.interactive) throw error;
      log(error instanceof Error ? error.message : 'Initial request failed.');
      break; // Keep this world available for /verify and manual recovery.
    }
    if (result.outcome === 'unavailable' || result.outcome === null) {
      if (!values.interactive) return 1;
      break;
    }
  }
  if (values.interactive) {
    log('\nType a message, /accept ID, /tick HOURS, /events, /verify or /quit.');
    /** @type {Awaited<ReturnType<typeof verificationPage>> | undefined} */
    let verification;
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for await (const line of input) {
        const text = line.trim();
        if (text === '/quit') break;
        if (!text) continue;
        try {
          if (text === '/events') await game.replayEvents();
          else if (text === '/verify') {
            verification?.close();
            verification = await game.openVerification();
            log(`Open ${verification.url} in your browser, then use its local form to copy credentials into Workshop. This page expires in five minutes; /verify opens a fresh page.`);
          }
          else if (text.startsWith('/accept ')) await game.accept(text.slice(8).trim());
          else if (text.startsWith('/tick ')) await game.tick(Number(text.slice(6)));
          else if (text.startsWith('/')) log('Commands: /accept ID, /tick HOURS, /events, /verify, /quit.');
          else await game.say(text);
        } catch (error) { log(error instanceof Error ? error.message : 'Request failed.'); }
      }
    } finally { verification?.close(); input.close(); }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Example failed.');
    process.exitCode = 1;
  });
}
