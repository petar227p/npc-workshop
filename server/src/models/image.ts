import { ModelError } from './types';

// Muse Image. One picture per accepted contract, so no retries: a failed render just leaves the placeholder.

export type ImageStrength = 'low' | 'high';
export type ImageRequest = { prompt: string; strength?: ImageStrength };
export type ImageResult = { png: Buffer; latency_ms: number };

export interface ImageClient {
  readonly model: string;
  generate(req: ImageRequest): Promise<ImageResult>;
}

export type ImageClientOptions = { baseURL: string; apiKey: string; model: string; timeoutMs?: number; fetch?: typeof fetch };

export function createImageClient(opts: ImageClientOptions): ImageClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const url = `${opts.baseURL.replace(/\/$/, '')}/images/generations`;
  return {
    model: opts.model,
    async generate(req) {
      const started = Date.now();
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
          // `size` only sets the aspect ratio (a square comes back 1600×1600). Unknown fields are a 400.
          body: JSON.stringify({
            model: opts.model,
            prompt: req.prompt,
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
            output_format: 'png',
            reasoning_strength: req.strength ?? 'high',
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
        });
      } catch (err) {
        throw new ModelError(`image request failed: ${(err as Error).message}`, null);
      }
      // A content-safety block is a 400 with code content_policy_violation; the caller treats every failure the same.
      if (!res.ok) throw new ModelError(`image ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
      const b64 = ((await res.json()) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
      if (!b64) throw new ModelError('image response had no picture', res.status);
      return { png: Buffer.from(b64, 'base64'), latency_ms: Date.now() - started };
    },
  };
}

// For tests: hands back the given pictures in order (an Error is thrown), and records the prompts.
export function mockImageClient(replies: (Buffer | Error)[]): ImageClient & { prompts: ImageRequest[] } {
  const prompts: ImageRequest[] = [];
  return {
    model: 'mock-image',
    prompts,
    async generate(req) {
      prompts.push(req);
      const next = replies[prompts.length - 1];
      if (!next) throw new ModelError('mock image client has no more pictures', null);
      if (next instanceof Error) throw next;
      return { png: next, latency_ms: 0 };
    },
  };
}
