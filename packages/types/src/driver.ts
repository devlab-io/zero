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
