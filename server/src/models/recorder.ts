import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ModelError, type ChatClient, type ChatRequest, type ChatResult } from './types';

// Every model call is appended to a JSONL file. Keys live in headers, so nothing secret reaches the log.
export type LogEntry = {
  ts: string;
  provider: string;
  request: ChatRequest;
  response: ChatResult | null;
  error: string | null;
};

export function withRecorder(client: ChatClient, file: string): ChatClient {
  mkdirSync(dirname(file), { recursive: true });
  const write = (entry: LogEntry) => appendFileSync(file, `${JSON.stringify(entry)}\n`);

  return {
    provider: client.provider,
    async chat(request) {
      const ts = new Date().toISOString();
      try {
        const response = await client.chat(request);
        write({ ts, provider: client.provider, request, response, error: null });
        return response;
      } catch (err) {
        write({ ts, provider: client.provider, request, response: null, error: (err as Error).message });
        throw err;
      }
    },
  };
}

// Plays back a recorded log in order, ignoring what is asked. For demo takes, offline UI work and tests.
export function replayClient(entries: LogEntry[], provider = 'replay'): ChatClient {
  let i = 0;
  return {
    provider,
    async chat() {
      const entry = entries[i++];
      if (!entry) throw new ModelError(`replay log exhausted after ${entries.length} calls`, null);
      if (!entry.response) throw new ModelError(entry.error ?? 'recorded call failed', null);
      return entry.response;
    },
  };
}

export function readLog(file: string): LogEntry[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as LogEntry);
}

// Scripted replies for unit tests. A string is returned as the content; an Error is thrown.
export function mockClient(replies: (string | Error)[]): ChatClient & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    provider: 'mock',
    requests,
    async chat(req) {
      requests.push(structuredClone(req));
      const reply = replies[requests.length - 1];
      if (reply === undefined) throw new ModelError('mock has no more replies', null);
      if (reply instanceof Error) throw reply;
      return { model: req.model, content: reply, reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
    },
  };
}
