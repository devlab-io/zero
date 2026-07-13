import { findAttachments, parseOutgoing } from './google-parse';
import type { GmailTransport } from './google-transport';
import type { IOutgoingMessage } from '../../types';
import { fromBase64Url } from './utils';

export class GmailMessages {
  constructor(private readonly t: GmailTransport) {}

  public async getAttachment(messageId: string, attachmentId: string) {
    return this.t.withErrorHandler(
      'getAttachment',
      async () => {
        const response = await this.t.execute((gmail) =>
          gmail.users.messages.attachments.get({
            userId: 'me',
            messageId,
            id: attachmentId,
          }),
        );

        const attachmentData = response.data.data || '';

        const base64 = fromBase64Url(attachmentData);

        return base64;
      },
      { messageId, attachmentId },
    );
  }

  public async getMessageAttachments(messageId: string) {
    return this.t.withErrorHandler(
      'getMessageAttachments',
      async () => {
        const res = await this.t.execute((gmail) =>
          gmail.users.messages.get({
            userId: 'me',
            id: messageId,
          }),
        );
        const attachmentParts = res.data.payload?.parts
          ? findAttachments(res.data.payload.parts)
          : [];

        const attachments = await Promise.all(
          attachmentParts.map(async (part) => {
            const attachmentId = part.body?.attachmentId;
            if (!attachmentId) {
              return null;
            }

            try {
              const attachmentData = await this.getAttachment(messageId, attachmentId);
              return {
                filename: part.filename || '',
                mimeType: part.mimeType || '',
                size: Number(part.body?.size || 0),
                attachmentId: attachmentId,
                headers:
                  part.headers?.map((h) => ({
                    name: h.name ?? '',
                    value: h.value ?? '',
                  })) ?? [],
                body: attachmentData ?? '',
              };
            } catch {
              return null;
            }
          }),
        ).then((attachments) => attachments.filter((a): a is NonNullable<typeof a> => a !== null));

        return attachments;
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
        const res = await this.t.execute((gmail) =>
          gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'raw',
            quotaUser: this.t.config.auth?.email,
          }),
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
