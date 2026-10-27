import { ModelError, type ChatClient, type ChatRequest, type ChatResult } from './types';

export type Provider = 'meta' | 'baseten';

export type ClientOptions = {
  provider: Provider;
  baseURL: string;
  apiKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  maxRetryAfterMs?: number; // a longer Retry-After fails the call instead of hanging the turn
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Meta names the output cap max_completion_tokens; Baseten uses max_tokens. Everything else is shared.
function body(provider: Provider, req: ChatRequest) {
  const maxKey = provider === 'meta' ? 'max_completion_tokens' : 'max_tokens';
  return {
    model: req.model,
    messages: req.messages,
    ...(req.reasoning_effort && { reasoning_effort: req.reasoning_effort }),
    [maxKey]: req.max_tokens ?? 4096,
    ...(req.json_schema && {
      response_format: {
        type: 'json_schema',
        json_schema: { name: req.json_schema.name, strict: true, schema: req.json_schema.schema },
      },
    }),
  };
}

type RawResponse = {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null; reasoning_content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

export function createClient(opts: ClientOptions): ChatClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? wait;
  const maxAttempts = opts.maxAttempts ?? 3;
  const maxRetryAfterMs = opts.maxRetryAfterMs ?? 10_000;
  const url = `${opts.baseURL.replace(/\/$/, '')}/chat/completions`;

  return {
    provider: opts.provider,
    async chat(req) {
      const started = Date.now();
      for (let attempt = 1; ; attempt++) {
        let res: Response;
        try {
          res = await doFetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body(opts.provider, req)),
            signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
          });
        } catch (err) {
          if (attempt < maxAttempts) {
            await sleep(backoff(attempt));
            continue;
          }
          throw new ModelError(`${opts.provider} request failed: ${(err as Error).message}`, null);
        }

        if (!res.ok) {
          const text = (await res.text()).slice(0, 300);
          if (RETRYABLE.has(res.status) && attempt < maxAttempts) {
            const retryAfterMs = Number(res.headers.get('retry-after')) * 1000;
            if (retryAfterMs > maxRetryAfterMs) {
              throw new ModelError(`${opts.provider} ${res.status}: asked to wait ${retryAfterMs / 1000} s, over the ${maxRetryAfterMs / 1000} s limit`, res.status);
            }
            await sleep(retryAfterMs > 0 ? retryAfterMs : backoff(attempt));
            continue;
          }
          throw new ModelError(`${opts.provider} ${res.status}: ${text}`, res.status);
        }

        const raw = (await res.json()) as RawResponse;
        return toResult(raw, req.model, Date.now() - started);
      }
    },
  };
}

// Exponential from ~500 ms with jitter.
function backoff(attempt: number): number {
  return 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

function toResult(raw: RawResponse, model: string, latency_ms: number): ChatResult {
  const choice = raw.choices?.[0];
  const u = raw.usage;
  return {
    model: raw.model ?? model,
    content: choice?.message?.content ?? '',
    reasoning: choice?.message?.reasoning_content ?? null,
    finish_reason: choice?.finish_reason ?? null,
    usage: u
      ? {
          prompt_tokens: u.prompt_tokens ?? 0,
          completion_tokens: u.completion_tokens ?? 0,
          reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? null,
          cached_tokens: u.prompt_tokens_details?.cached_tokens ?? null,
        }
      : null,
    latency_ms,
  };
}
