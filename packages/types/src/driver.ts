import { z } from 'zod';
import { ParsedMessageSchema, type ParsedMessage } from './message';

export interface IGetThreadResponse {
  messages: ParsedMessage[];
  latest?: ParsedMessage;
  hasUnread: boolean;
  totalReplies: number;
  labels: { id: string; name: string }[];
  isLatestDraft?: boolean;
}

export const IGetThreadResponseSchema = z.object({
  messages: z.array(ParsedMessageSchema),
  latest: ParsedMessageSchema.optional(),
  hasUnread: z.boolean(),
  totalReplies: z.number(),
  labels: z.array(z.object({ id: z.string(), name: z.string() })),
});

export interface ParsedDraft {
  id: string;
  to?: string[];
  subject?: string;
  content?: string;
  rawMessage?: {
    internalDate?: string | null;
  };
  cc?: string[];
  bcc?: string[];
}

// V4.1 list-projection (issue #30) — contrat partagé de la projection riche `listThreads`.
// La row de liste se rend depuis ces champs (sujet/expéditeur/date/labels/non-lu) SANS refetch
// (ruling D1 #26). Les champs riches sont OPTIONNELS : les chemins thin (recherche via
// rawListThreads, brouillons, snoozed) restent valides. `IGetThreadsResponse` reste dans
// lib/driver/types (non touché) ; ce type en est un superset structurel.
const threadListLabelSchema = z.object({ id: z.string(), name: z.string() });

export const ThreadListItemSchema = z.object({
  id: z.string(),
  historyId: z.string().nullable(),
  $raw: z.unknown().optional(),
  // Projection riche (#30) — sourcée depuis threads + thread_labels du SQLite du DO.
  // Optionnels NON-nullables : les valeurs DB nulles sont coalescées en `undefined` à la
  // construction (buildThreadProjection) pour rester assignables aux consommateurs existants
  // de listThreads (ex. QuickSearchThread) sans les toucher.
  subject: z.string().optional(),
  sender: z.object({ name: z.string().optional(), email: z.string() }).optional(),
  receivedOn: z.string().optional(),
  labels: z.array(threadListLabelSchema).optional(),
  unread: z.boolean().optional(),
});

export type ThreadListItem = z.infer<typeof ThreadListItemSchema>;

export const ThreadsResponseSchema = z.object({
  threads: z.array(ThreadListItemSchema),
  nextPageToken: z.string().nullable(),
});

export type ThreadsResponse = z.infer<typeof ThreadsResponseSchema>;
