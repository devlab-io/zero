import { atom } from 'jotai';

/**
 * Ask Reta conversation state — session-scoped (jotai, in-memory): reopening
 * the panel keeps the exchange; a reload starts clean. Server stays stateless
 * in slice 1 (spec docs/spec/mail-copilot.md).
 */

export type AskRetaCitationView =
  | {
      ref: string;
      /** Content citation: server-verified quote, substring of a message body. */
      kind: 'message';
      threadId: string;
      messageId?: string;
      subject: string;
      sender: string;
      date: string;
      excerptHash: string;
      quote: string;
    }
  | {
      ref: string;
      /**
       * Metadata citation (tour 10): deterministic server answer to a
       * strictly-metadata question — fields only, NEVER rendered as a body
       * excerpt.
       */
      kind: 'metadata';
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

/**
 * Capture EXPLICITE du contexte de fil au moment du raccourci (tour 06) :
 * le handler Y fige le threadId ouvert À L'INSTANT de la frappe ; Cmd+J fige
 * « aucun fil » (jamais d'héritage d'un vieux fil). null = pas de capture —
 * la surface retombe alors sur le threadId de l'URL (ouverture bouton/
 * palette). ÉPHÉMÈRE : purgé à la fermeture du panneau, au changement de
 * compte/connexion et à la fermeture du fil. Le serveur reste l'autorité
 * d'ownership sur context.threadId.
 */
export type AskRetaThreadCapture = { threadId: string | null } | null;

export const askRetaThreadCaptureAtom = atom<AskRetaThreadCapture>(null);
