import { serve } from '@hono/node-server';
import { createBridge } from './bridge';
import { localApp } from './local';

const bridge = createBridge({ server: process.env.SKYRIM_NPC_SERVER ?? 'http://127.0.0.1:8787' });
serve({ fetch: localApp(bridge).fetch, hostname: '127.0.0.1', port: 8788 }, () => {
  console.log('Skyrim text bridge: http://127.0.0.1:8788 (world credentials remain in memory)');
});
