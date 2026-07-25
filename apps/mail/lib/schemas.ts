// serializedFileSchema / deserializeFiles / createDraftData moved to
// packages/types/src/schemas.ts (pitbull quality/pitbull, GAP 1). This copy of
// createDraftData was missing `threadId`/`fromEmail` — every real compose call
// site (email-composer.tsx, reply-composer.tsx) already sends both, but
// nothing in the client actually imported this schema/type, so the gap went
// unnoticed. The server's (authoritative, and actually validated) version
// wins. `serializeFiles` stays local: it uses the browser FileReader API,
// which the server never needed.
export { serializedFileSchema, createDraftData } from '@zero/types';
export type { CreateDraftData } from '@zero/types';
export { deserializeFiles } from '@zero/types';

export const serializeFiles = async (files: File[]) => {
  return await Promise.all(
    files.map(async (file) => {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64String = reader.result as string;
          resolve(base64String.split(',')[1] ?? ''); // Remove the data URL prefix
        };
        reader.readAsDataURL(file);
      });

      return {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        base64,
      };
    }),
  );
};
