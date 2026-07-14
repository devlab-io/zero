import { z } from 'zod';

export const ParsedMessageSchema = z.object({
  id: z.string(),
  connectionId: z.string().optional(),
  title: z.string(),
  subject: z.string(),
  tags: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
  sender: z.object({ name: z.string().optional(), email: z.string() }),
  to: z.array(z.object({ name: z.string().optional(), email: z.string() })),
  cc: z.array(z.object({ name: z.string().optional(), email: z.string() })).nullable(),
  bcc: z.array(z.object({ name: z.string().optional(), email: z.string() })).nullable(),
  tls: z.boolean(),
  listUnsubscribe: z.string().optional(),
  listUnsubscribePost: z.string().optional(),
  receivedOn: z.string(),
  unread: z.boolean(),
  body: z.string(),
  processedHtml: z.string(),
  blobUrl: z.string(),
  decodedBody: z.string().optional(),
  references: z.string().optional(),
  inReplyTo: z.string().optional(),
  replyTo: z.string().optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        attachmentId: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
        body: z.string(),
        headers: z.array(z.object({ name: z.string().nullable(), value: z.string().nullable() })),
      }),
    )
    .optional(),
  isDraft: z.boolean().optional(),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;
