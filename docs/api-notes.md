# API notes: Meta Model API + Baseten

Read from the official docs on 2026-10-27. Anything marked **verify** wasn't stated in the docs and must be confirmed with a real call before code depends on it.

## TL;DR for this project

| Role | Provider | Model id | Endpoint |
|---|---|---|---|
| Smith negotiation | Meta Model API | `muse-spark-1.3` | `POST https://api.meta.ai/v1/chat/completions` |
| Villagers, gossip, crier, attackers | Baseten | `meta-models/muse-spark-open` (**verify**, see below) | `POST https://inference.baseten.co/v1/chat/completions` |
| Item picture | Meta Model API | `muse-image-1.0` | `POST https://api.meta.ai/v1/images/generations` |
| Voice order (optional) | Meta Model API | `muse-voice-transcribe-1.0` | `POST https://api.meta.ai/v1/asr/transcribe` |

Both chat endpoints are OpenAI-compatible, so one client (the `openai` npm package with `baseURL` set) covers both providers.

### Things that change our design

1. **Reasoning can't be turned off** on Muse Spark or Muse Spark Open (`"none"` returns 400). Reasoning tokens count toward the output token limit and are billed as output. Use the lowest effort that works (`minimal` / `low`) for villagers and gossip, and test `low` vs `medium` for the smith. Keep `max_completion_tokens` generous (≥ 4096) or the visible answer can be cut off (`finish_reason: "length"`, empty content).
2. **Structured output is enforced on Meta, but not on Baseten.** Meta constrains decoding to the JSON schema (`response_format: json_schema`). Baseten's docs say Muse Spark Open *accepts* `json_schema` but does **not enforce** it. So for villagers and attackers, Zod validation + one repair retry is mandatory, not optional.
3. **Voice needs WAV.** The transcribe endpoint only takes 16-bit PCM mono WAV at 16 or 24 kHz. Browser MediaRecorder produces webm/opus, so record with an AudioContext and encode WAV in the browser (small, no ffmpeg).
4. **Muse Image is cheap ($0.01/image) but capped at 150 requests/minute.** Fine for one image per delivery. Cache by contract id, never regenerate on page reload.
5. **Non-streaming chat requests have an HTTP 504 time limit** (the value isn't given; streaming is exempt). If smith turns are slow, stream.

## Meta Model API

- Base URL: `https://api.meta.ai/v1`
- Auth: `Authorization: Bearer $MODEL_API_KEY`. Keys look like `LLM_<id>_<secret>`, are shown once, and belong to a team. Rate limits are per team, shared across keys.
- Key creation: Model API dashboard → API keys tab. The docs say nothing about card requirements, regions or hackathon credits. **Verify** at signup (one third-party guide says public preview is US-only).
- Protocols: Chat Completions (`/v1/chat/completions`), Responses (`/v1/responses`), Anthropic-style Messages (at `https://api.meta.ai`, without `/v1`).

### Models

| Model | IDs | Notes |
|---|---|---|
| Muse Spark | `muse-spark-1.3`, `1.2`, `1.1`; discounted `muse-spark-1.3-contributor`, `1.2-contributor` | 1,048,576-token context, tool calls, structured output |
| Muse Wonder | `muse-wonder-1.0` (preview) | Long agentic/coding work; overkill and 4x the price here |
| Muse Image | `muse-image-1.0` | generations, edits, multi-turn via Responses |
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` | speech-to-text only (no text-to-speech) |
| SAM 3.1 | `sam-3.1` | segmentation; not used |
| Muse Spark Open | open weights | **not on Model API**; use a hosted provider (Baseten) |

### Chat Completions (what we'll send)

```json
POST /v1/chat/completions
{
  "model": "muse-spark-1.3",
  "messages": [{ "role": "developer", "content": "..." }, { "role": "user", "content": "..." }],
  "reasoning_effort": "low",
  "max_completion_tokens": 4096,
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "SmithAction", "strict": true, "schema": { "...": "..." } }
  }
}
```

- Answer at `choices[0].message.content` (a JSON string when using `response_format`).
- `developer` role is preferred for instructions (`system` is treated the same).
- `reasoning_effort`: `minimal | low | medium | high | xhigh` (`max` only on 1.3 non-contributor / Wonder). If omitted, the model picks.
- `temperature` 0–2, default 1.0; the docs advise leaving it unset. Don't send both `temperature` and `top_p`.
- **These return 400**: `reasoning_effort: "none"`, `n > 1`, `stop`, `logit_bias`, `logprobs: true`, `max_output_tokens`, `text.format`, `web_search_options`. `frequency_penalty` / `presence_penalty` may error.
- `seed` is deprecated and best-effort, so we can't rely on it for replay. That's why we record responses (REPLAY mode).
- Where reasoning text appears in the response isn't documented: **verify**. We don't need it, but the logger should keep the raw response.

### Structured output

- Chat Completions: `response_format: { type: "json_schema", json_schema: { name, schema, strict } }`. Responses API uses `text.format` instead.
- Decoding is constrained to the schema.
- With `strict: true`: root must be a plain object (no root `anyOf`), no `allOf`/`oneOf` anywhere (`anyOf` below the root is fine), every object needs `additionalProperties: false`, and `required` must list every property.
- Limits: nesting depth 10, 5,000 properties, 1,000 enum values. Recursive schemas are rejected.
- **Our approach:** one schema per agent, with `action` as an enum of the verbs that agent is allowed and every field present (nullable where unused). This avoids root `anyOf` and keeps strict mode legal. Generate the JSON schema from the Zod schemas in `shared/` so there is one source of truth.

### Muse Image

```json
POST /v1/images/generations
{ "model": "muse-image-1.0", "prompt": "...", "n": 1, "size": "1024x1024", "response_format": "b64_json", "output_format": "png" }
```

- Response: `data[].b64_json` or `data[].url` (temporary signed URL, expiry not stated). Default output is webp.
- `size` sets the aspect ratio, not exact pixels. Unknown fields (e.g. `seed`) return 400.
- Optional `reasoning_strength: "low" | "high"` (default high). Try `low` for speed.
- A content-safety block returns 400 with `code: content_policy_violation`. Fall back to a placeholder and keep going.
- Latency isn't stated: **measure it**. Plan stays: start at START_WORK, show at delivery.
- Use `b64_json` and save to disk/server memory so the image survives (signed URLs expire).

### Muse Voice Transcribe

```bash
POST /v1/asr/transcribe   (multipart/form-data)
  request = {"model":"muse-voice-transcribe-1.0","mode":"PUSH_TO_TALK","audioEncoding":"WAV"}
  audio   = <wav file>
```

- WAV only: mono, 16-bit PCM, 16 or 24 kHz. Max 32 MB / 10 minutes.
- Response: `{ sessionId, transcript, audioDurationMs, turns }`. `PUSH_TO_TALK` mode leaves `turns` empty, which is fine.
- $0.18/hour of audio. A realtime WebSocket exists but isn't needed for push-to-talk.

### Pricing and rate limits

| Model | Input / 1M | Output / 1M | Limits |
|---|---|---|---|
| `muse-spark-1.3` (Standard) | $1.25 (cached $0.15) | $4.25 | 3,000 RPM, 4M TPM |
| `muse-spark-1.3-contributor` | $0.10 | $0.20 | **150 RPM**, 3M TPM |
| `muse-image-1.0` | $0.01 / image | | 150 RPM |
| `muse-voice-transcribe-1.0` | $0.18 / audio hour | | 256 concurrent streams |

- **Contributor mode** is ~20x cheaper, but Meta may train on your prompts and responses, and it's capped at 150 RPM. It is chosen **only by the model id** (`muse-spark-1.3-contributor`): no dashboard setting, opt-in or separate key. Decision: development uses it (`SMITH_MODEL` in `.env`); the live judged product switches to Standard by changing that one variable.
- 429 handling: exponential backoff with jitter from ~500 ms, and respect `Retry-After`. Responses carry `x-ratelimit-remaining-requests` / `-tokens` headers, so log them.
- Prompt caching: keep the long, fixed part of each prompt (rules, world description) at the start so it gets cached ($0.15 vs $1.25 per 1M).

## Baseten (Muse Spark Open)

- Base URL: `https://inference.baseten.co/v1` (OpenAI-compatible Model APIs).
- Auth: `BASETEN_API_KEY`, passed as the OpenAI client `api_key`. The docs examples don't say whether the header is `Bearer` or `Api-Key`; the OpenAI SDK sends `Bearer`, which their examples rely on.
- **Model id:** Meta's docs list `meta-models/muse-spark-open` for Baseten. The handoff says `meta-models/muse-spark-open-1026`. **Verify** with `GET https://inference.baseten.co/v1/models` once you have a key, and use whatever it returns.
- Context: the full 1,048,576 tokens on Baseten. Served in NVFP4.
- Tool calling: supported (Baseten launch post).
- Structured output: accepted but **not enforced** for Muse Spark Open. Always validate.
- Reasoning: `reasoning_effort` = `low | medium | high | xhigh`, default **`xhigh`** (slow and expensive for villagers, so always set `low`). Can't be disabled.
- Sampling: recommended temperature 1.0, top_p 1.0. Reasoning + answer share `max_tokens`; the docs' examples use 4,096–16,384.
- Pricing on Baseten specifically: not found in the docs. Other hosts list $1.25 in / $4.25 out per 1M. **Verify** in the Baseten dashboard.
- Rate limits: not documented. **Verify** (check the response headers on the first call).
- Licence: Muse Model License (custom, not OSI). Fine for a hackathon; mention it in the README.

## Verified with real calls (2026-10-27)

- `GET /v1/models` with our key returns: `muse-spark-1.3`, `muse-spark-1.3-contributor`, `muse-spark-1.2`, `muse-spark-1.2-contributor`, `muse-spark-1.1`, `muse-wonder-1.0`, `muse-image-1.0`, `muse-voice-transcribe-1.0`, `sam-3.1`.
- One `muse-spark-1.3-contributor` call, `reasoning_effort: low`, strict `json_schema`: HTTP 200 in 4.6 s, valid JSON in `content`, 241 of 314 completion tokens were reasoning. One sample only; the latency script still needs p50/p95.
- **Reasoning text is not returned** in Chat Completions: `message` has only `content`, `refusal`, `role`; `usage.completion_tokens_details.reasoning_tokens` gives the count.
- Rate-limit headers are present: `x-ratelimit-limit-requests: 150`, `x-ratelimit-remaining-requests`, `x-ratelimit-limit-tokens: 3000000`, `x-ratelimit-remaining-tokens`.

- **Baseten** `GET /v1/models` with our key: 19 models, the only Meta one is **`meta-models/muse-spark-open`** (Meta's docs were right; the handoff's `-1026` slug is wrong). `Authorization: Bearer` works.
- Spark Open, `reasoning_effort: low`, `json_schema`: HTTP 200 in 3.2–3.8 s over 3 calls, valid JSON each time, ~270–380 reasoning tokens. Reasoning text **is** returned here, in `message.reasoning_content`.
- Baseten rate-limit headers: `x-ratelimit-limit-requests: 120`, `x-ratelimit-limit-tokens: 500000` (per minute). Lower than Meta; budget the gossip/attacker calls around 120 RPM.
- **Prompt quality matters:** with a thin system prompt ("You are Odo... Reply as JSON"), the `summary` field came back filled with the model's own meta-reasoning instead of Odo's line. With a prompt that says exactly what the field is ("what Odo says aloud, one sentence, ≤30 words, first person"), both retries were clean and in character. So every agent prompt must define each output field, and the schemas should cap text lengths.

## Latency (measured 2026-10-27, `npm run latency-test`)

Brann's real quote turn (persona + facts + strict schema, ~4.2k characters, a hammerhead-sword order), 5 calls per setup, one at a time, rotating through setups, no retries. With 5 samples p95 is the slowest call. Every one of the 40 chat answers was a `PROPOSE_CONTRACT` the ledger accepted.

| Setup | p50 | p95 | Reasoning tokens | $/turn |
|---|---|---|---|---|
| `muse-spark-1.3-contributor` minimal | 4.5 s | 4.9 s | ~200 | 0.0002 |
| `muse-spark-1.3-contributor` low | 7.0 s | 8.7 s | ~580 | 0.0003 |
| `muse-spark-1.3-contributor` medium | 11.4 s | 12.9 s | ~1150 | 0.0004 |
| `muse-spark-1.3` (Standard) minimal | **2.1 s** | 2.7 s | ~210 | 0.0034 |
| `muse-spark-1.3` (Standard) low | 3.7 s | 4.2 s | ~520 | 0.0048 |
| `muse-spark-1.3` (Standard) medium | 5.8 s | 6.8 s | ~1200 | 0.0077 |
| Spark Open (Baseten) low | 2.4 s | 6.3 s | ~230 | ~0.0034 (est.) |
| Spark Open (Baseten) medium | 3.0 s | 5.1 s | ~360 | ~0.0040 (est.) |
| Muse Image, `reasoning_strength: low` | 9.9 s | 10.5 s | | 0.01 |
| Muse Image, `reasoning_strength: high` | 17.2 s | 29.5 s | | 0.01 |

- **Standard is about twice as fast as contributor** at the same effort, so development feels slower than the live site will.
- **Effort is the main lever:** each step up roughly doubles reasoning tokens and adds 1.5–4 s. At `minimal` Brann's quotes stayed in character with sane prices and stats (130–145 gold for the test order); `medium` reads slightly more natural and uses the themed material (sharkskin) more often.
- **Spark Open honoured the JSON schema 10/10** on this prompt even though Baseten says it isn't enforced. Keep validating; one outlier took 6.3 s.
- **Muse Image** returns 1600×1600 for `size: 1024x1024` (size sets the aspect ratio only), on a plain light background (≈ #EDECE7). `high` follows shape descriptions better (the hammerhead lobes); `low` drew a mallet-like head. Both are slower than a chat turn, so start at START_WORK.
- **Pixel-art sprites work:** prompt for "pixel art game item sprite, thick dark outline, flat shading, plain white background", then post-process (flood-fill the background from the edges, trim, average down to 32×32, ~8-colour palette, 1 px `#3f2631` outline, optionally snap to the Kenney Tiny Dungeon palette). Snapping a *painted* render to the palette gave blotchy rust patches; a pixel-art-prompted render snapped cleanly. Now in the code: `server/src/art/` (prompt, `toSprite`, studio), ~110 ms per conversion.

## Still to verify with real calls

- [x] p50/p95 latency (above).
- [x] Whether Baseten honours `response_format` for Spark Open: it did on 10/10 calls (not enforced, so still validate).
- [ ] Signup: card required? region limits? any hackathon credits?
- [ ] Baseten price (rate limits now known: 120 RPM, 500k TPM).

## Sources

- Meta Model API overview: https://dev.meta.ai/docs/overview
- Chat Completions: https://dev.meta.ai/docs/protocols/chat-completions
- Structured output: https://dev.meta.ai/docs/structured-output
- Reasoning: https://dev.meta.ai/docs/reasoning
- Pricing and rate limits: https://dev.meta.ai/docs/pricing-rate-limits
- Image generation: https://dev.meta.ai/docs/image-generation
- Speech to text: https://dev.meta.ai/docs/speech-to-text
- Authentication: https://dev.meta.ai/docs/authentication
- Muse Spark Open hosted inference: https://dev.meta.ai/docs/muse-spark-open/deploy
- Baseten launch post: https://www.baseten.co/blog/muse-spark-open-launch/
- Baseten structured outputs: https://docs.baseten.co/inference/structured-outputs
