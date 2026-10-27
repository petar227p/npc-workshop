// One shape for every chat model we call. Meta and Baseten are both OpenAI-compatible; the differences live in client.ts.

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  reasoning_effort?: ReasoningEffort;
  max_tokens?: number; // reasoning + answer share this, so keep it ≥ 4096
  json_schema?: { name: string; schema: Record<string, unknown> };
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number | null;
  cached_tokens: number | null;
};

export type ChatResult = {
  model: string;
  content: string;
  reasoning: string | null; // Baseten returns it; Meta only returns the token count
  finish_reason: string | null;
  usage: Usage | null;
  latency_ms: number;
};

export interface ChatClient {
  readonly provider: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ModelError';
  }
}
