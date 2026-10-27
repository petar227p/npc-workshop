import { loadEnv, REPO_ROOT } from '../config/env';
import { createClient } from './client';
import { createImageClient, type ImageClient } from './image';
import { readLog, replayClient, withRecorder } from './recorder';
import type { ChatClient } from './types';

export * from './types';
export { createClient } from './client';
export { createImageClient, mockImageClient, type ImageClient, type ImageRequest, type ImageResult, type ImageStrength } from './image';
export { mockClient, readLog, replayClient, withRecorder, type LogEntry } from './recorder';

export type Models = {
  smith: { client: ChatClient; model: string };
  villager: { client: ChatClient; model: string };
};

// The player is waiting on the smith: live turns take 5–9 s, so give up well before a minute.
// Worst case per call ≈ 2 × 20 s + backoff; a rejected answer means at most one more call.
const SMITH_LIMITS = { timeoutMs: 20_000, maxAttempts: 2 };

// Real clients from env, each call recorded to logs/<session>.jsonl. REPLAY=<file> plays a recorded log instead.
export function createModels(session: string): Models {
  const env = loadEnv();
  const smithModel = env.SMITH_MODEL ?? 'muse-spark-1.3-contributor';
  const villagerModel = env.VILLAGER_MODEL ?? 'meta-models/muse-spark-open';

  if (env.REPLAY) {
    const log = readLog(env.REPLAY);
    return {
      smith: { client: replayClient(log.filter((e) => e.provider === 'meta')), model: smithModel },
      villager: { client: replayClient(log.filter((e) => e.provider === 'baseten')), model: villagerModel },
    };
  }

  const logFile = `${REPO_ROOT}logs/${session}.jsonl`;
  const need = (name: string) => {
    const v = env[name];
    if (!v) throw new Error(`${name} is not set (see .env.example)`);
    return v;
  };
  return {
    smith: {
      client: withRecorder(
        createClient({
          provider: 'meta',
          baseURL: env.META_BASE_URL ?? 'https://api.meta.ai/v1',
          apiKey: need('MODEL_API_KEY'),
          ...SMITH_LIMITS,
        }),
        logFile,
      ),
      model: smithModel,
    },
    villager: {
      client: withRecorder(
        createClient({
          provider: 'baseten',
          baseURL: env.BASETEN_BASE_URL ?? 'https://inference.baseten.co/v1',
          apiKey: need('BASETEN_API_KEY'),
        }),
        logFile,
      ),
      model: villagerModel,
    },
  };
}

// Muse Image for item pictures. Replays have no pictures (items keep the placeholder).
export function createArtist(): ImageClient {
  const env = loadEnv();
  if (env.REPLAY) throw new Error('no item pictures in REPLAY mode');
  const apiKey = env.MODEL_API_KEY;
  if (!apiKey) throw new Error('MODEL_API_KEY is not set (see .env.example)');
  return createImageClient({ baseURL: env.META_BASE_URL ?? 'https://api.meta.ai/v1', apiKey, model: env.IMAGE_MODEL ?? 'muse-image-1.0' });
}
