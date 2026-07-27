// Shared draft/attachment schemas (pitbull quality/pitbull, GAP 1). Moved from
// apps/mail/lib/schemas.ts + apps/server/src/lib/schemas.ts. The two
// `createDraftData` copies had drifted: the client's was missing `threadId`
// and `fromEmail`, which every real call site already sends (TS excess
// properties went unchecked because nothing on the client actually imported
// this schema/type — it was dead). The server version — which is what
// actually validates the tRPC input — is authoritative here.
import { z } from 'zod';

export const serializedFileSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  lastModified: z.number(),
  base64: z.string(),
});

export const deserializeFiles = async (serializedFiles: z.infer<typeof serializedFileSchema>[]) => {
  return await Promise.all(
    serializedFiles.map((data) => {
      const file = Buffer.from(data.base64, 'base64');
      const blob = new Blob([file], { type: data.type });
      const newFile = new File([blob], data.name, {
        type: data.type,
        lastModified: data.lastModified,
      });
      return newFile;
    }),
  );
};

export const createDraftData = z.object({
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  message: z.string(),
  attachments: z.array(serializedFileSchema).optional(),
  id: z.string().nullable(),
  threadId: z.string().nullable(),
  fromEmail: z.string().nullable(),
});

export type CreateDraftData = z.infer<typeof createDraftData>;
