import { atom } from 'jotai';

/**
 * Ask Reta conversation state — session-scoped (jotai, in-memory): reopening
 * the panel keeps the exchange; a reload starts clean. Server stays stateless
 * in slice 1 (spec docs/spec/mail-copilot.md).
 */

export type AskRetaCitationView = {
  ref: string;
  threadId: string;
  subject: string;
  sender: string;
  date: string;
  excerptHash: string;
};

export type AskRetaProposalView = {
  kind: 'reply' | 'new';
  to?: string;
  subject?: string;
  bodyHtml: string;
  threadId?: string;
};

export type AskRetaStepView = {
  /** Client-assigned render identity (the server step carries none). */
  id: string;
  kind: 'overview' | 'search' | 'read_thread';
  detail: string;
  sourceRefs: string[];
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
