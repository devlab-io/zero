import { atom } from 'jotai';

/**
 * Ask Reta conversation state — session-scoped (jotai, in-memory): reopening
 * the panel keeps the exchange; a reload starts clean. Server stays stateless
 * in slice 1 (spec docs/spec/mail-copilot.md).
 */

export type AskRetaCitationView = {
  ref: string;
  /** v1 contract: citations are always message-kind with a verified quote. */
  kind: 'message';
  threadId: string;
  messageId?: string;
  subject: string;
  sender: string;
  date: string;
  excerptHash: string;
  quote: string;
};

export type AskRetaProposalView = {
  kind: 'reply' | 'new';
  to?: string;
  subject?: string;
  bodyHtml: string;
  threadId?: string;
};

export type AskRetaStepThreadView = {
  threadId: string;
  subject: string;
  sender: string;
  date: string;
};

export type AskRetaStepView = {
  /** Client-assigned render identity (the server step carries none). */
  id: string;
  kind: 'overview' | 'search' | 'read_thread';
  detail: string;
  sourceRefs: string[];
  /** Search steps: exact metadata thread set + visible/replayable query (slice 2). */
  search?: {
    query: string;
    folder?: string;
    threads: AskRetaStepThreadView[];
  };
};

export type AskRetaAssistantPayload = {
  citations: AskRetaCitationView[];
  proposal?: AskRetaProposalView;
  steps: AskRetaStepView[];
  model: string;
};

export type AskRetaTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  payload?: AskRetaAssistantPayload;
};

export const askRetaConversationAtom = atom<AskRetaTurn[]>([]);
