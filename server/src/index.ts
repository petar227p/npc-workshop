import { serve } from '@hono/node-server';
import { loadEnv } from './config/env';
import { createArtist, createModel, createVoice } from './models';
import { clientIpReader, createApi } from './routes/api';

const env = loadEnv();
// Model clients are made on a session's first message, so the server starts even without keys.
const app = createApi({
  makeModel: (sessionId, choice) => createModel(sessionId, choice),
  makeArtist: () => createArtist(),
  makeVoice: () => createVoice(),
  clientIp: clientIpReader(env.TRUST_PROXY_HEADER),
  secureCookie: env.NODE_ENV === 'production',
  // Only `npm run dev` sets this, so a deployed server never writes NPC files.
  canSaveNpcs: env.NPC_EDITOR_SAVE === '1' && env.NODE_ENV !== 'production',
});

const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server on http://localhost:${port}`));
