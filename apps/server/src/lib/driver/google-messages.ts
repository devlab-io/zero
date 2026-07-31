import {
  findAttachments,
  findInlineImageParts,
  parseOutgoing,
  partContentId,
} from './google-parse';
import type { GmailTransport } from './google-transport';
import type { IOutgoingMessage } from '../../types';
import { fromBase64Url } from './utils';

export class GmailMessages {
  constructor(private readonly t: GmailTransport) {}

  public async getAttachment(messageId: string, attachmentId: string) {
    return this.t.withErrorHandler(
      'getAttachment',
      async () => {
        const response = await this.t.execute(
          (gmail) =>
            gmail.users.messages.attachments.get({
              userId: 'me',
              messageId,
              id: attachmentId,
            }),
          { retry: true },
        );

        const attachmentData = response.data.data || '';

        const base64 = fromBase64Url(attachmentData);

        return base64;
      },
      { messageId, attachmentId },
    );
  }

  public async getMessageAttachments(messageId: string, options?: { inlineOnly?: boolean }) {
    return this.t.withErrorHandler(
      'getMessageAttachments',
      async () => {
        const res = await this.t.execute(
          (gmail) =>
            gmail.users.messages.get({
              userId: 'me',
              id: messageId,
            }),
          { retry: true },
        );
        // Les images CID inline (exclues de findAttachments) sont servies ici à la
        // demande depuis que parseThread ne les télécharge plus au sync. `inlineOnly`
        // permet au reader de résoudre les refs `cid:` du corps sans télécharger les
        // vraies pièces jointes (potentiellement lourdes) du même message.
        const parts = res.data.payload?.parts ?? [];
        const inlineParts = findInlineImageParts(parts);
        const attachmentParts = (
          options?.inlineOnly ? inlineParts : [...findAttachments(parts), ...inlineParts]
        ).filter((part) => !!part.body?.attachmentId);

        // Un seul round-trip batch pour toutes les pièces jointes du message (issue #31),
        // au lieu d'un `messages.attachments.get` par pièce. `attachmentParts` est pré-filtré
        // sur `attachmentId` défini, donc le `?? ''` est un garde de typage jamais atteint.
        // `batchAttachmentsGet` renvoie un tableau COMPLET (ordre préservé) ou lève sur échec
        // — aucune PJ perdue en silence.
        const datas = await this.t.batchAttachmentsGet(
          attachmentParts.map((part) => ({
            messageId,
            attachmentId: part.body?.attachmentId ?? '',
          })),
        );

        return attachmentParts.map((part, i) => ({
          filename: part.filename || '',
          mimeType: part.mimeType || '',
          size: Number(part.body?.size || 0),
          attachmentId: part.body?.attachmentId || '',
          contentId: partContentId(part),
          headers:
            part.headers?.map((h) => ({
              name: h.name ?? '',
              value: h.value ?? '',
            })) ?? [],
          body: fromBase64Url(datas[i]),
        }));
      },
      { messageId },
    );
  }

  public create(data: IOutgoingMessage) {
    return this.t.withErrorHandler(
      'create',
      async () => {
        const { raw } = await parseOutgoing(data, this.t.config);
        const res = await this.t.execute((gmail) =>
          gmail.users.messages.send({
            userId: 'me',
            requestBody: {
              raw,
              threadId: data.threadId,
            },
          }),
        );
        return res.data;
      },
      { data, email: this.t.config.auth?.email },
    );
  }

  public delete(id: string) {
    return this.t.withErrorHandler(
      'delete',
      async () => {
        const res = await this.t.execute((gmail) =>
          gmail.users.messages.delete({ userId: 'me', id }),
        );
        return res.data;
      },
      { id },
    );
  }

  public getRawEmail(messageId: string) {
    return this.t.withErrorHandler(
      'getRawEmail',
      async () => {
        const res = await this.t.execute(
          (gmail) =>
            gmail.users.messages.get({
              userId: 'me',
              id: messageId,
              format: 'raw',
              quotaUser: this.t.config.auth?.email,
            }),
          { retry: true },
        );

        if (!res.data.raw) {
          throw new Error('No raw email data found');
        }

        const rawEmail = Buffer.from(res.data.raw, 'base64').toString('utf-8');
        return rawEmail;
      },
      { messageId, email: this.t.config.auth?.email },
    );
  }
}
