import type { ModelChoice } from '@blacksmith/shared';
import { loadEnv, REPO_ROOT } from '../config/env';
import { createClient } from './client';
import { createImageClient, type ImageClient } from './image';
import { readLog, replayClient, withRecorder } from './recorder';
import { createTranscriber, type Transcriber } from './voice';
import type { ChatClient } from './types';

export * from './types';
export { createClient } from './client';
export { createImageClient, mockImageClient, type ImageClient, type ImageRequest, type ImageResult, type ImageStrength } from './image';
export { createTranscriber, mockTranscriber, readWav, type Transcriber, type Transcript, type WavInfo } from './voice';
export { mockClient, readLog, replayClient, withRecorder, type LogEntry } from './recorder';

export type ModelClient = { client: ChatClient; model: string };
export type Models = { smith: ModelClient; villager: ModelClient };

// A player waits on every NPC turn: live turns take 2–9 s, so give up well before a minute.
// Worst case per call ≈ 2 × 20 s + backoff; a rejected answer means at most one more call.
const TURN_LIMITS = { timeoutMs: 20_000, maxAttempts: 2 };

// Batch scripts nobody waits on (the exploit suite) can be patient instead: ~1 min of backoff rides out a per-minute limit.
export const BATCH_LIMITS = { timeoutMs: 60_000, maxAttempts: 8 };

// One model choice's client from env, each call recorded to logs/<session>.jsonl. REPLAY=<file> plays a recorded
// log instead. Only that choice's key is needed, so an NPC on Muse Spark works without a Baseten key and back.
export function createModel(session: string, choice: ModelChoice, limits: { timeoutMs: number; maxAttempts: number } = TURN_LIMITS): ModelClient {
  const env = loadEnv();
  const spark = choice === 'muse_spark';
  const model = spark ? (env.SMITH_MODEL ?? 'muse-spark-1.3-contributor') : (env.VILLAGER_MODEL ?? 'meta-models/muse-spark-open-1026');
  const provider = spark ? 'meta' : 'baseten';

  if (env.REPLAY) return { client: replayClient(readLog(env.REPLAY).filter((e) => e.provider === provider)), model };

  const keyName = spark ? 'MODEL_API_KEY' : 'BASETEN_API_KEY';
  const apiKey = env[keyName];
  if (!apiKey) throw new Error(`${keyName} is not set (see .env.example)`);
  const baseURL = spark ? (env.META_BASE_URL ?? 'https://api.meta.ai/v1') : (env.BASETEN_BASE_URL ?? 'https://inference.baseten.co/v1');
  return { client: withRecorder(createClient({ provider, baseURL, apiKey, ...limits }), `${REPO_ROOT}logs/${session}.jsonl`), model };
}

// Both clients, for scripts.
export function createModels(session: string): Models {
  return { smith: createModel(session, 'muse_spark'), villager: createModel(session, 'muse_spark_open') };
}

// Muse Image for item pictures. Replays have no pictures (items keep the placeholder).
export function createArtist(): ImageClient {
  const env = loadEnv();
  if (env.REPLAY) throw new Error('no item pictures in REPLAY mode');
  const apiKey = env.MODEL_API_KEY;
  if (!apiKey) throw new Error('MODEL_API_KEY is not set (see .env.example)');
  return createImageClient({ baseURL: env.META_BASE_URL ?? 'https://api.meta.ai/v1', apiKey, model: env.IMAGE_MODEL ?? 'muse-image-1.0' });
}

// Muse Voice Transcribe for the chat box's mic. Replays have no voice (the player types).
export function createVoice(): Transcriber {
  const env = loadEnv();
  if (env.REPLAY) throw new Error('no voice in REPLAY mode');
  const apiKey = env.MODEL_API_KEY;
  if (!apiKey) throw new Error('MODEL_API_KEY is not set (see .env.example)');
  return createTranscriber({ baseURL: env.META_BASE_URL ?? 'https://api.meta.ai/v1', apiKey, model: env.TRANSCRIBE_MODEL ?? 'muse-voice-transcribe-1.0' });
}
