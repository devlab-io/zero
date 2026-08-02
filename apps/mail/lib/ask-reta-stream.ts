/**
 * Ask Reta NDJSON stream consumer (slice 2, spec docs/spec/mail-copilot.md).
 *
 * Talks to the authenticated `/api/ask-reta` endpoint (session cookie,
 * ownership resolved server-side). Steps arrive progressively via `onStep`;
 * the promise resolves with the final deterministic result.
 *
 * Cancellation contract (exact): aborting the given signal aborts the fetch,
 * which fires the server-side request signal — the transport and the
 * pipeline stop immediately (no further step, late results discarded). A
 * provider operation already dispatched server-side (Workers AI inference,
 * DO RPC) may still run to completion there; its output is never delivered.
 */

import type { AskRetaAssistantPayload, AskRetaStepView } from '@/components/copilot/ask-reta-state';

export type AskRetaStreamInput = {
  question: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  context: {
    threadId?: string;
    folder?: 'inbox' | 'sent' | 'archive' | 'spam' | 'trash' | 'bin' | 'draft' | 'snoozed';
    selectedThreadIds?: string[];
    draft?: { subject?: string; to?: string; body?: string };
    attachments?: { name: string; type: string; size: number; text: string }[];
  };
};

export type AskRetaStreamResult = Omit<AskRetaAssistantPayload, 'steps'> & {
  answer: string;
  steps: Omit<AskRetaStepView, 'id'>[];
};

export class AskRetaStreamError extends Error {
  constructor(public readonly reason: 'http' | 'aborted' | 'failed' | 'protocol') {
    super(`Ask Reta stream error: ${reason}`);
    this.name = 'AskRetaStreamError';
  }
}

type StreamEvent =
  | { type: 'step'; step: Omit<AskRetaStepView, 'id'> }
  | { type: 'result'; result: AskRetaStreamResult & { model: string } }
  | { type: 'error'; message: string };

// Anti-flood bounds: a single event and the whole stream are size-capped —
// an oversized or never-terminating flux is a protocol error, not a hang.
const MAX_EVENT_CHARS = 262_144;
const MAX_STREAM_CHARS = 1_000_000;

const isAbortError = (error: unknown, signal: AbortSignal) =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError');

export async function streamAskReta(params: {
  input: AskRetaStreamInput;
  signal: AbortSignal;
  onStep: (step: Omit<AskRetaStepView, 'id'>) => void;
  fetchImpl?: typeof fetch;
  backendUrl?: string;
}): Promise<AskRetaStreamResult & { model: string }> {
  const doFetch = params.fetchImpl ?? fetch;
  const base = params.backendUrl ?? import.meta.env.VITE_PUBLIC_BACKEND_URL;

  try {
    const response = await doFetch(`${base}/api/ask-reta`, {
      method: 'POST',
      credentials: 'include',
      // The CSRF header forces a CORS preflight and is REQUIRED by the route
      // (exact-origin allowlist + explicit header, slice-2 review).
      headers: { 'Content-Type': 'application/json', 'X-Ask-Reta-Csrf': '1' },
      body: JSON.stringify(params.input),
      signal: params.signal,
    });
    if (!response.ok || !response.body) throw new AskRetaStreamError('http');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let totalChars = 0;
    let result: (AskRetaStreamResult & { model: string }) | null = null;

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let event: StreamEvent;
      try {
        event = JSON.parse(line) as StreamEvent;
      } catch {
        throw new AskRetaStreamError('protocol');
      }
      if (event.type === 'step') params.onStep(event.step);
      else if (event.type === 'result') result = event.result;
      else throw new AskRetaStreamError(event.message === 'aborted' ? 'aborted' : 'failed');
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        totalChars += chunk.length;
        if (totalChars > MAX_STREAM_CHARS) throw new AskRetaStreamError('protocol');
        buffered += chunk;
        let newline = buffered.indexOf('\n');
        while (newline !== -1) {
          const line = buffered.slice(0, newline);
          buffered = buffered.slice(newline + 1);
          handleLine(line);
          newline = buffered.indexOf('\n');
        }
        if (buffered.length > MAX_EVENT_CHARS) throw new AskRetaStreamError('protocol');
      }
      handleLine(buffered);
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* already closed */
      }
    }

    if (!result) throw new AskRetaStreamError('protocol');
    return result;
  } catch (error) {
    if (error instanceof AskRetaStreamError) throw error;
    // A fetch/read abort (Stop button, unmount) is a first-class outcome.
    if (isAbortError(error, params.signal)) throw new AskRetaStreamError('aborted');
    throw error;
  }
}
